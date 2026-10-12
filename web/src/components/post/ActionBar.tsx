import { memo } from 'react';
import {
  MessageCircle,
  Repeat2,
  Heart,
  Bookmark,
  BarChart2,
} from 'lucide-react';
import type { Counters, ViewerState } from '@/types/feed';
import { formatCount } from '@/utils/format';
import styles from './ActionBar.module.css';

interface ActionBarProps {
  counters: Counters;
  viewer: ViewerState;
  /** 评论模式：只有 回复 + 点赞 */
  compact?: boolean;
  /** 各动作回调；不传则该项不可交互（但仍展示计数） */
  onReply?: () => void;
  onRepost?: () => void;
  onLike?: () => void;
  onBookmark?: () => void;
  /** 是否显示浏览量（详情页显示，某些场景可隐藏） */
  showView?: boolean;
}

/**
 * 操作行
 *
 * 注意：所有交互必须阻止冒泡（卡片本身可点，见 PostCard.tsx）
 */
export const ActionBar = memo(function ActionBar({
  counters,
  viewer,
  compact = false,
  onReply,
  onRepost,
  onLike,
  onBookmark,
  showView = true,
}: ActionBarProps) {
  const cls = (base: string, on = false) =>
    [base, on ? styles['action--on'] : ''].filter(Boolean).join(' ');

  return (
    <div
      className={[styles.actions, compact ? styles['actions--compact'] : '']
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className={cls(styles['action--reply'])}
        aria-label={`回复 ${counters.reply} 条`}
        onClick={stop(onReply)}
        disabled={!onReply}
      >
        <span className={styles.action__hit}>
          <MessageCircle size={18.75} strokeWidth={1.75} className={styles.icon} aria-hidden />
        </span>
        <span className={styles.action__count}>{formatCount(counters.reply)}</span>
      </button>

      {!compact && (
        <button
          type="button"
          className={cls(styles['action--repost'], viewer.reposted)}
          aria-label={viewer.reposted ? '取消转推' : '转推'}
          aria-pressed={viewer.reposted}
          onClick={stop(onRepost)}
          disabled={!onRepost}
        >
          <span className={styles.action__hit}>
            <Repeat2 size={18.75} strokeWidth={1.75} className={styles.icon} aria-hidden />
          </span>
          <span className={styles.action__count}>{formatCount(counters.repost)}</span>
        </button>
      )}

      <button
        type="button"
        className={cls(styles['action--like'], viewer.liked)}
        aria-label={viewer.liked ? '取消点赞' : '点赞'}
        aria-pressed={viewer.liked}
        onClick={stop(onLike)}
        disabled={!onLike}
      >
        <span className={styles.action__hit}>
          <Heart
            size={18.75}
            strokeWidth={1.75}
            className={styles.icon}
            fill={viewer.liked ? 'currentColor' : 'none'}
            aria-hidden
          />
        </span>
        <span className={styles.action__count}>{formatCount(counters.like)}</span>
      </button>

      {!compact && (
        <button
          type="button"
          className={cls(styles['action--bookmark'], viewer.bookmarked)}
          aria-label={viewer.bookmarked ? '取消收藏' : '收藏'}
          aria-pressed={viewer.bookmarked}
          onClick={stop(onBookmark)}
          disabled={!onBookmark}
        >
          <span className={styles.action__hit}>
            <Bookmark
              size={18.75}
              strokeWidth={1.75}
              className={styles.icon}
              fill={viewer.bookmarked ? 'currentColor' : 'none'}
              aria-hidden
            />
          </span>
        </button>
      )}

      {!compact && showView && (
        <span className={cls(styles['action--view'])}>
          <span className={styles.action__hit}>
            <BarChart2 size={18.75} strokeWidth={1.75} aria-hidden />
          </span>
          <span className={styles.action__count}>{formatCount(counters.view)}</span>
        </span>
      )}
    </div>
  );
});

/** 阻止冒泡：卡片整体可点，操作行点击不应触发进入详情 */
function stop(fn?: () => void) {
  return (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    fn?.();
  };
}
