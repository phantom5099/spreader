import { memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Heart, CornerDownRight } from 'lucide-react';
import type { Comment } from '@/types/feed';
import { formatRelativeTime, formatCount } from '@/utils/format';
import styles from './CommentItem.module.css';

/** 评论项展示模型：在契约类型上补充 Demo 需要的展示字段 */
export interface CommentView extends Comment {
  /** 是否作者本人 */
  isAuthor?: boolean;
  /** 是否楼主（被评论动态的作者） */
  isOp?: boolean;
  /** 父评论 id（子回复有值） */
  parent_id?: string;
  /** 回复给谁 */
  reply_to?: string;
  /** 媒体缩略（可选） */
  media_url?: string;
  /** 子回复 */
  replies?: CommentView[];
}

interface CommentItemProps {
  comment: CommentView;
  /** 是否为子回复（缩进 + 左侧竖线） */
  isReply?: boolean;
  onLike?: (comment: CommentView) => void;
  onReply?: (comment: CommentView) => void;
  onOpenProfile?: (handle: string) => void;
}

const CLAMP_THRESHOLD = 180;

export const CommentItem = memo(function CommentItem({
  comment,
  isReply = false,
  onLike,
  onReply,
  onOpenProfile,
}: CommentItemProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [showReplies, setShowReplies] = useState(false);

  const clamp = !isReply && comment.text.length > CLAMP_THRESHOLD && !expanded;
  const replies = comment.replies ?? [];

  const openProfile = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenProfile) onOpenProfile(comment.author.handle);
    else navigate(`/u/${comment.author.handle}`);
  };

  return (
    <>
      <article
        className={[styles.item, isReply ? styles['item--reply'] : ''].filter(Boolean).join(' ')}
      >
        <div className={styles.item__avatarCol}>
          <button
            type="button"
            className={styles.item__avatar}
            aria-label={`查看 ${comment.author.nickname} 的主页`}
            onClick={openProfile}
          >
            {comment.author.avatar_url ? <img src={comment.author.avatar_url} alt="" /> : null}
          </button>
        </div>

        <div className={styles.item__body}>
          {/* 头部：名字 + @handle + 时间 + 标记 */}
          <header className={styles.item__head}>
            <button type="button" className={styles.item__name} onClick={openProfile}>
              {comment.author.nickname}
            </button>

            {comment.isAuthor ? (
              <span className={[styles.tag, styles['tag--author']].join(' ')}>作者</span>
            ) : null}
            {comment.isOp && !comment.isAuthor ? (
              <span className={[styles.tag, styles['tag--op']].join(' ')}>楼主</span>
            ) : null}

            <span className={styles.item__handle}>@{comment.author.handle}</span>
            <span className={styles.item__dot}>·</span>
            <time className={styles.item__time} dateTime={comment.published_at}>
              {formatRelativeTime(comment.published_at)}
            </time>

            <button
              type="button"
              className={styles.item__more}
              aria-label="更多操作"
              onClick={(e) => e.stopPropagation()}
            >
              ⋯
            </button>
          </header>

          {/* 回复给谁 */}
          {comment.reply_to ? (
            <span className={styles.item__replyingTo}>回复 @{comment.reply_to}</span>
          ) : null}

          {/* 正文 */}
          {comment.text ? (
            <>
              <div
                className={[styles.item__text, clamp ? styles['item__text--clamp'] : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                {comment.text}
              </div>
              {clamp ? (
                <button
                  type="button"
                  className={styles.item__moreText}
                  onClick={() => setExpanded(true)}
                >
                  显示更多
                </button>
              ) : null}
            </>
          ) : null}

          {/* 媒体缩略 */}
          {comment.media_url ? (
            <div className={styles.item__media}>
              <img src={comment.media_url} alt="" loading="lazy" />
            </div>
          ) : null}

          {/* 操作行：仅 回复 + 点赞 */}
          <div className={styles.item__actions}>
            <button
              type="button"
              className={styles.actBtn}
              aria-label="回复这条评论"
              onClick={() => onReply?.(comment)}
            >
              <span className={styles.actBtn__hit}>
                <MessageCircle size={17} strokeWidth={1.75} aria-hidden />
              </span>
              {comment.counters.reply > 0 ? formatCount(comment.counters.reply) : null}
            </button>

            <button
              type="button"
              className={[
                styles.actBtn,
                styles['actBtn--like'],
                comment.viewer.liked ? styles['actBtn--likeOn'] : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={comment.viewer.liked ? '取消点赞' : '点赞'}
              aria-pressed={comment.viewer.liked}
              onClick={() => onLike?.(comment)}
            >
              <span className={styles.actBtn__hit}>
                <Heart
                  size={17}
                  strokeWidth={1.75}
                  fill={comment.viewer.liked ? 'currentColor' : 'none'}
                  aria-hidden
                />
              </span>
              {comment.counters.like > 0 ? formatCount(comment.counters.like) : null}
            </button>
          </div>

          {/* 展开子回复 */}
          {replies.length > 0 && !showReplies ? (
            <button
              type="button"
              className={styles.item__repliesToggle}
              onClick={() => setShowReplies(true)}
            >
              <CornerDownRight size={14} strokeWidth={2} aria-hidden />
              查看 {replies.length} 条回复
            </button>
          ) : null}
        </div>
      </article>

      {/* 子回复 */}
      {showReplies
        ? replies.map((reply) => (
            <CommentItem
              key={reply.comment_id}
              comment={reply}
              isReply
              onLike={onLike}
              onReply={onReply}
              onOpenProfile={onOpenProfile}
            />
          ))
        : null}
    </>
  );
});
