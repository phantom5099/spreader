/**
 * 消息与通知契约类型
 */

type ConversationKind = 'direct' | 'group';

/** 消息类型：纯文字 / 图片 / 视频 / 动态分享卡片 */
type MessageKind = 'text' | 'image' | 'video' | 'post';

/** 消息状态：发送中 〇 / 已发送 ✓ / 已送达 ✓✓ / 已读 ✓✓ */
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

export interface Message {
  message_id: string;
  conversation_id: string;
  /** 发送者 user_id；自己发的用于左右分列判定 */
  sender_id: string;
  kind: MessageKind;
  text: string;
  /** 图片/视频/动态卡片的媒体地址 */
  media_url?: string;
  /** 动态卡片引用的 content_id */
  content_id?: string;
  published_at: string;
  status: MessageStatus;
  /** 是否被撤回（渲染为灰色斜体占位） */
  recalled?: boolean;
  /** @提及到的用户名 */
  mentions?: string[];
}

export interface Conversation {
  conversation_id: string;
  kind: ConversationKind;
  /** 单聊为对方昵称，群聊为群名 */
  title: string;
  avatar_url: string;
  /** 群聊时展示成员头像堆叠 */
  member_avatars?: string[];
  member_count?: number;
  /** 在线状态（10px 绿点，离线不显示点） */
  online: boolean;
  last_message: string;
  last_at: string;
  unread: number;
  /** 置顶 */
  pinned?: boolean;
  /** 免打扰 */
  muted?: boolean;
  /** 单聊时为对方 handle */
  peer_handle?: string;
}

export interface GroupMember {
  user_id: string;
  nickname: string;
  handle: string;
  avatar_url: string;
  /** 群主 / 管理员 / 成员 */
  role: 'owner' | 'admin' | 'member';
  online: boolean;
}

export interface ConversationSettings {
  muted: boolean;
  /** 免打扰时段（"22:00–08:00"），未开启为 null */
  quiet_hours: string | null;
  pinned: boolean;
  /** 是否显示已读回执 */
  read_receipts: boolean;
}

/* -------------------------------------------------------------------------- */
/*  通知中心                                                                   */
/* -------------------------------------------------------------------------- */

export type NotificationCategory = 'all' | 'mention' | 'like' | 'follow' | 'reply';

export type NotificationVerb = 'like' | 'repost' | 'follow' | 'reply' | 'mention' | 'quote';

export interface NotificationItem {
  notification_id: string;
  category: Exclude<NotificationCategory, 'all'>;
  verb: NotificationVerb;
  /** 触发者（关注类通知可能有多个，取主展示） */
  actor: {
    user_id: string;
    nickname: string;
    handle: string;
    avatar_url: string;
  };
  /** 关注类同时有多个触发者时的额外计数 */
  others_count?: number;
  /** 被涉及的动态摘要文本 */
  target_text?: string;
  target_media?: string;
  content_id?: string;
  published_at: string;
  read: boolean;
}
