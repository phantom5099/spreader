/**
 * 消息状态（zustand）
 * 发送中 〇 → 已发送 ✓ → 已送达 ✓✓ → 已读 ✓✓
 * 撤回后替换为灰色斜体占位。
 *
 * 读写一律走数据访问层（@/mocks/api），store 只做状态编排：
 * 拉取 / 发送 / 撤回各对应一个接口，后续换真实后端时本文件不用改。
 */
import { create } from 'zustand';
import type { Message, MessageStatus } from '@/types/message';
import { fetchMessages, recallMessageApi, sendMessageApi } from '@/mocks/api';
import { CURRENT_USER } from '@/mocks/currentUser';

interface MessageState {
  /** conversation_id → 消息列表 */
  messages: Record<string, Message[]>;
  /** 正在加载的会话 */
  loading: string | null;

  load: (conversationId: string) => void;
  send: (conversationId: string, text: string, kind?: Message['kind'], extra?: Partial<Message>) => string;
  recall: (conversationId: string, messageId: string) => Promise<void>;
  /** 进入会话时把对方发来的消息标为已读 */
  markRead: (conversationId: string) => void;
  clear: (conversationId: string) => void;
}

/** 局部替换某条消息 */
function patchMessage(
  set: (fn: (s: MessageState) => Partial<MessageState>) => void,
  conversationId: string,
  messageId: string,
  patch: Partial<Message>,
) {
  set((s) => ({
    messages: {
      ...s.messages,
      [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
        m.message_id === messageId ? { ...m, ...patch } : m,
      ),
    },
  }));
}

/** 模拟一次送达过程：sending → sent → delivered，偶发 read */
function scheduleStatus(
  set: (fn: (s: MessageState) => Partial<MessageState>) => void,
  conversationId: string,
  messageId: string,
) {
  const patch = (status: MessageStatus) => patchMessage(set, conversationId, messageId, { status });

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
    void fetchMessages(conversationId)
      .then((list) => {
        set((s) => ({ messages: { ...s.messages, [conversationId]: list }, loading: null }));
      })
      .catch(() => set({ loading: null }));
  },

  send: (conversationId, text, kind = 'text', extra) => {
    /* 客户端生成幂等键：乐观 UI 与落库结果共用同一个 id，
       后续撤回/删除不需要再做「临时 id → 服务端 id」的替换 */
    const id = `${conversationId}_m_${Date.now()}`;
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
        [conversationId]: [...(s.messages[conversationId] ?? []), message],
      },
    }));

    /* 落库后才推进状态；失败则停在"发送中"（真实接入时在此重试） */
    void sendMessageApi({ message_id: id, conversation_id: conversationId, text, kind, extra })
      .then(() => scheduleStatus(set, conversationId, id))
      .catch(() => undefined);

    return id;
  },

  recall: async (conversationId, messageId) => {
    const next = await recallMessageApi(conversationId, messageId);
    patchMessage(set, conversationId, messageId, next);
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
