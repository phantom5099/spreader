/**
 * 消息与通知 mock 数据
 * 确定性生成，固定 seed，刷新一致。
 */
import type {
  Conversation,
  ConversationSettings,
  GroupMember,
  Message,
  NotificationCategory,
  NotificationItem,
  NotificationVerb,
} from '@/types/message';
import { ALL_FEED_ITEMS } from './feed';
import { ALL_PROFILES, MY_FOLLOWING } from './users';
import { mediaPlaceholder } from './placeholders';
import { CURRENT_USER } from './currentUser';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261013);

const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;

const BASE_TIME = new Date('2026-10-11T14:30:00Z').getTime();
const minutesAgo = (m: number) => new Date(BASE_TIME - m * 60_000).toISOString();

const GOLDEN = {
  user_id: CURRENT_USER.user_id,
  nickname: CURRENT_USER.nickname,
  handle: CURRENT_USER.handle,
  avatar_url: CURRENT_USER.avatar_url,
};

/* -------------------------------------------------------------------------- */
/*  会话                                                                        */
/* -------------------------------------------------------------------------- */

const PEERS = ALL_PROFILES.filter((p) => p.relation !== 'self').slice(0, 9);

const DM_PREVIEWS = [
  '好，那就按这个方案推进。',
  '刚看到你发的那条，写得太好了。',
  '图片收到了，我晚点处理一下。',
  '明天下午三点方便吗？',
  '哈哈哈哈哈这也太真实了',
  '那本书我借你看，下周带给你。',
  '这个 bug 我复现了，是并发写的问题。',
  '你上次说的那个工具叫什么来着？',
  '已经在改了，今晚应该能提测。',
];

const GROUP_SEEDS: Array<{ title: string; size: number }> = [
  { title: '前端周会 · 产品组', size: 12 },
  { title: '周末爬山小分队', size: 8 },
  { title: '独立开发者闲聊群', size: 36 },
  { title: '摄影交流群', size: 24 },
];

/** 生成会话列表：3 个单聊 + 4 个群聊 */
function buildConversations(): Conversation[] {
  const direct: Conversation[] = PEERS.slice(0, 3).map((p, i) => {
    const unread = i === 0 ? int(1, 4) : i === 1 ? 1 : 0;
    return {
      conversation_id: `c_dm_${i + 1}`,
      kind: 'direct',
      title: p.nickname,
      avatar_url: p.avatar_url,
      online: i === 0 || i === 2,
      last_message: DM_PREVIEWS[i]!,
      last_at: minutesAgo([4, 48, 260][i]!),
      unread,
      pinned: i === 0,
      muted: false,
      peer_handle: p.handle,
    };
  });

  const groups: Conversation[] = GROUP_SEEDS.map((g, i) => {
    const members = ALL_PROFILES.filter((p) => p.relation !== 'self').slice(i * 2, i * 2 + 3);
    const unread = i === 2 ? int(2, 6) : i === 3 ? 0 : i === 0 ? 1 : 0;
    return {
      conversation_id: `c_grp_${i + 1}`,
      kind: 'group',
      title: g.title,
      avatar_url: members[0]?.avatar_url ?? GOLDEN.avatar_url,
      member_avatars: members.map((m) => m.avatar_url),
      member_count: g.size,
      online: false,
      last_message: [
        '阿泽：那我先把接口文档更新一下',
        '温屿：这周末天气不错，老时间老地点',
        '陆离：有人一起看看这个开源项目吗',
        '沈知白：这组片子后期我调了一版',
      ][i]!,
      last_at: minutesAgo([12, 150, 380, 900][i]!),
      unread,
      pinned: false,
      muted: i === 3,
    };
  });

  /* 会话列表按"置顶优先 + 最近消息时间倒序" */
  return [...direct, ...groups].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return Date.parse(b.last_at) - Date.parse(a.last_at);
  });
}

export const CONVERSATIONS: Conversation[] = buildConversations();

/* -------------------------------------------------------------------------- */
/*  消息                                                                        */
/* -------------------------------------------------------------------------- */

const DM_LINES: Record<string, string[]> = {
  c_dm_1: [
    '在吗？想请教个问题',
    '你说，第三方登录那块我不想接真实平台，Demo 里怎么处理比较自然？',
    '可以用一个明显的"未接入"图标，一眼看出是占位但又不是空白。',
    '好，那就按这个方案推进。',
  ],
  c_dm_2: [
    '刚看到你发的那条，写得太好了。',
    '尤其是"工具只会放大你原本的工作方式"那句。',
    '哈哈，这句我自己也挺喜欢的。',
  ],
  c_dm_3: [
    '上次借你的那本《城市意象》还在吗',
    '在的，下周带给你。',
    '不急，就是想起来了问一下。',
  ],
};

const GROUP_LINES: Record<string, Array<{ from: number; text: string }>> = {
  c_grp_1: [
    { from: 1, text: '明天的周会挪到上午十点可以吗' },
    { from: 2, text: '可以' },
    { from: 3, text: '我这边也行，那我把日程改了' },
    { from: 4, text: '那我先把接口文档更新一下' },
  ],
  c_grp_2: [
    { from: 2, text: '这周末天气不错，老时间老地点？' },
    { from: 1, text: '收到，我带点补给' },
    { from: 3, text: '我可能晚半小时，你们先走' },
  ],
  c_grp_3: [
    { from: 1, text: '有人一起看看这个开源项目吗' },
    { from: 2, text: '发我个链接，我看看' },
    { from: 3, text: '这个我用过一阵，文档写得挺清楚' },
  ],
  c_grp_4: [
    { from: 2, text: '这组片子后期我调了一版' },
    { from: 1, text: '色调偏暖了，我更喜欢上一版' },
  ],
};

function buildMessages(conv: Conversation): Message[] {
  const lines =
    conv.kind === 'direct'
      ? (DM_LINES[conv.conversation_id] ?? []).map((text, i) => ({
          from: i % 2 === 0 ? 1 : 0,
          text,
        }))
      : (GROUP_LINES[conv.conversation_id] ?? []);

  const peerPool = conv.kind === 'direct' ? PEERS : PEERS.slice(0, 6);

  const out: Message[] = lines.map((l, i) => {
    const mine = l.from === 0;
    return {
      message_id: `${conv.conversation_id}_m${i}`,
      conversation_id: conv.conversation_id,
      sender_id: mine ? GOLDEN.user_id : (peerPool[(l.from + 1) % peerPool.length]?.user_id ?? 'u_x'),
      kind: 'text',
      text: l.text,
      published_at: minutesAgo((lines.length - i) * 6 + 2),
      status: mine ? (i === lines.length - 1 ? 'read' : 'delivered') : 'read',
    };
  });

  /* 在单聊里插入一条图片、一条动态卡片，覆盖各类消息类型 */
  if (conv.kind === 'direct' && conv.conversation_id === 'c_dm_1' && out.length >= 3) {
    const first = ALL_FEED_ITEMS.find((f) => f.status === 'published')!;
    out.splice(2, 0, {
      message_id: `${conv.conversation_id}_m_img`,
      conversation_id: conv.conversation_id,
      sender_id: GOLDEN.user_id,
      kind: 'image',
      text: '',
      media_url: mediaPlaceholder(`${conv.conversation_id}_img`, 1200, 900, 'photo'),
      published_at: minutesAgo(20),
      status: 'read',
    });
    out.push({
      message_id: `${conv.conversation_id}_m_post`,
      conversation_id: conv.conversation_id,
      sender_id: peerPool[0]!.user_id,
      kind: 'post',
      text: '这个可以参考一下',
      media_url: first.media[0]?.cover_url,
      content_id: first.content_id,
      published_at: minutesAgo(1),
      status: 'read',
    });
  }

  return out;
}

const MESSAGE_CACHE = new Map<string, Message[]>();

export function messagesOf(conversationId: string): Message[] {
  if (!MESSAGE_CACHE.has(conversationId)) {
    const conv = CONVERSATIONS.find((c) => c.conversation_id === conversationId);
    if (!conv) return [];
    MESSAGE_CACHE.set(conversationId, buildMessages(conv));
  }
  return MESSAGE_CACHE.get(conversationId)!;
}

/* ---------- 可变操作（只给数据访问层 api.ts 用）----------
   缓存即"服务端库表"，返回的一律是副本，调用方拿不到内部引用。 */

/** 读取会话消息（副本） */
export function readMessages(conversationId: string): Message[] {
  return messagesOf(conversationId).map((m) => ({ ...m }));
}

/** 落库一条新消息（message_id 由客户端生成，后端原样接受） */
export function appendMessage(message: Message): Message {
  const list = messagesOf(message.conversation_id);
  list.push(message);
  return { ...message };
}

/** 撤回：清空正文与媒体，只留 recalled 占位；找不到返回 null */
export function markRecalled(conversationId: string, messageId: string): Message | null {
  const list = messagesOf(conversationId);
  const index = list.findIndex((m) => m.message_id === messageId);
  if (index === -1) return null;
  const next: Message = {
    ...list[index]!,
    recalled: true,
    text: '',
    media_url: undefined,
    content_id: undefined,
  };
  list[index] = next;
  return { ...next };
}

/* -------------------------------------------------------------------------- */
/*  群成员                                                                      */
/* -------------------------------------------------------------------------- */

export function membersOf(conversationId: string): GroupMember[] {
  const conv = CONVERSATIONS.find((c) => c.conversation_id === conversationId);
  if (!conv || conv.kind !== 'group') return [];

  const owner = {
    user_id: GOLDEN.user_id,
    nickname: GOLDEN.nickname,
    handle: GOLDEN.handle,
    avatar_url: GOLDEN.avatar_url,
    role: 'owner' as const,
    online: true,
  };

  const rest = MY_FOLLOWING.slice(0, 9).map((u, i) => ({
    user_id: u.user_id,
    nickname: u.nickname,
    handle: u.handle,
    avatar_url: u.avatar_url,
    role: (i === 0 ? 'admin' : 'member') as 'admin' | 'member',
    online: i < 3,
  }));

  return [owner, ...rest];
}

/* -------------------------------------------------------------------------- */
/*  会话设置                                                                    */
/* -------------------------------------------------------------------------- */

export function defaultSettings(conv: Conversation): ConversationSettings {
  return {
    muted: conv.muted ?? false,
    quiet_hours: conv.muted ? '22:00–08:00' : null,
    pinned: conv.pinned ?? false,
    read_receipts: true,
  };
}

/* -------------------------------------------------------------------------- */
/*  通知中心                                                                   */
/* -------------------------------------------------------------------------- */

function buildNotifications(): NotificationItem[] {
  const published = ALL_FEED_ITEMS.filter((i) => i.status === 'published');
  const actors = ALL_PROFILES.filter((p) => p.relation !== 'self');
  const out: NotificationItem[] = [];

  const plan: Array<{ verb: NotificationVerb; category: Exclude<NotificationCategory, 'all'>; count: number }> = [
    { verb: 'like', category: 'like', count: 7 },
    { verb: 'follow', category: 'follow', count: 5 },
    { verb: 'reply', category: 'reply', count: 4 },
    { verb: 'mention', category: 'mention', count: 3 },
    { verb: 'repost', category: 'like', count: 2 },
    { verb: 'quote', category: 'mention', count: 2 },
  ];

  let idx = 0;
  let cursor = 3;

  for (const p of plan) {
    for (let i = 0; i < p.count; i += 1) {
      const actor = actors[idx % actors.length]!;
      const target = published[idx % published.length]!;
      const others = p.verb === 'like' || p.verb === 'follow' ? (idx % 3 === 0 ? int(1, 9) : 0) : 0;

      out.push({
        notification_id: `n_${idx}`,
        category: p.category,
        verb: p.verb,
        actor: {
          user_id: actor.user_id,
          nickname: actor.nickname,
          handle: actor.handle,
          avatar_url: actor.avatar_url,
        },
        others_count: others || undefined,
        target_text:
          p.verb === 'follow' ? undefined : target.text.slice(0, 90) || '（含媒体的动态）',
        target_media: p.verb === 'follow' ? undefined : target.media[0]?.cover_url,
        content_id: p.verb === 'follow' ? undefined : target.content_id,
        published_at: minutesAgo(cursor),
        read: idx > 4,
      });

      idx += 1;
      cursor += int(4, 90);
    }
  }

  return out.sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
}

export const NOTIFICATIONS: NotificationItem[] = buildNotifications();

/** 供新会话使用：可选的群聊成员池 */
export const GROUP_CANDIDATES = MY_FOLLOWING.slice(0, 18);
