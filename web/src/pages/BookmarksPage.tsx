import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bookmark, Search, X } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Aside } from '@/components/layout/Aside';
import { PostCard } from '@/components/post/PostCard';
import { PostMenu } from '@/components/post/PostMenu';
import { toast } from '@/stores/toastStore';
import { useFeedStore } from '@/stores/feedStore';
import { ALL_FEED_ITEMS } from '@/mocks/feed';
import { CURRENT_USER } from '@/mocks/currentUser';
import { sharePostLink } from '@/utils/share';
import type { FeedItem } from '@/types/feed';
import styles from './BookmarksPage.module.css';

/**
 * 收藏页
 * 我收藏的动态。
 * 数据源：信息流中 viewer.bookmarked 为真的条目 + 本会话内新加的收藏。
 */
export function BookmarksPage() {
  const navigate = useNavigate();
  const feedItems = useFeedStore((s) => s.items);
  const toggleLike = useFeedStore((s) => s.toggleLike);
  const toggleBookmark = useFeedStore((s) => s.toggleBookmark);
  const removeItem = useFeedStore((s) => s.removeItem);
  const updateItem = useFeedStore((s) => s.updateItem);

  /** 本地快照：进入页面时锁定收藏集合，取消收藏后就地移除（不触发整页重排） */
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  /** 「更多」菜单：锚点 + 目标动态 */
  const [menu, setMenu] = useState<{ item: FeedItem; point: { x: number; y: number } } | null>(
    null,
  );

  const bookmarked = useMemo(() => {
    const pool = feedItems.length > 0 ? feedItems : ALL_FEED_ITEMS;
    const base = pool.filter((i) => i.status === 'published' && i.viewer.bookmarked);
    /* 兜底：mock 里收藏量不足时补几条，保证页面不空 */
    const list = base.length >= 4 ? base : [...base, ...ALL_FEED_ITEMS.slice(30, 36)];
    return list.filter((i) => !removed.has(i.content_id));
  }, [feedItems, removed]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bookmarked;
    return bookmarked.filter(
      (i) =>
        i.text.toLowerCase().includes(q) || i.author.nickname.toLowerCase().includes(q),
    );
  }, [bookmarked, query]);

  const onUnbookmark = useCallback(
    (contentId: string) => {
      toggleBookmark(contentId);
      setRemoved((prev) => new Set(prev).add(contentId));
      toast.success('已取消收藏');
    },
    [toggleBookmark],
  );

  return (
    <AppShell aside={<Aside />}>
      <div className={styles.page}>
        <div className={styles.page__main}>
          <header className={styles.head}>
            <h1 className={styles.head__title}>收藏</h1>
            <span className={styles.head__count}>{filtered.length} 条</span>
          </header>

          <div className={styles.searchWrap}>
            <span className={styles.searchWrap__icon}>
              <Search size={17} strokeWidth={2} aria-hidden />
            </span>
            <input
              className={styles.searchWrap__input}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="在收藏中搜索"
              aria-label="在收藏中搜索"
            />
            {query ? (
              <button
                type="button"
                className={styles.searchWrap__clear}
                aria-label="清空搜索"
                onClick={() => setQuery('')}
              >
                <X size={16} strokeWidth={2.2} aria-hidden />
              </button>
            ) : null}
          </div>

          {filtered.length === 0 ? (
            <div className={styles.empty}>
              <Bookmark size={26} strokeWidth={1.6} aria-hidden />
              <h2 className={styles.empty__title}>
                {query ? '没有匹配的收藏' : '还没有收藏任何动态'}
              </h2>
              <p className={styles.empty__desc}>
                {query
                  ? '换个关键词，或者清空搜索看看全部收藏。'
                  : '在动态下方的书签图标处点击即可收藏，方便以后回看。'}
              </p>
              <button
                type="button"
                className={styles.empty__btn}
                onClick={() => (query ? setQuery('') : navigate('/'))}
              >
                {query ? '清空搜索' : '去信息流看看'}
              </button>
            </div>
          ) : (
            filtered.map((item) => (
              <PostCard
                key={item.content_id}
                item={{ ...item, viewer: { ...item.viewer, bookmarked: true } }}
                onLike={() => toggleLike(item.content_id)}
                onShare={() => sharePostLink(item.content_id)}
                onBookmark={() => onUnbookmark(item.content_id)}
                onReply={() => navigate(`/post/${item.content_id}`)}
                onMore={(target, point) => setMenu({ item: target, point })}
              />
            ))
          )}

          <div className={styles.tail} />
        </div>
      </div>

      {/* ---------- 动态操作菜单 ---------- */}
      <PostMenu
        point={menu?.point ?? null}
        item={menu?.item ?? null}
        mine={menu?.item.author.handle === CURRENT_USER.handle}
        onClose={() => setMenu(null)}
        onUpdated={updateItem}
        onRemoved={(target) => {
          setRemoved((prev) => new Set(prev).add(target.content_id));
          removeItem(target.content_id);
        }}
      />
    </AppShell>
  );
}
