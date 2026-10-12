/**
 * 话题广场数据
 *
 * 热门榜与分类推荐同源：都从 POOL 派生，同一话题在两处的动态数必然一致。
 * 其中若干话题与信息流趋势池（TRENDS）重合，数字保持同步，
 * 因此从右栏趋势点进来和从话题页点进来看到的是同一个规模。
 */

export const TOPIC_CATEGORIES = ['科技', '生活', '艺术', '学习', '职场', '旅行'] as const;

export type TopicCategory = (typeof TOPIC_CATEGORIES)[number];

export interface TopicEntry {
  topic: string;
  category: TopicCategory;
  post_count: number;
  /** 近 24 小时热度变化，百分比，正负表示升降温 */
  delta: number;
}

export interface TopicGroup {
  category: TopicCategory;
  /** 分类下方的短标签，说明这一类的构成 */
  blurb: string;
  topics: TopicEntry[];
}

const POOL: TopicEntry[] = [
  /* 科技 */
  { topic: '独立开发', category: '科技', post_count: 31500, delta: 18 },
  { topic: 'AI 绘画', category: '科技', post_count: 26400, delta: 42 },
  { topic: 'remote work', category: '科技', post_count: 19400, delta: 6 },
  { topic: '前端工程化', category: '科技', post_count: 15200, delta: 9 },
  { topic: '开源项目', category: '科技', post_count: 11300, delta: -4 },
  { topic: '机械键盘', category: '科技', post_count: 8600, delta: 3 },

  /* 生活 */
  { topic: '深夜emo', category: '生活', post_count: 27800, delta: 21 },
  { topic: '宠物日常', category: '生活', post_count: 21300, delta: 12 },
  { topic: '手冲咖啡', category: '生活', post_count: 12600, delta: 5 },
  { topic: '城市漫步', category: '生活', post_count: 9800, delta: 8 },
  { topic: '极简生活', category: '生活', post_count: 6900, delta: -2 },
  { topic: '早睡挑战', category: '生活', post_count: 4200, delta: 27 },

  /* 艺术 */
  { topic: '摄影构图', category: '艺术', post_count: 48200, delta: 11 },
  { topic: '独立音乐', category: '艺术', post_count: 16800, delta: 14 },
  { topic: '胶片摄影', category: '艺术', post_count: 13700, delta: 7 },
  { topic: '水彩插画', category: '艺术', post_count: 9100, delta: 19 },
  { topic: '电影分镜', category: '艺术', post_count: 6400, delta: 2 },

  /* 学习 */
  { topic: '考研上岸', category: '学习', post_count: 18600, delta: 33 },
  { topic: '英语精读', category: '学习', post_count: 10900, delta: 4 },
  { topic: '读书笔记', category: '学习', post_count: 7400, delta: 6 },
  { topic: '笔记方法论', category: '学习', post_count: 5300, delta: 1 },
  { topic: '手帐排版', category: '学习', post_count: 4700, delta: 9 },

  /* 职场 */
  { topic: '副业探索', category: '职场', post_count: 15400, delta: 16 },
  { topic: '面试复盘', category: '职场', post_count: 12200, delta: 10 },
  { topic: '产品设计', category: '职场', post_count: 9900, delta: 5 },
  { topic: '远程协作', category: '职场', post_count: 7800, delta: -3 },

  /* 旅行 */
  { topic: '小众目的地', category: '旅行', post_count: 13500, delta: 23 },
  { topic: '露营装备', category: '旅行', post_count: 10200, delta: 15 },
  { topic: '徒步路线', category: '旅行', post_count: 8300, delta: 7 },
  { topic: '穷游攻略', category: '旅行', post_count: 6100, delta: 2 },
];

const CATEGORY_BLURB: Record<TopicCategory, string> = {
  科技: '独立开发 · AI · 前端',
  生活: '日常 · 情绪 · 咖啡',
  艺术: '摄影 · 插画 · 音乐',
  学习: '读书 · 语言 · 备考',
  职场: '面试 · 协作 · 副业',
  旅行: '徒步 · 露营 · 目的地',
};

export const ALL_TOPICS: TopicEntry[] = POOL;

/** 当前热门：按动态数取前 8 名 */
export const HOT_TOPICS: TopicEntry[] = [...POOL]
  .sort((a, b) => b.post_count - a.post_count)
  .slice(0, 8);

/** 分类推荐：每个分类内按热度降序 */
export const TOPIC_GROUPS: TopicGroup[] = TOPIC_CATEGORIES.map((category) => ({
  category,
  blurb: CATEGORY_BLURB[category],
  topics: POOL.filter((t) => t.category === category).sort((a, b) => b.post_count - a.post_count),
})).filter((g) => g.topics.length > 0);

/** 按名称查话题（话题讨论页取元信息用） */
export function findTopic(name: string): TopicEntry | undefined {
  return POOL.find((t) => t.topic === name);
}
