/**
 * 会话列表状态（zustand）
 */
import { create } from 'zustand';
import type { Conversation, ConversationSettings } from '@/types/message';
import { CONVERSATIONS, defaultSettings } from '@/mocks/messages';
import { CURRENT_USER } from '@/mocks/currentUser';

interface ConversationState {
  list: Conversation[];
  /** conversation_id → 会话设置 */
  settings: Record<string, ConversationSettings>;
  /** 免打扰时段等在本会话内的覆盖值 */

  clearUnread: (conversationId: string) => void;
  /** 更新最后一条消息预览（发送 / 接收后调用） */
  touch: (conversationId: string, preview: string) => void;
  updateSettings: (conversationId: string, patch: Partial<ConversationSettings>) => void;
  createGroup: (title: string, memberIds: string[]) => string;
  leave: (conversationId: string) => void;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  list: CONVERSATIONS,
  settings: Object.fromEntries(CONVERSATIONS.map((c) => [c.conversation_id, defaultSettings(c)])),

  clearUnread: (conversationId) =>
    set((s) => {
      const target = s.list.find((c) => c.conversation_id === conversationId);
      /* 幂等：本来就已读时直接返回原 state，避免产生新的 list 引用。
         调用方常在 effect 里调本方法，若每次都换数组引用，
         配合组件对 list 的订阅会形成无限重渲染。 */
      if (!target || target.unread === 0) return s;
      return {
        list: s.list.map((c) =>
          c.conversation_id === conversationId ? { ...c, unread: 0 } : c,
        ),
      };
    }),

  touch: (conversationId, preview) =>
    set({
      list: get()
        .list.map((c) =>
          c.conversation_id === conversationId
            ? { ...c, last_message: preview, last_at: new Date().toISOString(), unread: 0 }
            : c,
        )
        .sort((a, b) => {
          if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
          return Date.parse(b.last_at) - Date.parse(a.last_at);
        }),
    }),

  updateSettings: (conversationId, patch) =>
    set({
      settings: {
        ...get().settings,
        [conversationId]: { ...get().settings[conversationId]!, ...patch },
      },
      list: get().list.map((c) =>
        c.conversation_id === conversationId ? { ...c, muted: patch.muted ?? c.muted } : c,
      ),
    }),

  createGroup: (title, memberIds) => {
    const id = `c_grp_new_${Date.now()}`;
    const members = memberIds.slice(0, 3);
    const conv: Conversation = {
      conversation_id: id,
      kind: 'group',
      title,
      avatar_url: CURRENT_USER.avatar_url,
      member_avatars: members,
      member_count: memberIds.length + 1,
      online: false,
      last_message: '该群聊已创建',
      last_at: new Date().toISOString(),
      unread: 0,
    };
    set({ list: [conv, ...get().list] });
    return id;
  },

  leave: (conversationId) =>
    set({ list: get().list.filter((c) => c.conversation_id !== conversationId) }),
}));
