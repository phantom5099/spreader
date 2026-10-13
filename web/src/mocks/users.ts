/**
 * 用户与关系 mock 数据
 * 确定性生成，固定 seed，刷新一致。
 * 复用 feed.ts 的作者池，保证同一个人在所有页面的头像/昵称一致。
 */
import type { Author } from '@/types/feed';
import type {
  AccountState,
  ListTab,
  ProfileTab,
  TopicSubscription,
  UserProfile,
  UserSummary,
} from '@/types/user';
import { avatarDataUri } from './placeholders';
import { SUGGESTED_USERS } from './feed';
import { CURRENT_USER } from './currentUser';

/* -------------------------------------------------------------------------- */
/*  确定性伪随机（与 feed.ts 同一算法，固定 seed）                                */
/* -------------------------------------------------------------------------- */

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

const rand = mulberry32(20261012);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;

/* -------------------------------------------------------------------------- */
/*  封面图（600×200 渐变占位，与头像同一套确定性思路）                            */
/* -------------------------------------------------------------------------- */

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** 生成封面 data-URI：双色斜向渐变 + 一层淡纹理，600×200 */
export function coverDataUri(seed: string): string {
  const h = hash(seed);
  const hue = h % 360;
  const hue2 = (hue + 55) % 360;
  const hue3 = (hue + 200) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="cover" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue},62%,58%)"/>
      <stop offset="55%" stop-color="hsl(${hue2},58%,48%)"/>
      <stop offset="100%" stop-color="hsl(${hue3},52%,38%)"/>
    </linearGradient>
  </defs>
  <rect width="600" height="200" fill="url(#cover)"/>
  <g opacity="0.16" fill="#fff">
    <circle cx="${100 + (h % 180)}" cy="${40 + (h % 60)}" r="${52 + (h % 30)}"/>
    <circle cx="${420 - (h % 120)}" cy="${150 - (h % 40)}" r="${34 + (h % 26)}"/>
    <rect x="${280 + (h % 90)}" y="${-30 + (h % 60)}" width="${90 + (h % 50)}" height="${90 + (h % 50)}" rx="28"/>
  </g>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* -------------------------------------------------------------------------- */
/*  资料池                                                                      */
/* -------------------------------------------------------------------------- */

const LOCATIONS = ['上海', '杭州', '深圳', '成都', '北京', '广州', '南京', '厦门', '远程'];
const SITES = ['zhixia.dev', 'mubai.studio', 'chenmo.blog', 'yueban.me', 'luna.design', ''];

const BIOS_EXTRA = [
  '写字、拍照，偶尔写代码。',
  '在做一个没人要的产品。',
  '长跑爱好者 · 前建筑师',
  'Believe in small steps.',
  '不太会上网，但很会发呆。',
  '把每一天过成可以记住的样子。',
  '独立开发者 / 播客主播',
  'Framer, photographer, friend.',
];

const USER_POOL: Author[] = [
  ...SUGGESTED_USERS.map((u) => ({
    user_id: u.user_id,
    nickname: u.nickname,
    handle: u.handle,
    avatar_url: u.avatar_url,
    viewer_following: u.viewer_following,
  })),
];

/** 供列表页展示的补充池（保证 30 条以上关注/粉丝不重复） */
const EXTRA_HANDLES = [
  'lucy.wang', 'kwame_owusu', '赵一舟', 'Bianca Rossi', '阿泽',
  'henry_choi', '沈知白', 'Noa Lindqvist', '秦九', 'gaby.mtz',
  'Yusuf Aydın', '温故', 'echo_lin', '曾小满', 'Priya Nair',
  '陆离', 'tomasz.w', 'Anna Kowalska', '程昱', 'hazel.kim',
  '孟繁星', 'Oliver Brandt', '柏川', 'sana.tanaka', '倪安',
  'Ravi Menon', '桑榆', 'elif.demir', '裴清让', '郑南岸',
];

const EXTRA_NAMES = [
  'Lucy Wang', 'Kwame Owusu', '赵一舟', 'Bianca Rossi', '阿泽',
  'Henry Choi', '沈知白', 'Noa Lindqvist', '秦九', 'Gaby Martínez',
  'Yusuf Aydın', '温故', 'Echo Lin', '曾小满', 'Priya Nair',
  '陆离', 'Tomasz Wójcik', 'Anna Kowalska', '程昱', 'Hazel Kim',
  '孟繁星', 'Oliver Brandt', '柏川', 'Sana Tanaka', '倪安',
  'Ravi Menon', '桑榆', 'Elif Demir', '裴清让', '郑南岸',
];

const ALL_PEOPLE: Array<{ nickname: string; handle: string; seed: string }> = [
  ...USER_POOL.map((u) => ({ nickname: u.nickname, handle: u.handle, seed: u.user_id })),
  ...EXTRA_HANDLES.map((handle, i) => ({
    nickname: EXTRA_NAMES[i]!,
    handle,
    seed: `u_ext_${handle}`,
  })),
];

/* -------------------------------------------------------------------------- */
/*  生成资料                                                                    */
/* -------------------------------------------------------------------------- */

function buildProfile(index: number): UserProfile {
  const person = ALL_PEOPLE[index % ALL_PEOPLE.length]!;

  // 关系分布：约 45% 已关注、8% 未关注且对方关注我（互关候选）、其余未关注
  const roll = rand();
  const following = roll < 0.45;
  const followsMe = following ? rand() > 0.4 : rand() < 0.12;

  return {
    user_id: person.seed,
    nickname: person.nickname,
    handle: person.handle,
    avatar_url: avatarDataUri(person.seed, person.nickname),
    cover_url: coverDataUri(person.seed),
    bio: rand() > 0.35 ? pick(BIOS_EXTRA) : '',
    location: rand() > 0.25 ? pick(LOCATIONS) : undefined,
    website: rand() > 0.5 ? pick(SITES.filter(Boolean)) : undefined,
    joined_at: new Date(Date.UTC(2024, int(0, 11), int(1, 28))).toISOString(),
    following: int(80, 2400),
    followers: int(120, 320000),
    relation: following ? 'following' : 'none',
    follows_me: followsMe,
  };
}

/** 全部可浏览的用户资料（含自己，放在最前） */
export const ALL_PROFILES: UserProfile[] = [
  {
    user_id: CURRENT_USER.user_id,
    nickname: CURRENT_USER.nickname,
    handle: CURRENT_USER.handle,
    avatar_url: CURRENT_USER.avatar_url,
    cover_url: coverDataUri(CURRENT_USER.user_id),
    bio: CURRENT_USER.bio,
    location: '杭州',
    website: 'zhixia.dev',
    joined_at: new Date('2026-10-01T00:00:00Z').toISOString(),
    following: CURRENT_USER.following,
    followers: CURRENT_USER.followers,
    relation: 'self',
    follows_me: false,
  },
  ...Array.from({ length: 42 }, (_, i) => buildProfile(i)),
];

/* -------------------------------------------------------------------------- */
/*  名单（关注 / 粉丝 / 话题）                                                    */
/* -------------------------------------------------------------------------- */

function toSummary(p: UserProfile, followsMe: boolean): UserSummary {
  return {
    user_id: p.user_id,
    nickname: p.nickname,
    handle: p.handle,
    avatar_url: p.avatar_url,
    bio: p.bio,
    follows_me: followsMe,
    following: p.relation === 'following',
    blocked: false,
  };
}

const OTHERS = ALL_PROFILES.filter((p) => p.relation !== 'self');

/**
 * 我关注的人
 *
 * 只取 relation 为 following 的资料——列表里的每一行都确实是我已关注的人，
 * 否则同一条数据既当"我关注的人"又当"我没关注的人"，行内按钮就无从判断该显示哪种状态。
 */
export const MY_FOLLOWING: UserSummary[] = OTHERS.filter((p) => p.relation === 'following').map(
  (p) => toSummary(p, p.follows_me),
);

/**
 * 他人主页的关注 / 粉丝名单取样池
 *
 * 保留资料本来的关注关系，行内按钮因此会自然出现"已关注 / 未关注"两种状态。
 */
export const PEOPLE_POOL: UserSummary[] = OTHERS.map((p) => toSummary(p, p.follows_me));

/** 我的粉丝（Demo 取 34 位，其中一半我已回关） */
export const MY_FOLLOWERS: UserSummary[] = [
  ...OTHERS.slice(6),
  ...OTHERS.slice(0, 6),
]
  .slice(0, 34)
  .map((p) => toSummary(p, p.relation === 'following'));

/** 我关注的话题（管理入口，名单管理页第三 Tab） */
export const MY_TOPICS: TopicSubscription[] = [
  { topic: '独立开发', post_count: 31500, category: '科技', subscribed_at: '2026-08-14T09:20:00Z' },
  { topic: '摄影构图', post_count: 48200, category: '艺术', subscribed_at: '2026-07-02T13:05:00Z' },
  { topic: '手冲咖啡', post_count: 12600, category: '生活', subscribed_at: '2026-09-21T18:40:00Z' },
  { topic: 'remote work', post_count: 19400, category: '科技', subscribed_at: '2026-06-11T07:15:00Z' },
  { topic: '深夜emo', post_count: 27800, category: '生活', subscribed_at: '2026-10-03T22:10:00Z' },
  { topic: '城市漫步', post_count: 8600, category: '生活', subscribed_at: '2026-09-08T11:30:00Z' },
  { topic: '前端工程化', post_count: 15200, category: '科技', subscribed_at: '2026-05-27T15:55:00Z' },
];

/** 黑名单（第一 Tab，Demo 预置 3 人） */
export const MY_BLOCKED: UserSummary[] = OTHERS.slice(30, 33).map((p) => ({
  ...toSummary(p, false),
  blocked: true,
}));

/** 静音列表（第二 Tab，Demo 预置 4 人） */
export const MY_MUTED: UserSummary[] = OTHERS.slice(34, 38).map((p) =>
  toSummary(p, p.follows_me),
);

/* -------------------------------------------------------------------------- */
/*  特殊样本（用于演示 4 种账号可访问性状态）                                      */
/* -------------------------------------------------------------------------- */

/** 已注销账号：整页替换为"该账号已注销" */
const DEACTIVATED_PROFILE: UserProfile = {
  user_id: 'u_deactivated_demo',
  nickname: '已注销用户',
  handle: 'gone_quiet',
  avatar_url: avatarDataUri('u_deactivated_demo', '已'),
  cover_url: coverDataUri('u_deactivated_demo'),
  bio: '',
  joined_at: new Date('2024-02-18T00:00:00Z').toISOString(),
  following: 0,
  followers: 0,
  relation: 'none',
  follows_me: false,
};

/** 拉黑了我 / 被我拉黑的账号 */
const BLOCKED_ME_PROFILE: UserProfile = {
  ...OTHERS[0]!,
  user_id: 'u_blocked_me_demo',
  nickname: 'Wayne Doe',
  handle: 'wayne_doe',
  avatar_url: avatarDataUri('u_blocked_me_demo', 'W'),
  cover_url: coverDataUri('u_blocked_me_demo'),
  bio: '',
  relation: 'none',
  follows_me: false,
};

/** handle → 账号可访问性（Demo：只给两个特殊 handle 挂状态） */
const ACCOUNT_STATE_MAP: Record<string, AccountState> = {
  gone_quiet: 'deactivated',
  wayne_doe: 'blocked_me',
};

/* -------------------------------------------------------------------------- */
/*  按 handle 查资料                                                            */
/* -------------------------------------------------------------------------- */

export function findProfileByHandle(handle: string): UserProfile | null {
  if (handle === DEACTIVATED_PROFILE.handle) return DEACTIVATED_PROFILE;
  if (handle === BLOCKED_ME_PROFILE.handle) return BLOCKED_ME_PROFILE;
  return ALL_PROFILES.find((p) => p.handle === handle) ?? null;
}

export function accountStateOf(handle: string): AccountState {
  return ACCOUNT_STATE_MAP[handle] ?? 'active';
}

/* -------------------------------------------------------------------------- */
/*  个人主页三个 Tab 的数据源（从信息流里筛，保证内容真实连贯）                     */
/* -------------------------------------------------------------------------- */

export type { ListTab, ProfileTab };
export type { AccountState, TopicSubscription, UserProfile, UserSummary };
