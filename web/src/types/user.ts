/**
 * 用户与关系契约类型
 * 资料 + 关注关系 + 名单管理所需字段
 */

export interface UserProfile {
  user_id: string;
  nickname: string;
  handle: string;
  avatar_url: string;
  /** 封面图（600×200 占位渐变） */
  cover_url: string;
  bio: string;
  location?: string;
  website?: string;
  /** 加入时间（ISO 8601） */
  joined_at: string;
  following: number;
  followers: number;
  /** 关注状态机：none=未关注 / following=已关注 / self=自己 */
  relation: FollowRelation;
  /** 对方的关注状态（互关判定用） */
  follows_me: boolean;
}

export type FollowRelation = 'none' | 'following' | 'self';

/** 账号可访问性 */
export type AccountState = 'active' | 'deactivated' | 'blocked_by_me' | 'blocked_me';

export interface UserSummary {
  user_id: string;
  nickname: string;
  handle: string;
  avatar_url: string;
  bio: string;
  /** 供列表页展示的补充信息 */
  follows_me?: boolean;
  /** 我是否已关注 TA —— 行内关注按钮的初始状态由它决定 */
  following?: boolean;
  /** 该用户是否被我拉黑 */
  blocked?: boolean;
}

export type ProfileTab = 'posts' | 'media' | 'likes';

/** 名单管理三 Tab */
export type ListTab = 'following' | 'followers' | 'topics';

export interface TopicSubscription {
  topic: string;
  post_count: number;
  /** 我关注该话题的时间（ISO 8601） */
  subscribed_at: string;
  category?: string;
}
