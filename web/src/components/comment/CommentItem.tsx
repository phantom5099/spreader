import { memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Heart, CornerDownRight, Flag, Share2, Trash2 } from 'lucide-react';
import { ContextMenu, type ContextMenuItem } from '@/components/common/ContextMenu';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ReportModal } from '@/components/report/ReportModal';
import { CURRENT_USER } from '@/mocks/currentUser';
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
  /** 分享（复制动态链接），由页面接管 */
  onShare?: (comment: CommentView) => void;
  /** 删除自己的评论 */
  onDelete?: (comment: CommentView) => void;
}

const CLAMP_THRESHOLD = 180;

export const CommentItem = memo(function CommentItem({
  comment,
  isReply = false,
  onLike,
  onReply,
  onOpenProfile,
  onShare,
  onDelete,
}: CommentItemProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  /** 「更多」菜单与举报 / 删除确认 */
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const clamp = !isReply && comment.text.length > CLAMP_THRESHOLD && !expanded;
  const replies = comment.replies ?? [];
  const mine = comment.author.handle === CURRENT_USER.handle;

  const openProfile = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenProfile) onOpenProfile(comment.author.handle);
    else navigate(`/u/${comment.author.handle}`);
  };

  /* 不放「分享这条动态」：评论操作行已经有分享按钮，菜单里再来一份是重复入口 */
  const menuItems: ContextMenuItem[] = [
    {
      key: 'report',
      label: '举报这条评论',
      danger: true,
      icon: <Flag size={16} strokeWidth={1.9} aria-hidden />,
      onSelect: () => setReportOpen(true),
    },
  ];
  if (mine) {
    menuItems.push({
      key: 'delete',
      label: '删除评论',
      danger: true,
      icon: <Trash2 size={16} strokeWidth={1.9} aria-hidden />,
      onSelect: () => setDeleteOpen(true),
    });
  }

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
              aria-haspopup="menu"
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setMenu({ x: rect.right - 8, y: rect.bottom + 4 });
              }}
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

          {/* 操作行：回复 + 点赞 + 分享 */}
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

            <button
              type="button"
              className={styles.actBtn}
              aria-label="分享这条评论"
              onClick={() => onShare?.(comment)}
            >
              <span className={styles.actBtn__hit}>
                <Share2 size={17} strokeWidth={1.75} aria-hidden />
              </span>
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
              onShare={onShare}
              onDelete={onDelete}
            />
          ))
        : null}

      {/* 更多操作 */}
      <ContextMenu
        point={menu}
        items={menuItems}
        onClose={() => setMenu(null)}
        ariaLabel="评论操作"
      />

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetLabel={`@${comment.author.handle} 的评论`}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        danger
        title="删除这条评论？"
        confirmText="删除"
        description="删除后无法恢复，其他用户的回复也会一并移除。"
        onConfirm={() => {
          setDeleteOpen(false);
          onDelete?.(comment);
        }}
      />
    </>
  );
});
