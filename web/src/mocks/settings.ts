/**
 * 账号偏好设置数据源（Demo）
 *
 * 通知开关、兴趣话题、个性化标签都是账号级数据：真实后端由
 * 「读取设置 / 更新设置」接口下发，届时替换本文件与 api.ts 中对应实现即可。
 */

export interface NotificationGroup {
  title: string;
  rows: Array<{ key: string; label: string; desc?: string; on: boolean }>;
}

/** 通知开关分组及默认值 */
export const NOTIFICATION_SETTINGS: NotificationGroup[] = [
  {
    title: '互动',
    rows: [
      { key: 'like', label: '点赞', on: true },
      { key: 'reply', label: '回复', desc: '有人回复你的动态时通知', on: true },
      { key: 'repost', label: '转推与引用', on: true },
      { key: 'mention', label: '提及', desc: '有人在动态中提到你', on: true },
    ],
  },
  {
    title: '关系',
    rows: [
      { key: 'follow', label: '新粉丝', on: true },
      { key: 'follow_post', label: '你关注的人发帖', desc: '开启后会比较吵', on: false },
      { key: 'message', label: '新消息', on: true },
    ],
  },
  {
    title: '其他',
    rows: [
      { key: 'system', label: '系统通知', desc: '审核结果、账号安全提醒', on: true },
      { key: 'recommend', label: '推荐与活动', on: false },
    ],
  },
];

/** 免打扰时段 */
export const QUIET_HOURS = { start: '22:00', end: '08:00' };

/** 兴趣话题候选 */
export const INTEREST_TOPICS = [
  '科技', '艺术', '生活', '摄影', '设计', '读书',
  '旅行', '美食', '健身', '音乐', '影视', '职场',
];

/** 我已选中的兴趣话题 */
export const MY_INTERESTS = ['科技', '摄影', '生活'];

/** 个性化标签 */
export const MY_TAGS = [
  '前端工程化', '设计系统', '摄影构图', '独立开发', '手冲咖啡',
  '城市漫步', '播客', '读书笔记', '远程办公', '字体设计',
  '开源', '效率工具', '深夜emo', '爬山', '胶片',
];

/* -------------------------------------------------------------------------- */
/*  播放偏好                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * 播放偏好：循环播放、自动播放。
 * 与主题一样属于「本机偏好」，Demo 存在 localStorage；
 * 真实后端接入时改由「读取设置 / 更新设置」接口下发，接口形状不变。
 */
export interface PlaybackPrefs {
  /** 短视频循环播放：开启时单条播完回到开头，关闭时自动切下一条 */
  video_loop: boolean;
  /** 信息流内视频自动播放 */
  autoplay: boolean;
}

const PLAYBACK_KEY = 'spreader.playback.v1';

/** 默认行为：循环播放开启，自动播放开启 */
export const PLAYBACK_DEFAULTS: PlaybackPrefs = {
  video_loop: true,
  autoplay: true,
};

export function readPlaybackPrefs(): PlaybackPrefs {
  try {
    const raw = localStorage.getItem(PLAYBACK_KEY);
    if (!raw) return { ...PLAYBACK_DEFAULTS };
    return { ...PLAYBACK_DEFAULTS, ...(JSON.parse(raw) as Partial<PlaybackPrefs>) };
  } catch {
    /* 隐私模式 / 脏数据：回落到默认值 */
    return { ...PLAYBACK_DEFAULTS };
  }
}

export function writePlaybackPrefs(prefs: PlaybackPrefs): void {
  try {
    localStorage.setItem(PLAYBACK_KEY, JSON.stringify(prefs));
  } catch {
    /* 隐私模式下静默失败 */
  }
}
