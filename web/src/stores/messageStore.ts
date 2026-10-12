/**
 * 消息状态（zustand）
 * 发送中 〇 → 已发送 ✓ → 已送达 ✓✓ → 已读 ✓✓
 * 撤回后替换为灰色斜体占位。
 */
import { create } from 'zustand';
import type { Message, MessageStatus } from '@/types/message';
import { messagesOf } from '@/mocks/messages';
import { CURRENT_USER } from '@/mocks/currentUser';

interface MessageState {
  /** conversation_id → 消息列表 */
  messages: Record<string, Message[]>;
  /** 正在加载的会话 */
  loading: string | null;

  load: (conversationId: string) => void;
  send: (conversationId: string, text: string, kind?: Message['kind'], extra?: Partial<Message>) => string;
  recall: (conversationId: string, messageId: string) => void;
  /** 进入会话时把对方发来的消息标为已读 */
  markRead: (conversationId: string) => void;
  clear: (conversationId: string) => void;
}

/** 模拟一次送达过程：sending → sent → delivered，偶发 read */
function scheduleStatus(
  set: (fn: (s: MessageState) => Partial<MessageState>) => void,
  conversationId: string,
  messageId: string,
) {
  const patch = (status: MessageStatus) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
          m.message_id === messageId ? { ...m, status } : m,
        ),
      },
    }));

  window.setTimeout(() => patch('sent'), 420);
  window.setTimeout(() => patch('delivered'), 1100);
  /* 对方在线时会很快显示已读 */
  if (Math.random() > 0.35) window.setTimeout(() => patch('read'), 2600);
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: {},
  loading: null,

  load: (conversationId) => {
    if (get().messages[conversationId]) return;
    set({ loading: conversationId });
    /* Demo：数据同步生成，用一次微任务让骨架屏有机会渲染 */
    window.setTimeout(() => {
      set((s) => ({
        messages: { ...s.messages, [conversationId]: messagesOf(conversationId) },
        loading: null,
      }));
    }, 260);
  },

  send: (conversationId, text, kind = 'text', extra) => {
    const id = `${conversationId}_local_${Date.now()}`;
    const message: Message = {
      message_id: id,
      conversation_id: conversationId,
      sender_id: CURRENT_USER.user_id,
      kind,
      text,
      published_at: new Date().toISOString(),
      status: 'sending',
      ...extra,
    };

    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: [...(s.messages[conversationId] ?? messagesOf(conversationId)), message],
      },
    }));

    scheduleStatus(set, conversationId, id);
    return id;
  },

  recall: (conversationId, messageId) => {
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
          m.message_id === messageId ? { ...m, recalled: true, text: '', media_url: undefined } : m,
        ),
      },
    }));
  },

  markRead: (conversationId) =>
    set((s) => {
      const list = s.messages[conversationId] ?? [];
      /* 幂等：没有任何"未读"消息时不写回，避免无谓的新引用 */
      const hasUnread = list.some(
        (m) => m.sender_id !== CURRENT_USER.user_id && m.status !== 'read',
      );
      if (!hasUnread) return s;
      return {
        messages: {
          ...s.messages,
          [conversationId]: list.map((m) =>
            m.sender_id === CURRENT_USER.user_id ? m : { ...m, status: 'read' as MessageStatus },
          ),
        },
      };
    }),

  clear: (conversationId) => {
    set((s) => {
      const next = { ...s.messages };
      delete next[conversationId];
      return { messages: next };
    });
  },
}));
