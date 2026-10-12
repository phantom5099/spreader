/**
 * 数据访问层（Demo：mock 实现）
 *
 * 接口形状固定，后续接真实后端时只替换本文件内部实现，组件层不动。
 *
 * 分页严格用 keyset 游标（cursor / limit / next_cursor / has_more）
 */
import type { FeedPage, FeedQuery, FeedItem } from '@/types/feed';
import type {
  AccountState,
  ListTab,
  ProfileTab,
  TopicSubscription,
  UserProfile,
  UserSummary,
} from '@/types/user';
import { ALL_FEED_ITEMS } from './feed';
import { CURRENT_USER } from './currentUser';
import { avatarDataUri } from './placeholders';
import {
  ALL_PROFILES,
  MY_BLOCKED,
  MY_FOLLOWERS,
  MY_FOLLOWING,
  MY_MUTED,
  MY_TOPICS,
  accountStateOf,
  findProfileByHandle,
} from './users';
import type { CommentView } from '@/components/comment/CommentItem';

/** 游标内部就承载 (published_at, content_id) 复合键，模拟服务端不透明 token */
function encodeCursor(item: { published_at: string; content_id: string }): string {
  return btoa(`${item.published_at}|${item.content_id}`)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decodeCursor(cursor: string): { ts: number; id: string } | null {
  try {
    const raw = atob(cursor.replace(/-/g, '+').replace(/_/g, '/'));
    const [ts, id] = raw.split('|');
    if (!ts || !id) return null;
    return { ts: Date.parse(ts), id };
  } catch {
    return null;
  }
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/** 模拟网络延迟，让骨架屏/加载态可见 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface FetchFeedOptions extends FeedQuery {
  /** 用于验收演示：注入一次失败，验证错误态 */
  simulateError?: boolean;
}

/**
 * 拉取信息流。
 * 行为要点：
 *  - keyset 分页（next_cursor 锚定"返回的最后一条"）
 *  - has_more 用 limit+1 判定
 *  - limit 超上限向下强制（不报错，AIP-158）
 */
export async function fetchFeed(options: FetchFeedOptions): Promise<FeedPage> {
  const { tab, cursor = null, limit = DEFAULT_LIMIT, simulateError } = options;

  await delay(320 + Math.floor(Math.random() * 180));

  if (simulateError) {
    throw new Error('network');
  }

  const size = Math.min(Math.max(limit, 1), MAX_LIMIT);

  // 「关注流」只取已关注的作者（Demo 简化：viewer_following 为真）
  let pool = ALL_FEED_ITEMS.filter((item) => item.status === 'published');
  if (tab === 'following') {
    pool = pool.filter((item) => item.author.viewer_following);
  }

  // keyset：取严格排在游标之后的部分（倒序，故用 ts < cursor.ts 或同 ts 比 id）
  let startIndex = 0;
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      startIndex = pool.findIndex((item) => {
        const t = Date.parse(item.published_at);
        if (t < decoded.ts) return true;
        if (t > decoded.ts) return false;
        return item.content_id < decoded.id;
      });
      if (startIndex === -1) startIndex = pool.length;
    }
  }

  // limit + 1 超量取数，用于判定 has_more
  const slice = pool.slice(startIndex, startIndex + size + 1);
  const hasMore = slice.length > size;
  const items = hasMore ? slice.slice(0, size) : slice;

  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last) : null;

  return {
    items,
    next_cursor: nextCursor,
    has_more: hasMore,
  };
}

/** 单条详情 */
export async function fetchItem(contentId: string): Promise<FeedItemLike | null> {
  await delay(200);
  return ALL_FEED_ITEMS.find((i) => i.content_id === contentId) ?? null;
}

type FeedItemLike = (typeof ALL_FEED_ITEMS)[number];

/* -------------------------------------------------------------------------- */
/*  评论                                                                        */
/* -------------------------------------------------------------------------- */

const COMMENT_AUTHORS = ['路过的风', '阿柴', '月半', 'Kite', '小满', '老周', 'Luna', '木白'];
const COMMENT_TEXTS = [
  '说得好，我也是这么想的。',
  '这条我收藏了，谢谢分享。',
  '有个不同角度：如果反过来看呢？',
  '哈哈哈太真实了',
  '请问可以转载吗？',
  '前排学习',
  '这正是我最近在纠结的问题，感谢。',
  '同意，补充一点：场景不同结论可能不一样。',
  '收藏了，明天再看一遍。',
  '写得真好，尤其是第二段。',
  '有没有更详细的做法可以分享？',
  '看完受益良多。',
];

/** 生成评论（含一层子回复），确定性（seed 由 contentId 派生） */
function buildComments(contentId: string, count: number, opHandle: string): CommentView[] {
  const seed = [...contentId].reduce((a, c) => a + c.charCodeAt(0), 0);
  const rnd = (n: number) => (seed * (n + 3) * 7919) % 1000 / 1000;
  const out: CommentView[] = [];

  for (let i = 0; i < count; i += 1) {
    const authorIdx = (seed + i * 3) % COMMENT_AUTHORS.length;
    const name = COMMENT_AUTHORS[authorIdx]!;
    const handle = `guest${(seed + i) % 9000}`;
    const hasReplies = rnd(i) > 0.62 && i < count - 1;

    const replies: CommentView[] = hasReplies
      ? Array.from({ length: (i % 2) + 1 }, (_, j) => {
          const rIdx = (seed + i * 5 + j * 7) % COMMENT_AUTHORS.length;
          return {
            comment_id: `${contentId}_c${i}_r${j}`,
            author: {
              user_id: `u_c${rIdx}`,
              nickname: COMMENT_AUTHORS[rIdx]!,
              handle: `guest${(seed + i * 5 + j * 7) % 9000}`,
              avatar_url: avatarDataUri(`c_${seed}_${i}_${j}`, COMMENT_AUTHORS[rIdx]!),
            },
            text: COMMENT_TEXTS[(i + j + 3) % COMMENT_TEXTS.length]!,
            published_at: new Date(Date.now() - (i * 2 + j) * 1800_000).toISOString(),
            counters: { reply: 0, like: (i * 3 + j) % 12 },
            viewer: { liked: false },
            parent_id: `${contentId}_c${i}`,
            reply_to: j === 0 ? handle : `guest${(seed + i * 5 + (j - 1) * 7) % 9000}`,
            isOp: rnd(i + j) > 0.9,
          } satisfies CommentView;
        })
      : [];

    out.push({
      comment_id: `${contentId}_c${i}`,
      author: {
        user_id: `u_c${authorIdx}`,
        nickname: name,
        handle,
        avatar_url: avatarDataUri(`c_${seed}_${i}`, name),
      },
      text: COMMENT_TEXTS[(seed + i * 2) % COMMENT_TEXTS.length]!,
      published_at: new Date(Date.now() - i * 2700_000).toISOString(),
      counters: { reply: replies.length, like: Math.round(rnd(i + 5) * 68) },
      viewer: { liked: rnd(i + 9) > 0.8 },
      // 展示字段
      isAuthor: rnd(i + 13) > 0.88,
      isOp: handle === opHandle,
      media_url: rnd(i + 17) > 0.82 ? item?.media[0]?.cover_url : undefined,
      replies,
    } satisfies CommentView);
  }

  return out;
}

let item: FeedItemLike | undefined;

/** 评论列表（详情页用），返回顶层评论，子回复挂在 replies 上 */
export async function fetchComments(contentId: string): Promise<CommentView[]> {
  await delay(340);
  item = ALL_FEED_ITEMS.find((i) => i.content_id === contentId);
  const replyCount = Math.min(item?.counters.reply ?? 0, 14);
  const opHandle = item?.author.handle ?? '';
  return buildComments(contentId, replyCount, opHandle);
}

/** 发表评论（Demo：直接成功并返回新评论对象） */
export async function postComment(
  contentId: string,
  text: string,
  replyTo?: string,
): Promise<CommentView> {
  await delay(280);
  return {
    comment_id: `${contentId}_local_${Date.now()}`,
    author: {
      user_id: CURRENT_USER.user_id,
      nickname: CURRENT_USER.nickname,
      handle: CURRENT_USER.handle,
      avatar_url: CURRENT_USER.avatar_url,
    },
    text,
    published_at: new Date().toISOString(),
    counters: { reply: 0, like: 0 },
    viewer: { liked: false },
    reply_to: replyTo,
    replies: [],
  };
}

/* -------------------------------------------------------------------------- */
/*  个人主页                                                                   */
/* -------------------------------------------------------------------------- */

export interface ProfileBundle {
  profile: UserProfile;
  state: AccountState;
  /** 动态 / 媒体 / 喜欢 三个 Tab 的内容 */
  posts: FeedItem[];
  media: FeedItem[];
  likes: FeedItem[];
  /** 是否本人主页 */
  isSelf: boolean;
}

/**
 * 拉取个人主页。
 * 不另建内容池：从信息流里按作者确定性筛选，
 * 保证"点进某人的主页能看到他发过的内容"这一直觉成立。
 * 找不到该 handle 时用轮转切片兜底，避免出现空白主页。
 */
export async function fetchProfile(handle: string): Promise<ProfileBundle | null> {
  await delay(300);

  const profile = findProfileByHandle(handle);
  if (!profile) return null;

  const state = accountStateOf(handle);
  if (state !== 'active') {
    return { profile, state, posts: [], media: [], likes: [], isSelf: false };
  }

  const isSelf = profile.user_id === CURRENT_USER.user_id;
  const published = ALL_FEED_ITEMS.filter((i) => i.status === 'published');

  // 作者精确匹配优先；本人主页额外把 author 为 CURRENT_USER 的内容收进来
  let own = published.filter(
    (i) => i.author.user_id === profile.user_id || i.author.handle === profile.handle,
  );
  if (isSelf) {
    own = published.filter(
      (i) => i.author.handle === CURRENT_USER.handle || i.author.handle === handle,
    );
  }

  // 兜底：该用户还没发过内容时，取信息流中确定性的一段作为"他的动态"
  if (own.length < 4) {
    const seed = [...profile.user_id].reduce((a, c) => a + c.charCodeAt(0), 0);
    const offset = seed % Math.max(1, published.length - 12);
    own = published.slice(offset, offset + 10).map((item) => ({
      ...item,
      author: {
        user_id: profile.user_id,
        nickname: profile.nickname,
        handle: profile.handle,
        avatar_url: profile.avatar_url,
      },
    }));
  }

  const posts = [...own].sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));

  // 媒体 Tab：只取有媒体的
  const media = posts.filter((i) => i.media.length > 0);

  // 喜欢 Tab：他人主页为公开喜欢的交集（Demo 取信息流中已点赞的），本人为主页主人 + 轮转
  const likes = published
    .filter((i) => i.viewer.liked || (isSelf && i.viewer.bookmarked))
    .slice(0, 12);

  return {
    profile,
    state,
    posts,
    media: media.length > 0 ? media : posts.slice(0, 6),
    likes: likes.length > 0 ? likes : published.slice(20, 30),
    isSelf,
  };
}

/** 关注 / 取关（Demo：直接成功） */
export async function toggleFollowApi(
  handle: string,
  next: boolean,
): Promise<{ handle: string; following: boolean }> {
  await delay(220);
  return { handle, following: next };
}

export async function updateProfileApi(patch: Partial<UserProfile>): Promise<UserProfile> {
  await delay(320);
  const me = ALL_PROFILES.find((p) => p.relation === 'self')!;
  return { ...me, ...patch };
}

/* -------------------------------------------------------------------------- */
/*  关注 / 粉丝列表与名单管理                                                  */
/* -------------------------------------------------------------------------- */

export async function fetchUserList(
  kind: 'following' | 'followers',
  handle: string,
): Promise<UserSummary[]> {
  await delay(280);
  const profile = findProfileByHandle(handle);
  const isSelf = !profile || profile.relation === 'self' || profile.user_id === CURRENT_USER.user_id;

  if (isSelf) return kind === 'following' ? MY_FOLLOWING : MY_FOLLOWERS;

  // 他人主页：确定性轮转切片，保证每次一致
  const seed = [...handle].reduce((a, c) => a + c.charCodeAt(0), 0);
  const base = kind === 'following' ? MY_FOLLOWING : MY_FOLLOWERS;
  const count = Math.min(base.length, 12 + (seed % 14));
  const start = seed % (base.length - count);
  return base.slice(start, start + count);
}

interface ListBundle {
  blocked: UserSummary[];
  muted: UserSummary[];
  topics: TopicSubscription[];
}

export async function fetchMyLists(tab: ListTab): Promise<ListBundle> {
  await delay(260);
  void tab;
  return { blocked: MY_BLOCKED, muted: MY_MUTED, topics: MY_TOPICS };
}

export type { AccountState, ListTab, ProfileTab, TopicSubscription, UserProfile, UserSummary };

/** 供页面判断个人主页 Tab 是否有内容 */
export type { FeedItem };
