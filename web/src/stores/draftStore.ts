/**
 * 草稿与发布状态（zustand + localStorage）
 * 草稿本地存储，不依赖后端；发布走四阶段状态机。
 */
import { create } from 'zustand';
import type { Visibility } from '@/types/feed';

/* -------------------------------------------------------------------------- */
/*  类型                                                                        */
/* -------------------------------------------------------------------------- */

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

interface PublishProgress {
  stage: PublishStage;
  /** 0~100，仅 uploading 有意义 */
  percent: number;
  /** 未通过时的原因类别 */
  reason?: string;
}

const STORAGE_KEY = 'spreader.drafts.v1';

/* -------------------------------------------------------------------------- */
/*  工具                                                                        */
/* -------------------------------------------------------------------------- */

function uid(prefix = 'd'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function loadDrafts(): Draft[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Draft[];
  } catch {
    return [];
  }
}

function saveDrafts(drafts: Draft[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    /* 隐私模式/配额满：静默失败，不阻塞编辑 */
  }
}

/** 从草稿提取"列表首行文字" */
export function draftPreview(draft: Draft): string {
  const first = draft.text.trim().split('\n')[0]?.trim();
  if (first) return first;
  if (draft.media.length > 0) {
    return draft.media[0]!.kind === 'video' ? '[视频]' : `[${draft.media.length} 张图片]`;
  }
  return '（无内容）';
}

/* -------------------------------------------------------------------------- */
/*  Store                                                                       */
/* -------------------------------------------------------------------------- */

interface DraftState {
  drafts: Draft[];
  /** 当前正在编辑的草稿 id；null 表示新建 */
  editingId: string | null;
  /** 发布状态机 */
  progress: PublishProgress;

  refresh: () => void;
  create: () => Draft;
  upsert: (draft: Draft) => void;
  remove: (id: string) => void;
  clearAll: () => void;
  get: (id: string) => Draft | undefined;
  setEditing: (id: string | null) => void;

  /** 驱动四阶段状态机；返回是否最终成功 */
  runPublish: (opts?: { simulateFail?: boolean }) => Promise<PublishStage>;
  resetProgress: () => void;
}

export const useDraftStore = create<DraftState>((set, get) => ({
  drafts: [],
  editingId: null,
  progress: { stage: 'idle', percent: 0 },

  refresh: () =>
    set((s) => {
      const loaded = loadDrafts();
      /* 幂等：内容一致时不写回，避免无谓的重渲染
         （refresh 常被放在 effect 里，若每次都产生新数组引用，
         配合组件订阅会导致「渲染 → refresh → 重渲染」的循环）。 */
      if (
        s.drafts.length === loaded.length &&
        s.drafts.every((d, i) => {
          const n = loaded[i]!;
          return d.id === n.id && d.updatedAt === n.updatedAt;
        })
      ) {
        return s;
      }
      return { drafts: loaded };
    }),

  create: () => {
    const draft: Draft = {
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
    return draft;
  },

  upsert: (draft) => {
    const next = { ...draft, updatedAt: Date.now() };
    const list = get().drafts;
    const exists = list.some((d) => d.id === draft.id);
    const drafts = exists
      ? list.map((d) => (d.id === draft.id ? next : d))
      : [next, ...list];
    saveDrafts(drafts);
    set({ drafts });
  },

  remove: (id) => {
    const drafts = get().drafts.filter((d) => d.id !== id);
    saveDrafts(drafts);
    set({ drafts, editingId: get().editingId === id ? null : get().editingId });
  },

  clearAll: () => {
    saveDrafts([]);
    set({ drafts: [], editingId: null });
  },

  get: (id) => get().drafts.find((d) => d.id === id),

  setEditing: (id) => set({ editingId: id }),

  /**
   * 四阶段状态机
   * 上传中(带百分比) → 转码中(不确定) → 审核中 → 已发布
   * Demo 用定时器模拟，便于演示进度条。
   */
  runPublish: async ({ simulateFail = false } = {}) => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    set({ progress: { stage: 'uploading', percent: 0 } });
    for (const p of [12, 34, 58, 79, 94, 100]) {
      await wait(220);
      set({ progress: { stage: 'uploading', percent: p } });
    }

    set({ progress: { stage: 'transcoding', percent: 100 } });
    await wait(1400);

    if (simulateFail) {
      set({ progress: { stage: 'failed', percent: 100 } });
      return 'failed';
    }

    set({ progress: { stage: 'reviewing', percent: 100 } });
    await wait(1600);

    // Demo：10% 触发"未通过审核"，便于演示申诉入口
    if (Math.random() < 0.1) {
      set({ progress: { stage: 'rejected', percent: 100, reason: '疑似违规内容' } });
      return 'rejected';
    }

    set({ progress: { stage: 'published', percent: 100 } });
    return 'published';
  },

  resetProgress: () => set({ progress: { stage: 'idle', percent: 0 } }),
}));
