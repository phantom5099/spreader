import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bookmark,
  Heart,
  MessageCircle,
  Play,
  Repeat2,
  Share2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Modal } from '@/components/common/Modal';
import { useAudible, useInViewPlayback } from '@/hooks/useInViewPlayback';
import { fetchComments, fetchShortVideos, toggleFollowApi } from '@/mocks/api';
import { CURRENT_USER } from '@/mocks/currentUser';
import { useFeedStore } from '@/stores/feedStore';
import { toast } from '@/stores/toastStore';
import { formatCount } from '@/utils/format';
import type { CommentView } from '@/components/comment/CommentItem';
import type { FeedItem } from '@/types/feed';
import styles from './VideosPage.module.css';

/* -------------------------------------------------------------------------- */
/*  单条短视频                                                                  */
/* -------------------------------------------------------------------------- */

interface VideoProps {
  item: FeedItem;
  index: number;
  /** 播放到结尾时通知外层前进 */
  onEnded: (index: number) => void;
  onLike: (item: FeedItem) => void;
  onOpenReplies: (item: FeedItem) => void;
  onRepost: (item: FeedItem) => void;
  onBookmark: (item: FeedItem) => void;
}

/**
 * 整屏短视频
 *
 * 播放状态分三层，互不耦合：
 *   ① 是否该播 —— 可见性判定（≥60% 可见且停留 >250ms），滚出即停不重置进度
 *   ② 谁能出声 —— 全局唯一有声者，默认全静音，点了喇叭才出声
 *   ③ 播到哪了 —— 由 duration_ms 驱动的进度，到结尾通知外层翻下一条
 */
const Video = memo(function Video({
  item,
  index,
  onEnded,
  onLike,
  onOpenReplies,
  onRepost,
  onBookmark,
}: VideoProps) {
  const { ref, inView } = useInViewPlayback({ threshold: 0.6, dwellMs: 250 });
  const { isAudible, claim, release } = useAudible(ref);

  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const [burst, setBurst] = useState(false);
  const [progress, setProgress] = useState(0);

  const progressRef = useRef(0);
  const lastTapRef = useRef(0);
  const tapTimerRef = useRef<number | null>(null);

  const media = item.media[0]!;
  const duration = media.duration_ms ?? 15_000;
  const playing = inView && !paused;

  /* 滚出视口就让出有声资格，否则资格被占着，后面这条点了也没声音 */
  useEffect(() => {
    if (!playing) release();
  }, [playing, release]);

  /* 进度时钟：暂停时停在原地，恢复时从原处续 */
  useEffect(() => {
    if (!playing) return;

    let raf = 0;
    let last = 0;
    const start = performance.now() - progressRef.current * duration;

    const tick = (now: number) => {
      // 约 100ms 更新一次，60fps 重渲染这一屏的 DOM 没有必要
      if (now - last >= 100) {
        last = now;
        const next = Math.min(1, (now - start) / duration);
        progressRef.current = next;
        setProgress(next);
        if (next >= 1) {
          onEnded(index);
          return;
        }
      }
      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [playing, duration, index, onEnded]);

  useEffect(
    () => () => {
      if (tapTimerRef.current !== null) window.clearTimeout(tapTimerRef.current);
    },
    [],
  );

  const burstTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (burstTimer.current !== null) window.clearTimeout(burstTimer.current);
    },
    [],
  );

  /**
   * 单击暂停 / 双击点赞。
   * 双击判定要等一个 260ms 的窗口，所以单击的暂停被延后到窗口结束才生效 ——
   * 不等的话双击会先切一次暂停，画面顿一下再弹心。
   */
  const onStageClick = () => {
    const now = Date.now();

    if (now - lastTapRef.current < 260) {
      lastTapRef.current = 0;
      if (tapTimerRef.current !== null) {
        window.clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
      if (!item.viewer.liked) onLike(item);
      setBurst(true);
      if (burstTimer.current !== null) window.clearTimeout(burstTimer.current);
      burstTimer.current = window.setTimeout(() => setBurst(false), 700);
      return;
    }

    lastTapRef.current = now;
    tapTimerRef.current = window.setTimeout(() => {
      tapTimerRef.current = null;
      lastTapRef.current = 0;
      setPaused((p) => !p);
    }, 260);
  };

  const isSelf = item.author.handle === CURRENT_USER.handle;
  const [following, setFollowing] = useState(Boolean(item.author.viewer_following));

  const toggleFollow = () => {
    const next = !following;
    setFollowing(next);
    void toggleFollowApi(item.author.handle, next).then(() => {
      toast.show(next ? `已关注 @${item.author.handle}` : `已取消关注 @${item.author.handle}`);
    });
  };

  return (
    <article className={styles.video} ref={ref}>
      <img className={styles.video__art} src={media.cover_url} alt="" />

      {playing && !failed ? (
        <video
          className={styles.video__media}
          src={media.url}
          poster={media.cover_url}
          autoPlay
          loop
          muted={!isAudible}
          playsInline
          preload="metadata"
          onError={() => setFailed(true)}
        />
      ) : null}

      <div className={styles.video__scrim} aria-hidden />

      {/* 点击层：暂停 / 点赞。放在操作条之下，不会抢它们的点击 */}
      <button
        type="button"
        className={styles.video__stage}
        aria-label={playing ? '暂停' : '播放'}
        onClick={onStageClick}
      />

      {burst ? (
        <span className={styles.video__burst} aria-hidden>
          <Heart size={96} strokeWidth={0} fill="currentColor" />
        </span>
      ) : null}

      {inView && paused ? (
        <div className={styles.video__resumeWrap}>
          <button
            type="button"
            className={styles.video__resume}
            aria-label="继续播放"
            onClick={() => setPaused(false)}
          >
            <Play size={26} strokeWidth={2} fill="currentColor" aria-hidden />
          </button>
        </div>
      ) : null}

      <button
        type="button"
        className={styles.video__mute}
        aria-label={isAudible ? '静音' : '取消静音'}
        aria-pressed={isAudible}
        onClick={() => (isAudible ? release() : claim())}
      >
        {isAudible ? (
          <Volume2 size={19} strokeWidth={2} aria-hidden />
        ) : (
          <VolumeX size={19} strokeWidth={2} aria-hidden />
        )}
      </button>

      <div className={styles.video__bottom}>
        <div className={styles.video__meta}>
          <div className={styles.video__authorRow}>
            <Link className={styles.video__author} to={`/u/${item.author.handle}`}>
              <span className={styles.video__avatar}>
                <img src={item.author.avatar_url} alt="" loading="lazy" />
              </span>
              <span className={styles.video__names}>
                <span className={styles.video__name}>{item.author.nickname}</span>
                <span className={styles.video__handle}>@{item.author.handle}</span>
              </span>
            </Link>

            {!isSelf ? (
              <button
                type="button"
                className={[
                  styles.video__follow,
                  following ? styles['video__follow--on'] : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={following}
                onClick={toggleFollow}
              >
                {following ? '取消关注' : '关注'}
              </button>
            ) : null}
          </div>

          {item.text ? <p className={styles.video__caption}>{item.text}</p> : null}
        </div>

        <div className={styles.video__actions}>
          <button
            type="button"
            className={[styles.action, item.viewer.liked ? styles['action--liked'] : '']
              .filter(Boolean)
              .join(' ')}
            aria-label={item.viewer.liked ? '取消点赞' : '点赞'}
            aria-pressed={item.viewer.liked}
            onClick={() => onLike(item)}
          >
            <Heart
              size={26}
              strokeWidth={1.9}
              fill={item.viewer.liked ? 'currentColor' : 'none'}
              aria-hidden
            />
            <span className={styles.action__count}>{formatCount(item.counters.like)}</span>
          </button>

          <button
            type="button"
            className={styles.action}
            aria-label={`查看 ${item.counters.reply} 条回复`}
            onClick={() => onOpenReplies(item)}
          >
            <MessageCircle size={26} strokeWidth={1.9} aria-hidden />
            <span className={styles.action__count}>{formatCount(item.counters.reply)}</span>
          </button>

          <button
            type="button"
            className={[styles.action, item.viewer.reposted ? styles['action--reposted'] : '']
              .filter(Boolean)
              .join(' ')}
            aria-label={item.viewer.reposted ? '取消转推' : '转推'}
            aria-pressed={item.viewer.reposted}
            onClick={() => onRepost(item)}
          >
            <Repeat2 size={26} strokeWidth={1.9} aria-hidden />
            <span className={styles.action__count}>{formatCount(item.counters.repost)}</span>
          </button>

          <button
            type="button"
            className={[styles.action, item.viewer.bookmarked ? styles['action--bookmarked'] : '']
              .filter(Boolean)
              .join(' ')}
            aria-label={item.viewer.bookmarked ? '取消收藏' : '收藏'}
            aria-pressed={item.viewer.bookmarked}
            onClick={() => onBookmark(item)}
          >
            <Bookmark
              size={26}
              strokeWidth={1.9}
              fill={item.viewer.bookmarked ? 'currentColor' : 'none'}
              aria-hidden
            />
          </button>

          <button
            type="button"
            className={styles.action}
            aria-label="复制链接"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(`${location.origin}/post/${item.content_id}`)
                .then(() => toast.success('链接已复制'))
                .catch(() => toast.error('复制失败'));
            }}
          >
            <Share2 size={26} strokeWidth={1.9} aria-hidden />
          </button>
        </div>
      </div>

      {/* 播放进度：贴着画面底部的一条细线 */}
      <div className={styles.video__track} aria-hidden>
        <span className={styles.video__bar} style={{ transform: `scaleX(${progress})` }} />
      </div>

      {inView ? (
        <span className={styles.video__srOnly} role="status">
          {playing ? '播放中' : '已暂停'}
        </span>
      ) : null}
    </article>
  );
});

/* -------------------------------------------------------------------------- */
/*  回复浮层                                                                    */
/* -------------------------------------------------------------------------- */

function RepliesPanel({ item, onClose }: { item: FeedItem; onClose: () => void }) {
  const [list, setList] = useState<CommentView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void fetchComments(item.content_id).then((data) => {
      if (!alive) return;
      setList(data);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [item.content_id]);

  return (
    <Modal open onClose={onClose} title={`${list.length || item.counters.reply} 条回复`} size="md">
      {loading ? (
        <p className={styles.panel__hint}>加载回复…</p>
      ) : list.length === 0 ? (
        <p className={styles.panel__hint}>还没有回复，来占个前排。</p>
      ) : (
        <ul className={styles.panel__list}>
          {list.map((c) => (
            <li key={c.comment_id} className={styles.panel__item}>
              <span className={styles.panel__avatar}>
                <img src={c.author.avatar_url} alt="" loading="lazy" />
              </span>
              <div className={styles.panel__body}>
                <div className={styles.panel__top}>
                  <span className={styles.panel__name}>{c.author.nickname}</span>
                  <span className={styles.panel__handle}>@{c.author.handle}</span>
                </div>
                <p className={styles.panel__text}>{c.text}</p>
              </div>
              <span className={styles.panel__like}>
                <Heart size={15} strokeWidth={1.9} aria-hidden />
                {formatCount(c.counters.like)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*  页面                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * 短视频页
 *
 * 竖向整屏分页：一次一条，滚动、↑↓ 或 PageUp/PageDown 切换；
 * 每条播完自动翻下一条，最后一条回到开头。
 */
export function VideosPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [panelFor, setPanelFor] = useState<FeedItem | null>(null);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const indexRef = useRef(0);

  const toggleLike = useFeedStore((s) => s.toggleLike);
  const toggleRepost = useFeedStore((s) => s.toggleRepost);
  const toggleBookmark = useFeedStore((s) => s.toggleBookmark);

  useEffect(() => {
    let alive = true;
    void fetchShortVideos().then((data) => {
      if (!alive) return;
      setItems(data);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  /** 列表是快照，互动就地改本地数组 */
  const patch = useCallback((contentId: string, fn: (item: FeedItem) => FeedItem) => {
    setItems((prev) => prev.map((it) => (it.content_id === contentId ? fn(it) : it)));
  }, []);

  const like = useCallback(
    (item: FeedItem) => {
      toggleLike(item.content_id);
      patch(item.content_id, (it) => ({
        ...it,
        viewer: { ...it.viewer, liked: !it.viewer.liked },
        counters: { ...it.counters, like: it.counters.like + (it.viewer.liked ? -1 : 1) },
      }));
    },
    [patch, toggleLike],
  );

  const repost = useCallback(
    (item: FeedItem) => {
      toggleRepost(item.content_id);
      patch(item.content_id, (it) => ({
        ...it,
        viewer: { ...it.viewer, reposted: !it.viewer.reposted },
        counters: { ...it.counters, repost: it.counters.repost + (it.viewer.reposted ? -1 : 1) },
      }));
      toast.show(item.viewer.reposted ? '已取消转推' : '已转推');
    },
    [patch, toggleRepost],
  );

  const bookmark = useCallback(
    (item: FeedItem) => {
      toggleBookmark(item.content_id);
      patch(item.content_id, (it) => ({
        ...it,
        viewer: { ...it.viewer, bookmarked: !it.viewer.bookmarked },
      }));
      toast.success(item.viewer.bookmarked ? '已取消收藏' : '已加入收藏');
    },
    [patch, toggleBookmark],
  );

  const goTo = useCallback(
    (next: number) => {
      const node = viewportRef.current;
      if (!node || items.length === 0) return;
      const clamped = Math.min(items.length - 1, Math.max(0, next));
      node.scrollTo({ top: clamped * node.clientHeight, behavior: 'smooth' });
      setIndex(clamped);
    },
    [items.length],
  );

  /** 只有当前这一条到点才前进；最后一条回到开头 */
  const handleEnded = useCallback(
    (i: number) => {
      if (i !== indexRef.current) return;
      goTo(i + 1 < items.length ? i + 1 : 0);
    },
    [goTo, items.length],
  );

  useEffect(() => {
    const node = viewportRef.current;
    if (!node || items.length === 0) return;

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const h = node.clientHeight || 1;
        setIndex(Math.min(items.length - 1, Math.max(0, Math.round(node.scrollTop / h))));
      });
    };

    node.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      node.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [items.length]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLElement &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (typing || panelFor) return;

      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        goTo(indexRef.current + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        goTo(indexRef.current - 1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goTo, panelFor]);

  /* -------------------- 渲染 -------------------- */
  if (loading) {
    return (
      <AppShell fab={false}>
        <div className={styles.page}>
          <div className={`${styles.viewport} skeleton-shimmer`} aria-busy="true" />
        </div>
      </AppShell>
    );
  }

  if (items.length === 0) {
    return (
      <AppShell fab={false}>
        <div className={styles.page}>
          <div className={styles.empty}>
            <p className={styles.empty__title}>还没有短视频</p>
            <p className={styles.empty__desc}>关注的人发布视频后，会出现在这里。</p>
            <Link className={styles.empty__link} to="/">
              回到信息流
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell fab={false}>
      <div className={styles.page}>
        <div className={styles.viewport} ref={viewportRef}>
          {items.map((item, i) => (
            <Video
              key={item.content_id}
              item={item}
              index={i}
              onEnded={handleEnded}
              onLike={like}
              onOpenReplies={setPanelFor}
              onRepost={repost}
              onBookmark={bookmark}
            />
          ))}
        </div>
      </div>

      {panelFor ? (
        <RepliesPanel item={panelFor} onClose={() => setPanelFor(null)} />
      ) : null}
    </AppShell>
  );
}
