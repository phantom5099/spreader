/**
 * 媒体挑选（Demo）
 * 无真实文件系统：用程序生成的 SVG 占位模拟"用户选了图/视频"。
 * 真实接入时替换本文件：用 <input type="file"> + 上传接口。
 */
import { mediaPlaceholder } from './placeholders';
import type { DraftMedia } from '@/types/draft';

const IMAGE_NAMES = ['IMG_2043.HEIC', 'IMG_2044.HEIC', 'screenshot.png', 'photo.webp', 'cover.jpg'];
const VIDEO_NAMES = ['VID_0091.mp4', 'clip.mov', 'timelapse.mp4'];

const IMAGE_RATIOS: Array<[number, number]> = [
  [1200, 1200],
  [1600, 1067],
  [1080, 1350],
  [1920, 1080],
  [1000, 1500],
];

let seq = 0;

/** 生成一张"选中的图片" */
export function pickImage(): DraftMedia {
  const [w, h] = IMAGE_RATIOS[seq % IMAGE_RATIOS.length]!;
  const id = `m_${Date.now().toString(36)}_${seq++}`;
  return {
    id,
    kind: 'image',
    url: mediaPlaceholder(id, w, h, 'photo'),
    name: IMAGE_NAMES[seq % IMAGE_NAMES.length]!,
    size: 1_200_000 + ((seq * 480_000) % 4_000_000),
    width: w,
    height: h,
  };
}

/** 生成一个"选中的视频" */
export function pickVideo(): DraftMedia {
  const id = `m_${Date.now().toString(36)}_${seq++}`;
  return {
    id,
    kind: 'video',
    url: mediaPlaceholder(id, 1920, 1080, 'video'),
    name: VIDEO_NAMES[seq % VIDEO_NAMES.length]!,
    size: 8_000_000 + ((seq * 3_200_000) % 30_000_000),
    width: 1920,
    height: 1080,
    duration_ms: 8000 + ((seq * 7000) % 52000),
  };
}

/** 体积格式化：1.2 MB */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/* -------------------------------------------------------------------------- */
/*  话题 / 用户（选择器用）                                                     */
/* -------------------------------------------------------------------------- */

export const TOPIC_POOL = [
  { topic: '摄影构图', post_count: 48200 },
  { topic: '独立开发', post_count: 31500 },
  { topic: '深夜emo', post_count: 27800 },
  { topic: 'remote work', post_count: 19400 },
  { topic: '手冲咖啡', post_count: 12600 },
  { topic: '城市漫步', post_count: 9800 },
  { topic: '读书笔记', post_count: 7400 },
  { topic: '前端工程', post_count: 6100 },
];

export const MENTION_POOL = [
  { handle: 'user20000', nickname: '林知夏' },
  { handle: 'user20001', nickname: '陈默' },
  { handle: 'user20002', nickname: '苏晚' },
  { handle: 'user20003', nickname: '周与川' },
  { handle: 'user20004', nickname: '许星野' },
  { handle: 'user20007', nickname: '顾南舟' },
  { handle: 'user20008', nickname: '叶清和' },
];
