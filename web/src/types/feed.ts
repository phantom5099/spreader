/**
 * 接口契约类型定义
 *
 * 字段名在前后端之间保持稳定：后续接真实后端时只替换数据源，
 * 组件层不改。分页统一用 cursor / limit / next_cursor / has_more。
 */

type ContentLayout = 'text' | 'image' | 'gallery' | 'video' | 'quote';

export type Visibility =
  | 'public'
  | 'followers'
  | 'mutual'
  | 'specified'
  | 'private';

type ContentStatus =
  | 'published'
  | 'uploading'
  | 'transcoding'
  | 'reviewing'
  | 'rejected'
  | 'failed';

export interface Author {
  user_id: string;
  nickname: string;
  /** @handle：唯一标识，展示为 @xxx */
  handle: string;
  avatar_url: string;
  /** 是否已关注（用于卡片上的关注按钮，本期可选） */
  viewer_following?: boolean;
}

export interface MediaItem {
  url: string;
  cover_url: string;
  width: number;
  height: number;
  /** 视频才有 */
  duration_ms?: number;
}

export interface Counters {
  reply: number;
  /** 转发数 */
  repost: number;
  like: number;
  /** 浏览数 */
  view: number;
}

export interface ViewerState {
  liked: boolean;
  /** 我是否转过 */
  reposted: boolean;
  /** 我是否收藏 */
  bookmarked: boolean;
  blocked: boolean;
}

interface FeedFlags {
  /** 敏感内容标记 */
  sensitive: boolean;
  /** 限时动态（24h） */
  ephemeral: boolean;
  /** 可见范围 */
  visibility: Visibility;
}

export interface FeedItem {
  content_id: string;
  author: Author;
  /** 渲染提示：避免客户端拿到数据后自己推断布局 */
  layout: ContentLayout;
  title?: string;
  text: string;
  media: MediaItem[];
  /** 引用帖（嵌套），layout === 'quote' 时必有 */
  quoted?: FeedItem;
  /** ISO 8601 */
  published_at: string;
  counters: Counters;
  viewer: ViewerState;
  flags: FeedFlags;
  /** 发布状态；非 published 仅作者可见 */
  status: ContentStatus;
  /** 状态未通过/失败时的原因类别 */
  status_reason?: string;
}

/** 分页响应 */
export interface FeedPage {
  items: FeedItem[];
  next_cursor: string | null;
  has_more: boolean;
  /** 驱动"↑ N 条新内容"提示 */
  new_count?: number;
}

export interface Comment {
  comment_id: string;
  author: Author;
  text: string;
  published_at: string;
  counters: Pick<Counters, 'reply' | 'like'>;
  viewer: Pick<ViewerState, 'liked'>;
}

/** 信息流来源 Tab */
export type FeedTab = 'for_you' | 'following';

export interface FeedQuery {
  tab: FeedTab;
  cursor?: string | null;
  limit?: number;
}
