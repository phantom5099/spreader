import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Image as ImageIcon,
  Info,
  MoreHorizontal,
  Send,
  Smile,
  Video as VideoIcon,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { MessageBubble } from '@/components/message/MessageBubble';
import { ConversationInfoPanel } from '@/components/message/ConversationInfoPanel';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { toast } from '@/stores/toastStore';
import { useMessageStore } from '@/stores/messageStore';
import { useConversationStore } from '@/stores/conversationStore';
import { membersOf } from '@/mocks/messages';
import { mediaPlaceholder } from '@/mocks/placeholders';
import { CURRENT_USER } from '@/mocks/currentUser';
import type { Message } from '@/types/message';
import styles from './ChatThreadPage.module.css';

const EMOJI = ['😀', '😂', '🥹', '👍', '🎉', '🔥', '☕️', '🌙', '🙌', '💡', '📷', '🍃'];

/**
 * 会话页：单聊 + 群聊共用
 * 气泡左右分列 + 4 种消息类型 + 4 档状态 + 撤回
 */
export function ChatThreadPage() {
  const { conversationId = '' } = useParams();
  const navigate = useNavigate();

  const list = useConversationStore((s) => s.list);
  const clearUnread = useConversationStore((s) => s.clearUnread);
  const touch = useConversationStore((s) => s.touch);

  const messagesMap = useMessageStore((s) => s.messages);
  const load = useMessageStore((s) => s.load);
  const send = useMessageStore((s) => s.send);
  const recall = useMessageStore((s) => s.recall);

  const [draft, setDraft] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [recallTarget, setRecallTarget] = useState<Message | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const conversation = list.find((c) => c.conversation_id === conversationId);
  const messages = messagesMap[conversationId];
  const members = useMemo(
    () => (conversation?.kind === 'group' ? membersOf(conversationId) : []),
    [conversation?.kind, conversationId],
  );

  const senderOf = useCallback(
    (senderId: string) => {
      if (senderId === CURRENT_USER.user_id) {
        return { name: CURRENT_USER.nickname, avatar: CURRENT_USER.avatar_url };
      }
      const m = members.find((x) => x.user_id === senderId);
      if (m) return { name: m.nickname, avatar: m.avatar_url };
      return { name: conversation?.title ?? '对方', avatar: conversation?.avatar_url ?? '' };
    },
    [conversation, members],
  );

  /* -------------------- 加载 + 清未读 --------------------
     依赖里只放 conversationId（字符串），不放 conversation 对象：
     conversation 来自 list.find()，list 一旦变化就是新引用，
     会导致「effect → clearUnread → list 变 → effect」的无限循环。 */
  useEffect(() => {
    load(conversationId);
    clearUnread(conversationId);
  }, [conversationId, load, clearUnread]);

  /* -------------------- 滚到底 -------------------- */
  const scrollToBottom = useCallback((smooth = false) => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  useEffect(() => {
    if (!messages) return;
    scrollToBottom();
  }, [messages, scrollToBottom]);

  /* -------------------- 发送 -------------------- */
  const doSend = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    send(conversationId, text);
    touch(conversationId, text);
    setDraft('');
    setEmojiOpen(false);
    window.setTimeout(() => scrollToBottom(true), 0);
  }, [conversationId, draft, scrollToBottom, send, touch]);

  const sendAttachment = useCallback(
    (kind: 'image' | 'video') => {
      const url = mediaPlaceholder(
        `${conversationId}_${kind}_${Date.now()}`,
        kind === 'video' ? 720 : 1200,
        kind === 'video' ? 1280 : 900,
        kind === 'video' ? 'video' : 'photo',
      );
      send(conversationId, '', kind, { media_url: url });
      touch(conversationId, kind === 'video' ? '[视频]' : '[图片]');
      window.setTimeout(() => scrollToBottom(true), 0);
    },
    [conversationId, scrollToBottom, send, touch],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  };

  /* -------------------- 会话不存在 -------------------- */
  if (!conversation) {
    return (
      <AppShell>
        <div className={styles.page}>
          <div className={styles.page__main}>
            <header className={styles.bar}>
              <button
                type="button"
                className={styles.bar__icon}
                aria-label="返回"
                onClick={() => navigate('/messages')}
              >
                <ArrowLeft size={20} strokeWidth={2} aria-hidden />
              </button>
              <span className={styles.bar__title}>会话</span>
            </header>
            <div className={styles.missing}>
              <Info size={26} strokeWidth={1.6} aria-hidden />
              <h2 className={styles.missing__title}>会话不存在</h2>
              <p className={styles.missing__desc}>该会话可能已被删除，或者你没有访问权限。</p>
              <button
                type="button"
                className={styles.missing__btn}
                onClick={() => navigate('/messages')}
              >
                返回消息列表
              </button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const isGroup = conversation.kind === 'group';

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.page__main}>
          {/* ---------- 顶栏 ---------- */}
          <header className={styles.bar}>
            <button
              type="button"
              className={styles.bar__icon}
              aria-label="返回消息列表"
              onClick={() => navigate('/messages')}
            >
              <ArrowLeft size={20} strokeWidth={2} aria-hidden />
            </button>

            <button
              type="button"
              className={styles.bar__titleBtn}
              onClick={() => setInfoOpen(true)}
            >
              <span className={styles.bar__avatarWrap}>
                <span className={styles.bar__avatar}>
                  <img src={conversation.avatar_url} alt="" />
                </span>
                {!isGroup && conversation.online ? <span className={styles.bar__online} /> : null}
              </span>
              <span className={styles.bar__text}>
                <span className={styles.bar__name}>{conversation.title}</span>
                <span className={styles.bar__sub}>
                  {isGroup
                    ? `${conversation.member_count} 位成员`
                    : conversation.online
                      ? '在线'
                      : '最近活跃'}
                </span>
              </span>
            </button>

            <button
              type="button"
              className={styles.bar__icon}
              aria-label="会话详情"
              onClick={() => setInfoOpen(true)}
            >
              <MoreHorizontal size={20} strokeWidth={2} aria-hidden />
            </button>
          </header>

          {/* ---------- 消息流 ---------- */}
          <div className={styles.thread} ref={scrollRef}>
            <div className={styles.thread__intro}>
              <span className={styles.thread__introAvatar}>
                <img src={conversation.avatar_url} alt="" />
              </span>
              <span className={styles.thread__introTitle}>{conversation.title}</span>
              <span className={styles.thread__introDesc}>
                {isGroup
                  ? `群聊 · ${conversation.member_count} 位成员`
                  : `你和 @${conversation.peer_handle ?? ''} 的对话`}
              </span>
            </div>

            {!messages ? (
              <div className={styles.threadLoading}>
                <span className="skeleton-shimmer" style={{ width: '46%', height: 34, borderRadius: 18 }} />
                <span
                  className="skeleton-shimmer"
                  style={{ width: '58%', height: 34, borderRadius: 18, alignSelf: 'flex-end' }}
                />
                <span className="skeleton-shimmer" style={{ width: '38%', height: 34, borderRadius: 18 }} />
              </div>
            ) : (
              messages.map((m) => {
                const mine = m.sender_id === CURRENT_USER.user_id;
                const s = senderOf(m.sender_id);
                return (
                  <MessageBubble
                    key={m.message_id}
                    message={m}
                    mine={mine}
                    showSender={isGroup}
                    senderName={s.name}
                    senderAvatar={s.avatar}
                    onRecall={(msg) => setRecallTarget(msg)}
                  />
                );
              })
            )}

            <div style={{ height: 8 }} />
          </div>

          {/* ---------- 输入区 ---------- */}
          <div className={styles.composer}>
            {emojiOpen ? (
              <div className={styles.emojiPanel}>
                {EMOJI.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className={styles.emojiPanel__item}
                    onClick={() => {
                      setDraft((d) => d + e);
                      inputRef.current?.focus();
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            ) : null}

            <div className={styles.composer__row}>
              <button
                type="button"
                className={styles.composer__icon}
                aria-label="发送图片"
                title="发送图片"
                onClick={() => sendAttachment('image')}
              >
                <ImageIcon size={20} strokeWidth={1.9} aria-hidden />
              </button>
              <button
                type="button"
                className={styles.composer__icon}
                aria-label="发送视频"
                title="发送视频"
                onClick={() => sendAttachment('video')}
              >
                <VideoIcon size={20} strokeWidth={1.9} aria-hidden />
              </button>
              <button
                type="button"
                className={[
                  styles.composer__icon,
                  emojiOpen ? styles['composer__icon--on'] : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-label="表情"
                aria-pressed={emojiOpen}
                onClick={() => setEmojiOpen((v) => !v)}
              >
                <Smile size={20} strokeWidth={1.9} aria-hidden />
              </button>

              <textarea
                ref={inputRef}
                className={styles.composer__input}
                value={draft}
                rows={1}
                placeholder="发送消息…（Enter 发送，Shift+Enter 换行）"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
              />

              <button
                type="button"
                className={styles.composer__send}
                aria-label="发送"
                disabled={!draft.trim()}
                onClick={doSend}
              >
                <Send size={18} strokeWidth={2.1} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- 会话详情面板（单聊/群聊分别渲染）---------- */}
      <ConversationInfoPanel
        open={infoOpen}
        conversation={conversation}
        members={members}
        onClose={() => setInfoOpen(false)}
        onLeft={() => {
          setInfoOpen(false);
          toast.success('已退出该群聊');
          navigate('/messages');
        }}
      />

      {/* ---------- 撤回确认 ---------- */}
      <ConfirmDialog
        open={recallTarget !== null}
        onClose={() => setRecallTarget(null)}
        title="撤回这条消息？"
        confirmText="撤回"
        description="撤回后，所有人都将看不到这条消息的内容。消息会显示为「你撤回了一条消息」。"
        onConfirm={() => {
          if (recallTarget) {
            recall(conversationId, recallTarget.message_id);
            toast.success('已撤回');
          }
          setRecallTarget(null);
        }}
      />
    </AppShell>
  );
}
