/**
 * 信息流状态（zustand）
 * 无限滚动、预取、乐观更新
 */
import { create } from 'zustand';
import type { FeedItem, FeedTab } from '@/types/feed';
import { fetchFeed } from '@/mocks/api';

type LoadState = 'idle' | 'loading' | 'loadingMore' | 'ready' | 'error' | 'end';

interface FeedState {
  tab: FeedTab;
  items: FeedItem[];
  cursor: string | null;
  hasMore: boolean;
  state: LoadState;
  errorMessage: string | null;
  /** 本次会话已看过的 content_id（客户端去重） */
  seen: Set<string>;
  /** 上次拉取的时间锚点，用于"↑ N 条新内容" */
  lastFetchedAt: number | null;

  switchTab: (tab: FeedTab) => void;
  loadInitial: () => Promise<void>;
  loadMore: () => Promise<void>;
  retry: () => Promise<void>;
  /** 乐观更新点赞 */
  toggleLike: (contentId: string) => void;
  toggleBookmark: (contentId: string) => void;
  /** 从信息流移除（删除 / 不感兴趣） */
  removeItem: (contentId: string) => void;
  /** 就地替换一条（编辑动态后） */
  updateItem: (item: FeedItem) => void;
  /** 发布成功后置顶插入 */
  prependItem: (item: FeedItem) => void;
}

/** 模拟点赞/转推请求（Demo：90% 成功，用于验证回滚） */
function simulateToggle(): Promise<boolean> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(Math.random() > 0.1), 260);
  });
}

export const useFeedStore = create<FeedState>((set, get) => ({
  tab: 'for_you',
  items: [],
  cursor: null,
  hasMore: true,
  state: 'idle',
  errorMessage: null,
  seen: new Set<string>(),
  lastFetchedAt: null,

  switchTab: (tab) => {
    if (get().tab === tab) return;
    set({
      tab,
      items: [],
      cursor: null,
      hasMore: true,
      state: 'idle',
      errorMessage: null,
      seen: new Set<string>(),
    });
    void get().loadInitial();
  },

  loadInitial: async () => {
    set({ state: 'loading', errorMessage: null });
    try {
      const page = await fetchFeed({ tab: get().tab, limit: 20 });
      const seen = new Set(page.items.map((i) => i.content_id));
      set({
        items: page.items,
        cursor: page.next_cursor,
        hasMore: page.has_more,
        state: page.items.length === 0 ? 'end' : 'ready',
        seen,
        lastFetchedAt: Date.now(),
      });
    } catch {
      set({ state: 'error', errorMessage: '网络异常，请稍后重试' });
    }
  },

  loadMore: async () => {
    const { state, hasMore, cursor, tab } = get();
    if (!hasMore || state === 'loadingMore' || state === 'loading') return;
    set({ state: 'loadingMore' });
    try {
      const page = await fetchFeed({ tab, cursor, limit: 20 });
      const seen = new Set(get().seen);
      // 客户端会话内去重
      const fresh = page.items.filter((i) => !seen.has(i.content_id));
      fresh.forEach((i) => seen.add(i.content_id));

      set({
        items: [...get().items, ...fresh],
        cursor: page.next_cursor,
        hasMore: page.has_more,
        state: page.has_more ? 'ready' : 'end',
        seen,
      });
    } catch {
      set({ state: 'error', errorMessage: '加载更多失败' });
    }
  },

  retry: async () => {
    const { items, state } = get();
    if (items.length === 0 || state === 'error') {
      await get().loadInitial();
    } else {
      set({ state: 'ready' });
      await get().loadMore();
    }
  },

  toggleLike: (contentId) => {
    const before = get().items;
    set({
      items: patch(before, contentId, (it) => ({
        ...it,
        viewer: { ...it.viewer, liked: !it.viewer.liked },
        counters: {
          ...it.counters,
          like: it.counters.like + (it.viewer.liked ? -1 : 1),
        },
      })),
    });

    void simulateToggle().then((ok) => {
      // 失败则回滚到操作前的快照
      if (!ok) set({ items: before });
    });
  },

  toggleBookmark: (contentId) => {
    set({
      items: patch(get().items, contentId, (it) => ({
        ...it,
        viewer: { ...it.viewer, bookmarked: !it.viewer.bookmarked },
      })),
    });
  },

  removeItem: (contentId) => {
    set({ items: get().items.filter((i) => i.content_id !== contentId) });
  },

  updateItem: (item) => {
    set({ items: patch(get().items, item.content_id, () => item) });
  },

  prependItem: (item) => {
    set({ items: [item, ...get().items] });
  },
}));

function patch(
  items: FeedItem[],
  contentId: string,
  fn: (item: FeedItem) => FeedItem,
): FeedItem[] {
  return items.map((it) => (it.content_id === contentId ? fn(it) : it));
}
