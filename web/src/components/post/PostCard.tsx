import { memo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MoreHorizontal,
  Clock,
  Lock,
  Users,
  EyeOff,
  Loader2,
  AlertTriangle,
  Play,
  CheckCircle2,
  UploadCloud,
  RefreshCw,
} from 'lucide-react';
import type { FeedItem } from '@/types/feed';
import { formatRelativeTime, visibilityLabel } from '@/utils/format';
import { ActionBar } from './ActionBar';
import { MediaGrid } from './MediaGrid';
import { useInViewPlayback } from '@/hooks/useInViewPlayback';
import styles from './PostCard.module.css';

interface PostCardProps {
  item: FeedItem;
  /** 是否显示当前用户自己的非 published 状态（作者视角） */
  viewerIsAuthor?: boolean;
  /** 评论区模式：精简操作行 */
  variant?: 'feed' | 'comment';
  onOpen?: (item: FeedItem) => void;
  onLike?: (item: FeedItem) => void;
  onShare?: (item: FeedItem) => void;
  onBookmark?: (item: FeedItem) => void;
  onReply?: (item: FeedItem) => void;
  /** 「更多」按钮：由上层弹操作菜单（见 components/post/PostMenu.tsx） */
  onMore?: (item: FeedItem, point: { x: number; y: number }) => void;
  /** 是否允许视频自动播放（全局开关：仅 Wi-Fi 播放场景） */
  allowAutoplay?: boolean;
}

const TEXT_CLAMP_THRESHOLD = 380;

export const PostCard = memo(function PostCard({
  item,
  viewerIsAuthor = false,
  variant = 'feed',
  onOpen,
  onLike,
  onShare,
  onBookmark,
  onReply,
  onMore,
  allowAutoplay = true,
}: PostCardProps) {
  const navigate = useNavigate();
  const [revealed, setRevealed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isVideo = item.layout === 'video';
  const { ref, inView } = useInViewPlayback();
  const canAutoplay = isVideo && allowAutoplay && !item.flags.sensitive;
  const playing = canAutoplay && inView;

  const goDetail = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (variant === 'comment') return;
      onOpen?.(item);
      navigate(`/post/${item.content_id}`);
    },
    [item, navigate, onOpen, variant],
  );

  const isComment = variant === 'comment';
  const clampText = !isComment && item.text.length > TEXT_CLAMP_THRESHOLD && !expanded;

  /* -------------------- 非 published 状态（作者视角） -------------------- */
  const showStatus = viewerIsAuthor && item.status !== 'published';

  return (
    <article
      ref={ref as React.Ref<HTMLElement>}
      className={[styles.card, isComment ? styles['card--comment'] : '']
        .filter(Boolean)
        .join(' ')}
      onClick={goDetail}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !isComment) goDetail();
      }}
      role={isComment ? undefined : 'link'}
      tabIndex={isComment ? undefined : 0}
      aria-label={isComment ? undefined : `${item.author.nickname} 的动态`}
    >
      {/* ① 头像 */}
      <div className={styles.card__avatarCol}>
        <button
          type="button"
          className={styles.card__avatar}
          aria-label={`查看 ${item.author.nickname} 的主页`}
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/u/${item.author.handle}`);
          }}
        >
          {item.author.avatar_url ? (
            <img src={item.author.avatar_url} alt="" width={40} height={40} />
          ) : null}
        </button>
      </div>

      <div className={styles.card__body}>
        {/* ② 头部行 */}
        <header className={styles.card__head}>
          <button
            type="button"
            className={styles.card__name}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/u/${item.author.handle}`);
            }}
          >
            {item.author.nickname}
          </button>

          <button
            type="button"
            className={styles.card__metaLink}
            onClick={goDetail}
          >
            <span className={styles.card__metaText}>
              @{item.author.handle} · {formatRelativeTime(item.published_at)}
            </span>
          </button>

          {!isComment && (
            <button
              type="button"
              className={styles.card__more}
              aria-label="更多操作"
              aria-haspopup="menu"
              onClick={(e) => {
                e.stopPropagation();
                /* 菜单锚在按钮右下角，避免盖住自己 */
                const rect = e.currentTarget.getBoundingClientRect();
                onMore?.(item, { x: rect.right - 8, y: rect.bottom + 4 });
              }}
            >
              <MoreHorizontal size={18} strokeWidth={2} aria-hidden />
            </button>
          )}
        </header>

        {/* ③ 正文 */}
        {item.text ? (
          <>
            <div
              className={[styles.card__text, clampText ? styles['card__text--clamp'] : '']
                .filter(Boolean)
                .join(' ')}
            >
              {item.text}
            </div>
            {clampText ? (
              <button
                type="button"
                className={styles.card__moreText}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(true);
                }}
              >
                显示更多
              </button>
            ) : null}
          </>
        ) : null}

        {/* 徽标：限时 / 可见范围 / 发布状态 */}
        <Badges item={item} viewerIsAuthor={viewerIsAuthor} />

        {/* ④ 媒体（敏感内容加遮罩） */}
        {item.flags.sensitive && !isVideo && !revealed ? (
          <div className={styles.sensitive}>
            {item.media[0] ? (
              <img
                className={styles.sensitive__preview}
                src={item.media[0].cover_url}
                alt=""
                aria-hidden
              />
            ) : null}
            <div className={styles.sensitive__dialog}>
              <span className={styles.sensitive__icon}>
                <EyeOff size={28} strokeWidth={1.75} aria-hidden />
              </span>
              <span className={styles.sensitive__title}>此内容可能包含敏感信息</span>
              <span className={styles.sensitive__desc}>
                发布者已将其标记为敏感内容。点击下方按钮后才会显示。
              </span>
              <button
                type="button"
                className={styles.card__moreText}
                onClick={(e) => {
                  e.stopPropagation();
                  setRevealed(true);
                }}
              >
                点击查看
              </button>
            </div>
          </div>
        ) : (
          <>
            {item.media.length > 0 ? (
              <div className={styles.card__media} onClick={(e) => e.stopPropagation()}>
                <MediaGrid
                  media={item.media}
                  kind={isVideo ? 'video' : 'photo'}
                  playing={playing}
                />
              </div>
            ) : null}
          </>
        )}

        {/* ⑤ 引用帖 */}
        {item.quoted ? <QuotedPost quoted={item.quoted} /> : null}

        {/* ⑥ 操作行 */}
        {!showStatus ? (
          <div className={styles.card__actions}>
            <ActionBar
              counters={item.counters}
              viewer={item.viewer}
              compact={isComment}
              showView={!isComment}
              onReply={onReply ? () => onReply(item) : undefined}
              onShare={onShare ? () => onShare(item) : undefined}
              onLike={onLike ? () => onLike(item) : undefined}
              onBookmark={onBookmark ? () => onBookmark(item) : undefined}
            />
          </div>
        ) : null}
      </div>

      {/* 非 published：作者视角的状态遮罩 */}
      {showStatus ? <StatusMask item={item} /> : null}
    </article>
  );
});

/* -------------------------------------------------------------------------- */
/*  徽标行                                                                      */
/* -------------------------------------------------------------------------- */

const Badges = memo(function Badges({
  item,
  viewerIsAuthor,
}: {
  item: FeedItem;
  viewerIsAuthor: boolean;
}) {
  const list: Array<{ key: string; icon: React.ReactNode; text: string; tone: string }> = [];

  if (item.flags.ephemeral) {
    list.push({
      key: 'ephemeral',
      icon: <Clock size={12} strokeWidth={2.2} aria-hidden />,
      text: '24小时后消失',
      tone: '',
    });
  }

  if (viewerIsAuthor && item.flags.visibility !== 'public') {
    list.push({
      key: 'visibility',
      icon:
        item.flags.visibility === 'private' ? (
          <Lock size={12} strokeWidth={2.2} aria-hidden />
        ) : (
          <Users size={12} strokeWidth={2.2} aria-hidden />
        ),
      text: visibilityLabel(item.flags.visibility),
      tone: 'badge--info',
    });
  }

  if (list.length === 0) return null;

  return (
    <div className={styles.card__badges}>
      {list.map((b) => (
        <span
          key={b.key}
          className={[styles.badge, b.tone ? styles[b.tone] : ''].filter(Boolean).join(' ')}
        >
          {b.icon}
          {b.text}
        </span>
      ))}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/*  引用帖                                                                      */
/* -------------------------------------------------------------------------- */

const QuotedPost = memo(function QuotedPost({ quoted }: { quoted: FeedItem }) {
  const missing = quoted.status_reason === 'deleted';

  return (
    <div className={styles.quoted} onClick={(e) => e.stopPropagation()}>
      <div className={styles.quoted__head}>
        <span className={styles.quoted__avatar}>
          {quoted.author.avatar_url ? <img src={quoted.author.avatar_url} alt="" /> : null}
        </span>
        <span className={styles.quoted__name}>{quoted.author.nickname}</span>
        <span className={styles.quoted__handle}>
          @{quoted.author.handle} · {formatRelativeTime(quoted.published_at)}
        </span>
      </div>

      {missing ? (
        <div className={styles.quoted__missing}>
          <AlertTriangle size={14} strokeWidth={2} aria-hidden />
          内容不可用（原动态已被删除）
        </div>
      ) : (
        <>
          {quoted.text ? <div className={styles.quoted__text}>{quoted.text}</div> : null}
          {quoted.media[0] ? (
            <div className={styles.quoted__media}>
              <img src={quoted.media[0].cover_url} alt="" loading="lazy" />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/*  发布状态遮罩                                                               */
/* -------------------------------------------------------------------------- */

const STATUS_META: Record<
  string,
  { icon: React.ReactNode; title: string; hint: string; tone: string }
> = {
  uploading: {
    icon: <UploadCloud size={20} strokeWidth={2} aria-hidden />,
    title: '上传中',
    hint: '正在上传媒体文件，可以离开此页面。',
    tone: '',
  },
  transcoding: {
    icon: <Loader2 size={20} strokeWidth={2} className={styles.spin} aria-hidden />,
    title: '转码中',
    hint: '正在生成多档清晰度，通常很快完成。',
    tone: '',
  },
  reviewing: {
    icon: <Clock size={20} strokeWidth={2} aria-hidden />,
    title: '审核中',
    hint: '内容正在审核，仅你自己可见。',
    tone: 'badge--warn',
  },
  rejected: {
    icon: <AlertTriangle size={20} strokeWidth={2} aria-hidden />,
    title: '未通过审核',
    hint: '原因类别：疑似暴力内容。你可以申诉或修改后重新发布。',
    tone: 'badge--danger',
  },
  failed: {
    icon: <RefreshCw size={20} strokeWidth={2} aria-hidden />,
    title: '发布失败',
    hint: '上传或转码失败，可点击重试。',
    tone: 'badge--danger',
  },
};

const StatusMask = memo(function StatusMask({ item }: { item: FeedItem }) {
  const meta = STATUS_META[item.status] ?? {
    icon: <CheckCircle2 size={20} strokeWidth={2} aria-hidden />,
    title: item.status,
    hint: '',
    tone: '',
  };

  return (
    <div className={styles.card__statusMask} onClick={(e) => e.stopPropagation()}>
      <div className={styles.card__statusPanel}>
        <span className={[styles.badge, meta.tone ? styles[meta.tone] : ''].filter(Boolean).join(' ')}>
          {meta.icon}
          {meta.title}
        </span>
        {meta.hint ? <span className={styles.card__statusHint}>{meta.hint}</span> : null}
        <div className={styles.card__statusActions}>
          {item.status === 'failed' ? (
            <button type="button" className={styles.card__moreText}>
              <Play size={12} strokeWidth={2.4} aria-hidden /> 重试
            </button>
          ) : null}
          {item.status === 'rejected' ? (
            <button type="button" className={styles.card__moreText}>
              查看原因与申诉
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
});
