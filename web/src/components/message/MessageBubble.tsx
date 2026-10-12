import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Check, CheckCheck, Clock } from 'lucide-react';
import type { Message } from '@/types/message';
import { formatRelativeTime } from '@/utils/format';
import styles from './MessageBubble.module.css';

interface MessageBubbleProps {
  message: Message;
  /** 是否自己发的（靠右、主色背景） */
  mine: boolean;
  /** 群聊中显示发送者名字 */
  showSender?: boolean;
  senderName?: string;
  senderAvatar?: string;
  onRecall?: (message: Message) => void;
}

/**
 * 消息气泡
 * 自己发的靠右（主色背景白字），对方靠左（浅灰背景深字）。
 * 消息状态：发送中 〇 / 已发送 ✓ / 已送达 ✓✓ / 已读 ✓✓（蓝）
 * 撤回后 → 灰色斜体"你撤回了一条消息"
 */
export const MessageBubble = memo(function MessageBubble({
  message,
  mine,
  showSender = false,
  senderName,
  senderAvatar,
  onRecall,
}: MessageBubbleProps) {
  const navigate = useNavigate();

  /* ---------- 撤回态 ---------- */
  if (message.recalled) {
    return (
      <div className={styles.recalledWrap}>
        <span className={styles.recalled}>
          {mine ? '你撤回了一条消息' : `${senderName ?? '对方'}撤回了一条消息`}
        </span>
      </div>
    );
  }

  return (
    <div
      className={[styles.line, mine ? styles['line--mine'] : styles['line--theirs']]
        .filter(Boolean)
        .join(' ')}
    >
      {/* 对方头像（群聊每条都显示） */}
      {!mine ? (
        <span className={styles.line__avatar}>
          {senderAvatar ? <img src={senderAvatar} alt="" loading="lazy" /> : null}
        </span>
      ) : null}

      <div className={styles.line__stack}>
        {showSender && !mine && senderName ? (
          <span className={styles.line__sender}>{senderName}</span>
        ) : null}

        <div className={styles.line__bubbleRow}>
          <div
            className={[styles.bubble, mine ? styles['bubble--mine'] : styles['bubble--theirs']]
              .filter(Boolean)
              .join(' ')}
          >
            {/* 正文 */}
            {message.text ? <div className={styles.bubble__text}>{message.text}</div> : null}

            {/* 图片 */}
            {message.kind === 'image' && message.media_url ? (
              <button
                type="button"
                className={styles.bubble__image}
                onClick={() => window.open(message.media_url, '_blank', 'noopener')}
              >
                <img src={message.media_url} alt="图片消息" loading="lazy" />
              </button>
            ) : null}

            {/* 视频 */}
            {message.kind === 'video' && message.media_url ? (
              <div className={styles.bubble__video}>
                <video src={message.media_url} controls playsInline preload="metadata" />
              </div>
            ) : null}

            {/* 动态分享卡片 */}
            {message.kind === 'post' && message.content_id ? (
              <button
                type="button"
                className={styles.postCard}
                onClick={() => navigate(`/post/${message.content_id}`)}
              >
                {message.media_url ? (
                  <span className={styles.postCard__media}>
                    <img src={message.media_url} alt="" loading="lazy" />
                  </span>
                ) : null}
                <span className={styles.postCard__body}>
                  <span className={styles.postCard__label}>动态</span>
                  <span className={styles.postCard__text}>
                    {message.text || '点击查看这条动态'}
                  </span>
                </span>
              </button>
            ) : null}
          </div>

          {/* 自己的消息：状态图标 + 撤回 */}
          {mine ? (
            <span className={styles.line__meta}>
              <StatusIcon status={message.status} />
              <button
                type="button"
                className={styles.line__recall}
                aria-label="撤回这条消息"
                title="撤回"
                onClick={() => onRecall?.(message)}
              >
                撤回
              </button>
            </span>
          ) : null}
        </div>

        <time className={styles.line__time} dateTime={message.published_at}>
          {formatRelativeTime(message.published_at)}
        </time>
      </div>
    </div>
  );
});

/* -------------------------------------------------------------------------- */

function StatusIcon({ status }: { status: Message['status'] }) {
  switch (status) {
    case 'sending':
      return (
        <span className={styles.status} title="发送中" aria-label="发送中">
          <Clock size={12} strokeWidth={2.2} aria-hidden />
        </span>
      );
    case 'sent':
      return (
        <span className={styles.status} title="已发送" aria-label="已发送">
          <Check size={13} strokeWidth={2.6} aria-hidden />
        </span>
      );
    case 'delivered':
      return (
        <span className={styles.status} title="已送达" aria-label="已送达">
          <CheckCheck size={13} strokeWidth={2.6} aria-hidden />
        </span>
      );
    case 'read':
      return (
        <span className={[styles.status, styles['status--read']].join(' ')} title="已读" aria-label="已读">
          <CheckCheck size={13} strokeWidth={2.6} aria-hidden />
        </span>
      );
    default:
      return (
        <span className={[styles.status, styles['status--error']].join(' ')} title="发送失败">
          <AlertCircle size={13} strokeWidth={2.4} aria-hidden />
        </span>
      );
  }
}
