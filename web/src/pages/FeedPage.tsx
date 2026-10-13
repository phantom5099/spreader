import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Keyboard, Sparkles } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Aside } from '@/components/layout/Aside';
import { FeedTabs } from '@/components/feed/FeedTabs';
import { NewContentBanner } from '@/components/feed/NewContentBanner';
import { PostCard } from '@/components/post/PostCard';
import { PostMenu } from '@/components/post/PostMenu';
import { PostCardSkeleton } from '@/components/post/PostCardSkeleton';
import {
  FeedEmpty,
  FeedEnd,
  FeedError,
  FeedLoadingMore,
} from '@/components/feed/FeedStates';
import { useFeedStore } from '@/stores/feedStore';
import { fetchFeed } from '@/mocks/api';
import { CURRENT_USER } from '@/mocks/currentUser';
import { sharePostLink } from '@/utils/share';
import type { FeedItem, FeedTab } from '@/types/feed';
import styles from './FeedPage.module.css';

/** 距底部多少屏开始预取下一页（提前 1.5 屏） */
const PREFETCH_SCREENS = 1.5;
/** 距上次拉取多久才提示"新内容" */
const NEW_CONTENT_AFTER_MS = 60_000;

export function FeedPage() {
  const navigate = useNavigate();
  const location = useLocation();

  /* 逐字段订阅：zustand 的 action 引用是稳定的，
     而整店订阅（useFeedStore()）会让任何字段变化都触发本页重渲染。 */
  const tab = useFeedStore((s) => s.tab);
  const items = useFeedStore((s) => s.items);
  const state = useFeedStore((s) => s.state);
  const errorMessage = useFeedStore((s) => s.errorMessage);
  const hasMore = useFeedStore((s) => s.hasMore);
  const switchTab = useFeedStore((s) => s.switchTab);
  const loadInitial = useFeedStore((s) => s.loadInitial);
  const loadMore = useFeedStore((s) => s.loadMore);
  const retry = useFeedStore((s) => s.retry);
  const toggleLike = useFeedStore((s) => s.toggleLike);
  const toggleBookmark = useFeedStore((s) => s.toggleBookmark);
  const removeItem = useFeedStore((s) => s.removeItem);
  const updateItem = useFeedStore((s) => s.updateItem);

  const [newItems, setNewItems] = useState<FeedItem[]>([]);
  const [showNote, setShowNote] = useState(true);
  /** 「更多」菜单：锚点 + 目标动态 */
  const [menu, setMenu] = useState<{ item: FeedItem; point: { x: number; y: number } } | null>(
    null,
  );
  const scrolledRef = useRef(false);

  /* -------------------- 首次进入拉取 -------------------- */
  useEffect(() => {
    if (useFeedStore.getState().state === 'idle') {
      void loadInitial();
    }
  }, [loadInitial]);

  /* -------------------- 无限滚动：1.5 屏预取 -------------------- */
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (useFeedStore.getState().state !== 'ready') return;
        void loadMore();
      },
      { rootMargin: `0px 0px ${Math.round(window.innerHeight * PREFETCH_SCREENS)}px 0px` },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, items.length]);

  /* -------------------- 滚动离顶标记（决定是否提示新内容）-------------------- */
  useEffect(() => {
    const onScroll = () => {
      scrolledRef.current = window.scrollY > 400;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* -------------------- 静默轮询：产生"↑ N 条新内容" -------------------- */
  useEffect(() => {
    const timer = window.setInterval(async () => {
      const s = useFeedStore.getState();
      if (s.state !== 'ready' || !s.lastFetchedAt) return;
      if (Date.now() - s.lastFetchedAt < NEW_CONTENT_AFTER_MS) return;
      if (!scrolledRef.current) return;

      try {
        // 用最新游标拉一次"当前时间之后"的内容：Demo 用首屏结果模拟新内容
        const page = await fetchFeed({ tab: s.tab, limit: 3 });
        const seen = s.seen;
        const fresh = page.items.filter((i) => !seen.has(i.content_id));
        if (fresh.length > 0) setNewItems(fresh);
      } catch {
        /* 轮询失败静默忽略 */
      }
    }, 25_000);

    return () => window.clearInterval(timer);
  }, []);

  /* -------------------- 点击"新内容"：回顶并合并 -------------------- */
  const consumeNewItems = useCallback(() => {
    setNewItems((prev) => {
      if (prev.length > 0) {
        const s = useFeedStore.getState();
        const seen = new Set(s.seen);
        prev.forEach((i) => seen.add(i.content_id));
        useFeedStore.setState({
          items: [...prev, ...s.items],
          seen,
          lastFetchedAt: Date.now(),
        });
      }
      return [];
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  /* -------------------- 键盘快捷键：N 发帖 / R 刷新 -------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      /* 浮层式发布页盖在上面时本页仍挂在下面。react-router 在渲染背景路由时
         useLocation() 返回的仍是首页，所以要靠浏览器真实 URL 判断"我是不是最上层"，
         不是就不响应全局快捷键。 */
      if (window.location.pathname !== '/') return;

      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        navigate('/compose', { state: { background: location } });
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        void retry();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, retry, location]);

  /* -------------------- 手势：双指下拉刷新（触屏）-------------------- */
  useEffect(() => {
    let startY = 0;
    let pulling = false;
    const onTouchStart = (e: TouchEvent) => {
      if (window.location.pathname !== '/') return;
      if (window.scrollY > 0) return;
      startY = e.touches[0]?.clientY ?? 0;
      pulling = true;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (window.location.pathname !== '/') return;
      if (!pulling) return;
      pulling = false;
      const endY = e.changedTouches[0]?.clientY ?? 0;
      if (endY - startY > 90) void retry();
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [retry]);

  /* -------------------- 渲染 -------------------- */
  const isInitialLoading = state === 'loading' && items.length === 0;
  const isInitialError = state === 'error' && items.length === 0;
  const isEmpty = state === 'end' && items.length === 0;

  const handleTab = (next: FeedTab) => {
    setNewItems([]);
    window.scrollTo({ top: 0 });
    switchTab(next);
  };

  return (
    <AppShell aside={<Aside />}>
      <a href="#feed-list" className={styles.skipLink}>
        跳到内容列表
      </a>

      <div className={styles.page}>
        <div className={styles.page__main}>
          <FeedTabs value={tab} onChange={handleTab} />

          <div className={styles.page__content}>
            {showNote ? (
              <div className={styles.devNote}>
                <span className={styles.devNote__badge}>DEMO</span>
                <span style={{ flex: '1 1 auto' }}>
                  静态演示：数据为本地 mock，交互（点赞/收藏/分享）会模拟 10% 失败以验证回滚。
                </span>
                <button
                  type="button"
                  aria-label="关闭提示"
                  onClick={() => setShowNote(false)}
                  style={{ flex: '0 0 auto', fontWeight: 700 }}
                >
                  ×
                </button>
              </div>
            ) : null}

            <NewContentBanner
              count={newItems.length}
              avatars={newItems.map((i) => i.author.avatar_url)}
              onClick={consumeNewItems}
            />

            <div id="feed-list">
              {/* 首屏骨架 */}
              {isInitialLoading ? <PostCardSkeleton count={6} /> : null}

              {/* 首屏错误 */}
              {isInitialError ? <FeedError message={errorMessage} onRetry={() => void retry()} /> : null}

              {/* 空列表 */}
              {isEmpty ? <FeedEmpty tab={tab} /> : null}

              {/* 列表 */}
              {items.map((item) => (
                <PostCard
                  key={item.content_id}
                  item={item}
                  allowAutoplay
                  onLike={() => toggleLike(item.content_id)}
                  onShare={() => sharePostLink(item.content_id)}
                  onBookmark={() => toggleBookmark(item.content_id)}
                  onReply={() => navigate(`/post/${item.content_id}`)}
                  onMore={(target, point) => setMenu({ item: target, point })}
                />
              ))}

              {/* 加载更多 */}
              {state === 'loadingMore' ? <FeedLoadingMore /> : null}

              {/* 触底哨兵 + 到底提示 */}
              {items.length > 0 && hasMore ? <div ref={sentinelRef} style={{ height: 1 }} /> : null}
              {items.length > 0 && state === 'end' ? <FeedEnd tab={tab} /> : null}

              {/* 加载更多失败 */}
              {state === 'error' && items.length > 0 ? (
                <FeedError message={errorMessage} onRetry={() => void retry()} />
              ) : null}
            </div>
          </div>

          <footer
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '16px 16px 32px',
              color: 'var(--text-secondary)',
              fontSize: 'var(--font-xs)',
            }}
          >
            <Keyboard size={14} strokeWidth={2} aria-hidden />
            <span>快捷键：N 发帖 · R 刷新</span>
            <Sparkles size={13} strokeWidth={2} style={{ marginLeft: 'auto' }} aria-hidden />
            <span>spreader demo</span>
          </footer>
        </div>
      </div>

      {/* ---------- 动态操作菜单（卡片右上 ⋯）---------- */}
      <PostMenu
        point={menu?.point ?? null}
        item={menu?.item ?? null}
        mine={menu?.item.author.handle === CURRENT_USER.handle}
        onClose={() => setMenu(null)}
        onUpdated={updateItem}
        onRemoved={(target) => removeItem(target.content_id)}
      />
    </AppShell>
  );
}
