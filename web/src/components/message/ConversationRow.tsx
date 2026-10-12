import { useNavigate } from 'react-router-dom';
import { BellOff, Pin } from 'lucide-react';
import type { Conversation } from '@/types/message';
import { formatRelativeTime } from '@/utils/format';
import styles from './ConversationRow.module.css';

interface ConversationRowProps {
  conversation: Conversation;
  onClick?: () => void;
}

/**
 * 会话行
 * 头像 48 + 名称 · 时间 | 最后一条消息预览 | 未读红点
 * 在线状态：头像右下角 10px 绿点（#00ba7c），离线不显示点
 */
export function ConversationRow({ conversation, onClick }: ConversationRowProps) {
  const navigate = useNavigate();

  const handle = () => {
    if (onClick) onClick();
    else navigate(`/messages/${conversation.conversation_id}`);
  };

  return (
    <div
      className={styles.row}
      role="button"
      tabIndex={0}
      onClick={handle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handle();
        }
      }}
      aria-label={`${conversation.title}，${conversation.unread > 0 ? `${conversation.unread} 条未读` : '已读'}`}
    >
      {/* 头像（群聊叠三人） */}
      <span className={styles.row__avatarWrap}>
        {conversation.kind === 'group' && conversation.member_avatars?.length ? (
          <span className={styles.stack}>
            {conversation.member_avatars.slice(0, 3).map((src, i) => (
              <span key={i} className={styles.stack__item} style={{ zIndex: 3 - i }}>
                <img src={src} alt="" loading="lazy" />
              </span>
            ))}
          </span>
        ) : (
          <span className={styles.row__avatar}>
            <img src={conversation.avatar_url} alt="" loading="lazy" />
          </span>
        )}

        {/* 在线绿点：单聊才展示（群聊不区分在线） */}
        {conversation.kind === 'direct' && conversation.online ? (
          <span className={styles.row__online} title="在线" />
        ) : null}
      </span>

      <div className={styles.row__body}>
        <div className={styles.row__top}>
          <span className={styles.row__title}>
            {conversation.title}
            {conversation.kind === 'group' ? (
              <span className={styles.row__count}> · {conversation.member_count} 人</span>
            ) : null}
          </span>

          <span className={styles.row__flags}>
            {conversation.pinned ? (
              <span className={styles.row__flag} title="已置顶">
                <Pin size={12} strokeWidth={2.4} aria-hidden />
              </span>
            ) : null}
            {conversation.muted ? (
              <span className={styles.row__flag} title="已免打扰">
                <BellOff size={12} strokeWidth={2.4} aria-hidden />
              </span>
            ) : null}
          </span>

          <time className={styles.row__time} dateTime={conversation.last_at}>
            {formatRelativeTime(conversation.last_at)}
          </time>
        </div>

        <div className={styles.row__bottom}>
          <span
            className={[
              styles.row__preview,
              conversation.unread > 0 ? styles['row__preview--unread'] : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {conversation.last_message}
          </span>

          {conversation.unread > 0 ? (
            <span className={styles.row__badge} aria-hidden>
              {conversation.unread > 99 ? '99+' : conversation.unread}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
