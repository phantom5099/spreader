import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Hash, MoreHorizontal, TrendingUp } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Aside } from '@/components/layout/Aside';
import { PostCard } from '@/components/post/PostCard';
import { PostCardSkeleton } from '@/components/post/PostCardSkeleton';
import { FollowButton } from '@/components/profile/FollowButton';
import { toast } from '@/stores/toastStore';
import { useFeedStore } from '@/stores/feedStore';
import { ALL_FEED_ITEMS, TRENDS } from '@/mocks/feed';
import { findTopic } from '@/mocks/topics';
import { coverDataUri } from '@/mocks/users';
import { formatCount } from '@/utils/format';
import styles from './TopicPage.module.css';

type TopicTab = 'top' | 'latest' | 'media';

/**
 * 话题页
 * 简介 + 动态数 + 聚合列表 + 关注按钮。
 * 关注话题的入口与管理归名单管理页第三 Tab。
 */
export function TopicPage() {
  const { topic = '' } = useParams();
  const navigate = useNavigate();
  const name = decodeURIComponent(topic);

  const [tab, setTab] = useState<TopicTab>('top');
  const [loading, setLoading] = useState(true);
  const [followed, setFollowed] = useState(false);

  const toggleLike = useFeedStore((s) => s.toggleLike);
  const toggleRepost = useFeedStore((s) => s.toggleRepost);
  const toggleBookmark = useFeedStore((s) => s.toggleBookmark);

  const cover = useMemo(() => coverDataUri(`topic_${name}`), [name]);

  /** 话题元信息：优先取话题广场的登记信息，其次趋势池，都没有则确定性派生 */
  const meta = useMemo(() => {
    const known = findTopic(name);
    if (known) return { post_count: known.post_count, category: known.category };
    const hit = TRENDS.find((t) => t.topic === name);
    if (hit) return { post_count: hit.post_count, category: hit.category };
    const seed = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
    return { post_count: 3000 + (seed % 60000), category: '话题' };
  }, [name]);

  const items = useMemo(() => {
    const published = ALL_FEED_ITEMS.filter((i) => i.status === 'published');
    const seed = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
    const start = seed % Math.max(1, published.length - 14);
    const slice = published.slice(start, start + 14);
    if (tab === 'media') {
      const withMedia = slice.filter((i) => i.media.length > 0);
      return withMedia.length > 0 ? withMedia : slice;
    }
    if (tab === 'latest') {
      return [...slice].sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
    }
    return [...slice].sort((a, b) => b.counters.like - a.counters.like);
  }, [name, tab]);

  useEffect(() => {
    setLoading(true);
    const t = window.setTimeout(() => setLoading(false), 260);
    return () => window.clearTimeout(t);
  }, [name, tab]);

  const toggleFollow = useCallback(
    (next: boolean) => {
      setFollowed(next);
      toast.success(next ? `已关注 #${name}` : `已取消关注 #${name}`);
    },
    [name],
  );

  return (
    <AppShell aside={<Aside />}>
      <div className={styles.page}>
        <div className={styles.page__main}>
          {/* ---------- 顶栏 ---------- */}
          <header className={styles.bar}>
            <button
              type="button"
              className={styles.bar__back}
              aria-label="返回"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft size={20} strokeWidth={2} aria-hidden />
            </button>
            <div className={styles.bar__title}>
              <h1 className={styles.bar__name}>#{name}</h1>
              <span className={styles.bar__sub}>{formatCount(meta.post_count)} 条动态</span>
            </div>
            <button
              type="button"
              className={styles.bar__icon}
              aria-label="更多操作"
              onClick={() => toast.show('更多操作（Demo 未实现）')}
            >
              <MoreHorizontal size={20} strokeWidth={2} aria-hidden />
            </button>
          </header>

          {/* ---------- 封面 + 简介 ---------- */}
          <div className={styles.cover}>
            <img src={cover} alt="" aria-hidden />
          </div>

          <section className={styles.head}>
            <span className={styles.head__badge} aria-hidden>
              <Hash size={24} strokeWidth={2.2} />
            </span>
            <h2 className={styles.head__title}>#{name}</h2>
            <p className={styles.head__desc}>
              {meta.category}类话题。关注后，相关的新动态会优先出现在你的推荐流中。
            </p>

            <div className={styles.head__meta}>
              <span className={styles.head__metaItem}>
                <TrendingUp size={15} strokeWidth={1.9} aria-hidden />
                {formatCount(meta.post_count)} 条动态
              </span>
              <span className={styles.head__metaItem}>
                <Hash size={15} strokeWidth={1.9} aria-hidden />
                {meta.category}
              </span>
            </div>

            <div className={styles.head__action}>
              <FollowButton
                relation={followed ? 'following' : 'none'}
                following={followed}
                isSelf={false}
                onChange={toggleFollow}
              />
            </div>
          </section>

          {/* ---------- 三 Tab ---------- */}
          <div className={styles.tabs} role="tablist" aria-label="话题内容分类">
            {(
              [
                { key: 'top', label: '热门' },
                { key: 'latest', label: '最新' },
                { key: 'media', label: '媒体' },
              ] as Array<{ key: TopicTab; label: string }>
            ).map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={[styles.tab, active ? styles['tab--active'] : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* ---------- 列表 ---------- */}
          {loading ? (
            <PostCardSkeleton count={5} withMedia />
          ) : items.length === 0 ? (
            <div className={styles.empty}>
              <Hash size={26} strokeWidth={1.6} aria-hidden />
              <h3 className={styles.empty__title}>这个话题下还没有内容</h3>
              <p className={styles.empty__desc}>成为第一个带这个话题发帖的人。</p>
              <button
                type="button"
                className={styles.empty__btn}
                onClick={() => navigate(`/compose?topic=${encodeURIComponent(name)}`)}
              >
                发一条带此话题的动态
              </button>
            </div>
          ) : (
            items.map((item) => (
              <PostCard
                key={`${tab}_${item.content_id}`}
                item={item}
                onLike={() => toggleLike(item.content_id)}
                onRepost={() => toggleRepost(item.content_id)}
                onBookmark={() => toggleBookmark(item.content_id)}
                onReply={() => navigate(`/post/${item.content_id}`)}
                onMore={() => toast.show('更多操作（Demo 未实现）')}
              />
            ))
          )}

          <div className={styles.tail} />
        </div>
      </div>
    </AppShell>
  );
}
