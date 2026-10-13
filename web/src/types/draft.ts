/**
 * 草稿与发布流程类型
 */
import type { Visibility } from './feed';

/** 发布流程阶段 */
export type PublishStage =
  | 'idle'
  | 'uploading'
  | 'transcoding'
  | 'reviewing'
  | 'published'
  | 'rejected'
  | 'failed';

export interface DraftMedia {
  /** 本地生成的 id */
  id: string;
  kind: 'image' | 'video';
  /** data-URI（Demo 无真实文件） */
  url: string;
  name: string;
  size: number;
  width: number;
  height: number;
  /** 视频才有 */
  duration_ms?: number;
}

export interface Draft {
  id: string;
  text: string;
  media: DraftMedia[];
  visibility: Visibility;
  /** 可见范围=指定好友时的名单 */
  visibleTo: string[];
  sensitive: boolean;
  ephemeral: boolean;
  topics: string[];
  mentions: string[];
  /** 编辑时间（毫秒） */
  updatedAt: number;
}

export interface PublishProgress {
  stage: PublishStage;
  /** 0~100，仅 uploading 有意义 */
  percent: number;
  /** 未通过时的原因类别 */
  reason?: string;
}
