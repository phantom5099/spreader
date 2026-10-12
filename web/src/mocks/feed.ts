/**
 * 信息流 mock 数据
 * 要求：
 *  - ≥60 条，5 种 layout 各 ≥8 条
 *  - 中英文混排、超长正文、超短正文
 *  - 同一时间戳（验证不跳条）
 *  - ≥2 条敏感内容
 *  - ≥2 条引用帖（含 1 条原帖已删除）
 *  - ≥2 条非 published 状态
 *  - 空白/极简卡片
 *  - 固定 seed，每次刷新一致（便于对照验收，不能用随机数）
 */
import type { Author, FeedItem, MediaItem } from '@/types/feed';
import { avatarDataUri, mediaPlaceholder } from './placeholders';

/* -------------------------------------------------------------------------- */
/*  确定性伪随机（mulberry32）：固定 seed，保证每次生成同样数据                    */
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

const rand = mulberry32(20261011);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const int = (min: number, max: number) =>
  Math.floor(rand() * (max - min + 1)) + min;

/* -------------------------------------------------------------------------- */
/*  作者池                                                                      */
/* -------------------------------------------------------------------------- */

const NICKNAMES = [
  '林知夏', '陈默', '苏晚', '周与川', '许星野', 'Ethan Park', 'Mia Chen',
  '顾南舟', '叶清和', '沈砚', 'Lucas Reed', '温屿', '白露', '宋辞',
  '钟离', 'Nancy Wu', 'Francis Li', '苏黎', '欧阳川', '夏wood',
  '沐云', '简一', '祁野', '阮清', 'Sophie Zhang', 'Daniel Ko',
];

function makeAuthor(index: number): Author {
  const nickname = NICKNAMES[index % NICKNAMES.length]!;
  const userId = `u_${20000 + index}`;
  return {
    user_id: userId,
    nickname,
    handle: `user${20000 + index}`,
    avatar_url: avatarDataUri(userId, nickname),
    viewer_following: index % 3 === 0,
  };
}

const AUTHORS: Author[] = NICKNAMES.map((_, i) => makeAuthor(i));

/* -------------------------------------------------------------------------- */
/*  文本池                                                                      */
/* -------------------------------------------------------------------------- */

const TEXT_SHORT = [
  '刚刚想通了一件事。',
  '今天天气不错。',
  '在改一个很固执的 bug。',
  '咖啡续命 ☕️',
  '突然想去看海。',
  '这个周末不加班。',
];

const TEXT_MEDIUM = [
  '写代码最难的部分其实不是写，是想清楚到底要写什么。每次卡住的时候，通常不是因为不会语法，而是需求本身没想明白。',
  '整理了一下书架，发现买回来没读完的书比读完的多三倍。可能买书这个动作本身，就已经满足了一部分阅读的欲望。',
  '#摄影 傍晚的光是最好用的免费滤镜。不需要任何后期，只要在对的时间站在对的地方。',
  '关于"效率工具"的一点想法：工具本身不会让你更高效，它只会放大你原本的工作方式。如果原本就是乱糟糟的，用了工具只会乱得更有仪式感。',
  '今天和 @user21003 聊了两个小时，从技术聊到人生。有时候一个下午的对话，比读十篇文章管用。',
  'Ship it. Then fix it. 完美主义是拖延症最好看的伪装。',
];

const TEXT_EN = [
  'The best code review comment I ever got was: "This is correct, but is it necessary?"',
  'Spent the morning refactoring something that worked. It now works the same, but I can sleep at night.',
  'A good API is one you can guess. If I have to read the docs to call `getUser`, something is wrong.',
];

/* -------------------------------------------------------------------------- */
/*  媒体构造                                                                    */
/* -------------------------------------------------------------------------- */

const RATIOS: Array<[number, number]> = [
  [1600, 900],
  [1200, 1200],
  [900, 1200],
  [1600, 1000],
];

function makeMedia(seed: string, count: number, kind: 'photo' | 'video' = 'photo'): MediaItem[] {
  return Array.from({ length: count }, (_, i) => {
    const [w, h] = RATIOS[int(0, RATIOS.length - 1)]!;
    return {
      url: mediaPlaceholder(`${seed}_${i}`, w, h, kind),
      cover_url: mediaPlaceholder(`${seed}_${i}`, w, h, kind),
      width: w,
      height: h,
      ...(kind === 'video' ? { duration_ms: int(8, 180) * 1000 } : {}),
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  时间                                                                        */
/* -------------------------------------------------------------------------- */

/** 固定基准时间，保证 mock 数据稳定 */
const BASE_TIME = new Date('2026-10-11T14:30:00Z').getTime();

/** 把相对分钟数转成 ISO */
function minutesAgo(minutes: number): string {
  return new Date(BASE_TIME - minutes * 60_000).toISOString();
}

/* -------------------------------------------------------------------------- */
/*  生成器                                                                      */
/* -------------------------------------------------------------------------- */

let idCounter = 1823456789012345600n;

function nextId(): string {
  idCounter += BigInt(int(1, 9999));
  return idCounter.toString();
}

interface Shape {
  layout: FeedItem['layout'];
  make: (seedId: string) => Pick<FeedItem, 'text' | 'media' | 'title'>;
}

const SHAPES: Shape[] = [
  // --- text（纯文字）---
  {
    layout: 'text',
    make: () => ({
      text: pick([...TEXT_SHORT, ...TEXT_MEDIUM, ...TEXT_EN]),
      media: [],
    }),
  },
  // --- image（单图）---
  {
    layout: 'image',
    make: (seedId) => ({
      text: rand() > 0.3 ? pick(TEXT_SHORT.concat(TEXT_MEDIUM)) : '',
      media: makeMedia(seedId, 1),
    }),
  },
  // --- gallery（多图）---
  {
    layout: 'gallery',
    make: (seedId) => ({
      text: rand() > 0.25 ? pick([...TEXT_MEDIUM, ...TEXT_EN]) : '',
      media: makeMedia(seedId, int(2, 9)),
    }),
  },
  // --- video ---
  {
    layout: 'video',
    make: (seedId) => ({
      text: rand() > 0.4 ? pick(TEXT_SHORT.concat(TEXT_MEDIUM)) : '',
      media: makeMedia(seedId, 1, 'video'),
    }),
  },
  // --- quote（引用）---
  {
    layout: 'quote',
    make: () => ({
      text: pick(TEXT_MEDIUM),
      media: [],
    }),
  },
];

/** 生成一条引用帖内嵌的原帖 */
function makeQuoted(parentId: string, index: number, deleted = false): FeedItem {
  const author = AUTHORS[(index + 7) % AUTHORS.length]!;
  const id = nextId();
  if (deleted) {
    return {
      content_id: id,
      author,
      layout: 'text',
      text: '',
      media: [],
      published_at: minutesAgo(int(600, 6000)),
      counters: { reply: 0, repost: 0, like: 0, view: 0 },
      viewer: { liked: false, reposted: false, bookmarked: false, blocked: false },
      flags: { sensitive: false, ephemeral: false, visibility: 'public' },
      status: 'published',
      // 用 status_reason 表达"原帖已删除"（渲染为"内容不可用"）
      status_reason: 'deleted',
    };
  }
  const shape = pick(SHAPES.slice(0, 4));
  const built = shape.make(`${parentId}_q`);
  return {
    content_id: id,
    author,
    layout: shape.layout,
    text: built.text,
    media: built.media.slice(0, 1),
    published_at: minutesAgo(int(600, 6000)),
    counters: {
      reply: int(0, 40),
      repost: int(0, 20),
      like: int(5, 400),
      view: int(500, 60000),
    },
    viewer: { liked: rand() > 0.7, reposted: false, bookmarked: false, blocked: false },
    flags: { sensitive: false, ephemeral: false, visibility: 'public' },
    status: 'published',
  };
}

function buildItem(index: number): FeedItem {
  const shape = SHAPES[index % SHAPES.length]!;
  const id = nextId();
  const author = AUTHORS[index % AUTHORS.length]!;
  const built = shape.make(id);

  const item: FeedItem = {
    content_id: id,
    author,
    layout: shape.layout,
    text: built.text,
    media: built.media,
    published_at: minutesAgo(index === 7 ? 45 : int(index * 17, index * 17 + 120)),
    counters: {
      reply: int(0, 320),
      repost: int(0, 180),
      like: int(0, 4200),
      view: int(800, 240000),
    },
    viewer: {
      liked: rand() > 0.72,
      reposted: rand() > 0.9,
      bookmarked: rand() > 0.85,
      blocked: false,
    },
    flags: {
      sensitive: false,
      ephemeral: rand() > 0.93,
      visibility: 'public',
    },
    status: 'published',
  };

  if (shape.layout === 'quote') {
    item.quoted = makeQuoted(id, index);
  }

  return item;
}

/* -------------------------------------------------------------------------- */
/*  特殊样本（按要求显式构造）                                                */
/* -------------------------------------------------------------------------- */

function makeSpecialSamples(startIndex: number): FeedItem[] {
  const specials: FeedItem[] = [];

  // ① 极简卡片：只有一行字、零计数
  specials.push({
    content_id: nextId(),
    author: AUTHORS[3]!,
    layout: 'text',
    text: '。',
    media: [],
    published_at: minutesAgo(1),
    counters: { reply: 0, repost: 0, like: 0, view: 3 },
    viewer: { liked: false, reposted: false, bookmarked: false, blocked: false },
    flags: { sensitive: false, ephemeral: false, visibility: 'public' },
    status: 'published',
  });

  // ②③ 敏感内容
  for (let i = 0; i < 2; i += 1) {
    const id = nextId();
    specials.push({
      content_id: id,
      author: AUTHORS[(4 + i) % AUTHORS.length]!,
      layout: 'image',
      text: '记录一下，画面可能有点刺激。',
      media: makeMedia(id, 1),
      published_at: minutesAgo(30 + i * 90),
      counters: { reply: int(2, 30), repost: int(0, 8), like: int(10, 200), view: int(900, 20000) },
      viewer: { liked: false, reposted: false, bookmarked: false, blocked: false },
      flags: { sensitive: true, ephemeral: false, visibility: 'public' },
      status: 'published',
    });
  }

  // ④ 引用帖 + 原帖已删除
  {
    const id = nextId();
    specials.push({
      content_id: id,
      author: AUTHORS[1]!,
      layout: 'quote',
      text: '这条原帖被删了，但我还是想说两句。',
      media: [],
      quoted: makeQuoted(id, startIndex + 2, true),
      published_at: minutesAgo(75),
      counters: { reply: 12, repost: 5, like: 88, view: 3400 },
      viewer: { liked: false, reposted: false, bookmarked: false, blocked: false },
      flags: { sensitive: false, ephemeral: false, visibility: 'public' },
      status: 'published',
    });
  }

  // ⑤ 同一时间戳（验证 keyset 不跳条）
  const sameTs = minutesAgo(200);
  for (let i = 0; i < 3; i += 1) {
    specials.push({
      content_id: nextId(),
      author: AUTHORS[(10 + i) % AUTHORS.length]!,
      layout: 'text',
      text: `同一时间戳的第 ${i + 1} 条，用于验证排序稳定性。`,
      media: [],
      published_at: sameTs,
      counters: { reply: i, repost: 0, like: i * 3, view: 100 + i },
      viewer: { liked: false, reposted: false, bookmarked: false, blocked: false },
      flags: { sensitive: false, ephemeral: false, visibility: 'public' },
      status: 'published',
    });
  }

  // ⑥⑦ 非 published 状态（Demo 中展示作者视角的徽标）
  const statusSamples: Array<{ status: FeedItem['status']; reason?: string }> = [
    { status: 'transcoding' },
    { status: 'reviewing' },
    { status: 'rejected', reason: 'violence' },
    { status: 'failed' },
  ];
  statusSamples.forEach((s, i) => {
    const id = nextId();
    specials.push({
      content_id: id,
      author: AUTHORS[0]!,
      layout: 'video',
      text: `这条还在处理中（示例 ${i + 1}）。`,
      media: makeMedia(id, 1, 'video'),
      published_at: minutesAgo(2 + i),
      counters: { reply: 0, repost: 0, like: 0, view: 0 },
      viewer: { liked: false, reposted: false, bookmarked: false, blocked: false },
      flags: { sensitive: false, ephemeral: false, visibility: 'public' },
      status: s.status,
      ...(s.reason ? { status_reason: s.reason } : {}),
    });
  });

  // ⑧ 指定好友可见：仅自己可见
  {
    const id = nextId();
    specials.push({
      content_id: id,
      author: AUTHORS[0]!,
      layout: 'text',
      text: '这条设成了"仅自己可见"，用于验证可见范围徽标。',
      media: [],
      published_at: minutesAgo(15),
      counters: { reply: 0, repost: 0, like: 0, view: 1 },
      viewer: { liked: false, reposted: false, bookmarked: false, blocked: false },
      flags: { sensitive: false, ephemeral: false, visibility: 'private' },
      status: 'published',
    });
  }

  // ⑨ 限时动态
  {
    const id = nextId();
    specials.push({
      content_id: id,
      author: AUTHORS[6]!,
      layout: 'image',
      text: '24 小时后自动消失。',
      media: makeMedia(id, 1),
      published_at: minutesAgo(5),
      counters: { reply: 1, repost: 0, like: 9, view: 210 },
      viewer: { liked: false, reposted: false, bookmarked: false, blocked: false },
      flags: { sensitive: false, ephemeral: true, visibility: 'public' },
      status: 'published',
    });
  }

  return specials;
}

/* -------------------------------------------------------------------------- */
/*  组装并导出                                                                   */
/* -------------------------------------------------------------------------- */

function buildAll(): FeedItem[] {
  const regular = Array.from({ length: 56 }, (_, i) => buildItem(i));
  const specials = makeSpecialSamples(56);
  // 特殊样本插到靠前位置，便于一眼看到各种形态
  return [...regular.slice(0, 6), ...specials.slice(0, 6), ...regular.slice(6), ...specials.slice(6)]
    .map((item, i) => ({ item, i }))
    // 按 published_at 倒序（与真实接口一致），并用 content_id 做 tie-breaker
    .sort((a, b) => {
      const ta = Date.parse(a.item.published_at);
      const tb = Date.parse(b.item.published_at);
      if (ta !== tb) return tb - ta;
      return a.item.content_id < b.item.content_id ? 1 : -1;
    })
    .map(({ item }) => item);
}

export const ALL_FEED_ITEMS: FeedItem[] = buildAll();

export const TRENDS = [
  { topic: '摄影构图', post_count: 48200, category: '艺术' },
  { topic: '独立开发', post_count: 31500, category: '科技' },
  { topic: '深夜emo', post_count: 27800, category: '生活' },
  { topic: 'remote work', post_count: 19400, category: '科技' },
  { topic: '手冲咖啡', post_count: 12600, category: '生活' },
] as const;

/** 推荐关注的用户（右栏） */
export const SUGGESTED_USERS = AUTHORS.slice(8, 13).map((a) => ({
  ...a,
  reason: pick(['你关注的人也在关注', '与你兴趣相近', '热门创作者']),
}));
