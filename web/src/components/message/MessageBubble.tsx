import { memo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
  /** 右键（触屏为长按）自己的消息时，请上层弹出操作菜单 */
  onRequestMenu?: (message: Message, point: { x: number; y: number }) => void;
}

/**
 * 消息气泡
 * 自己发的靠右（主色背景白字），对方靠左（浅灰背景深字）。
 * 消息状态：发送中 〇 / 已发送 ✓ / 已送达 ✓✓ / 已读 ✓✓（蓝）
 * 撤回：右键自己的气泡 → 操作菜单 → 撤回；撤回后为灰色斜体占位
 */
export const MessageBubble = memo(function MessageBubble({
  message,
  mine,
  showSender = false,
  senderName,
  senderAvatar,
  onRequestMenu,
}: MessageBubbleProps) {
  const navigate = useNavigate();

  /* 触屏长按 = 右键（移动端没有右键） */
  const pressTimer = useRef<number | null>(null);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);

  const clearPress = () => {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
    pressOrigin.current = null;
  };

  /* 只有自己的、未撤回的消息才有操作菜单 */
  const canManage = mine && !!onRequestMenu;

  /* 卸载时清掉未触发的长按计时器 */
  useEffect(() => clearPress, []);

  const onContextMenu = (e: React.MouseEvent) => {
    if (!canManage) return;
    e.preventDefault();
    onRequestMenu?.(message, { x: e.clientX, y: e.clientY });
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (!canManage) return;
    const t = e.touches[0];
    if (!t) return;
    pressOrigin.current = { x: t.clientX, y: t.clientY };
    pressTimer.current = window.setTimeout(() => {
      const origin = pressOrigin.current;
      pressTimer.current = null;
      if (origin) onRequestMenu?.(message, origin);
    }, 520);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const origin = pressOrigin.current;
    if (!t || !origin) return;
    /* 手指移动说明在滚动列表，取消长按 */
    if (Math.abs(t.clientX - origin.x) > 10 || Math.abs(t.clientY - origin.y) > 10) clearPress();
  };

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
      onContextMenu={onContextMenu}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={clearPress}
      onTouchCancel={clearPress}
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

          {/* 自己的消息：送达状态用文字说清楚（图标看不懂） */}
          {mine ? (
            <span className={styles.line__meta}>
              <StatusLabel status={message.status} />
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

/** 发送状态文案：发送中 / 已发送 / 已送达 / 已读 */
const STATUS_TEXT: Record<Message['status'], string> = {
  sending: '发送中',
  sent: '已发送',
  delivered: '已送达',
  read: '已读',
};

function StatusLabel({ status }: { status: Message['status'] }) {
  const text = STATUS_TEXT[status] ?? '发送失败';
  const tone =
    status === 'read' ? 'status--read' : STATUS_TEXT[status] ? '' : 'status--error';

  return (
    <span className={[styles.status, tone ? styles[tone] : ''].filter(Boolean).join(' ')}>
      {text}
    </span>
  );
}
