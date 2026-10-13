/**
 * 草稿数据源（Demo）
 *
 */
import type { Draft, DraftMedia } from '@/types/draft';
import { mediaPlaceholder } from './placeholders';

const STORAGE_KEY = 'spreader.drafts.v1';

/* -------------------------------------------------------------------------- */
/*  工具                                                                        */
/* -------------------------------------------------------------------------- */

function uid(prefix = 'd'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function image(
  id: string,
  name: string,
  width: number,
  height: number,
  size: number,
): DraftMedia {
  return { id, kind: 'image', url: mediaPlaceholder(id, width, height, 'photo'), name, size, width, height };
}

function video(id: string, name: string, size: number, duration_ms: number): DraftMedia {
  return {
    id,
    kind: 'video',
    url: mediaPlaceholder(id, 1920, 1080, 'video'),
    name,
    size,
    width: 1920,
    height: 1080,
    duration_ms,
  };
}

/** 新建一条空草稿（默认可见范围、无媒体） */
export function createDraft(): Draft {
  return {
    id: uid(),
    text: '',
    media: [],
    visibility: 'public',
    visibleTo: [],
    sensitive: false,
    ephemeral: false,
    topics: [],
    mentions: [],
    updatedAt: Date.now(),
  };
}

/* -------------------------------------------------------------------------- */
/*  种子数据                                                                    */
/* -------------------------------------------------------------------------- */

const HOUR = 3_600_000;

/** 预置草稿：模拟「之前在别处编辑过、还没发出去」的内容 */
export const SEED_DRAFTS: Draft[] = [
  {
    id: 'd_seed_film',
    text: '整理了一组上周拍的胶片，先挑三张出来。\n\n光比还是有点大，下次试试逆光补偿。',
    media: [
      image('d_seed_film_1', 'IMG_2043.HEIC', 1200, 1200, 1_820_000),
      image('d_seed_film_2', 'IMG_2044.HEIC', 1600, 1067, 2_260_000),
      image('d_seed_film_3', 'IMG_2051.HEIC', 1080, 1350, 1_540_000),
    ],
    visibility: 'public',
    visibleTo: [],
    sensitive: false,
    ephemeral: false,
    topics: ['摄影构图'],
    mentions: [],
    updatedAt: Date.now() - 2 * HOUR,
  },
  {
    id: 'd_seed_remote',
    text: '关于「远程办公两年后的一些体会」的长文，写了一半。\n\n先记几个要点：\n1. 边界感比效率工具重要\n2. 异步沟通要写下来\n3. 定期见面不能省',
    media: [],
    visibility: 'followers',
    visibleTo: [],
    sensitive: false,
    ephemeral: false,
    topics: ['remote work'],
    mentions: [],
    updatedAt: Date.now() - 30 * HOUR,
  },
  {
    id: 'd_seed_clip',
    text: '周末手冲的记录，剪了 40 秒的版本，配乐还没定。',
    media: [video('d_seed_clip_1', 'VID_0091.mp4', 18_600_000, 41_000)],
    visibility: 'public',
    visibleTo: [],
    sensitive: false,
    ephemeral: false,
    topics: ['手冲咖啡'],
    mentions: [],
    updatedAt: Date.now() - 52 * HOUR,
  },
];

/* -------------------------------------------------------------------------- */
/*  持久化（Demo 用 localStorage 冒充服务端存储）                                 */
/* -------------------------------------------------------------------------- */

/** 读取草稿；首次进入时写入种子数据，模拟「账号里本来就有草稿」 */
export function readDrafts(): Draft[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      writeDrafts(SEED_DRAFTS);
      return SEED_DRAFTS;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Draft[];
  } catch {
    return [];
  }
}

export function writeDrafts(list: Draft[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* 隐私模式 / 配额满：静默失败，不阻塞编辑 */
  }
}

export { uid as draftUid };
