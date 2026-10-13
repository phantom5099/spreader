/**
 * 草稿与发布状态（zustand）
 */
import { create } from 'zustand';
import type { Draft, PublishProgress, PublishStage } from '@/types/draft';
import {
  clearDraftsApi,
  deleteDraftApi,
  fetchDrafts,
  publishDraftApi,
  saveDraftApi,
} from '@/mocks/api';
import { createDraft, readDrafts } from '@/mocks/drafts';

interface DraftState {
  drafts: Draft[];
  /** 当前正在编辑的草稿 id；null 表示新建 */
  editingId: string | null;
  /** 发布状态机 */
  progress: PublishProgress;

  refresh: () => Promise<void>;
  create: () => Draft;
  upsert: (draft: Draft) => void;
  remove: (id: string) => void;
  clearAll: () => void;
  get: (id: string) => Draft | undefined;
  setEditing: (id: string | null) => void;

  /** 驱动四阶段状态机；返回最终阶段 */
  runPublish: (opts?: { simulateFail?: boolean }) => Promise<PublishStage>;
  resetProgress: () => void;
}

/** 列表内容是否一致（只关心 id 与编辑时间） */
function sameDrafts(a: Draft[], b: Draft[]): boolean {
  return (
    a.length === b.length &&
    a.every((d, i) => {
      const n = b[i]!;
      return d.id === n.id && d.updatedAt === n.updatedAt;
    })
  );
}

export const useDraftStore = create<DraftState>((set, get) => ({
  /* 初值直接取数据层的本地快照：首屏不空闪，也不必等一次异步往返 */
  drafts: readDrafts(),
  editingId: null,
  progress: { stage: 'idle', percent: 0 },

  refresh: async () => {
    const loaded = await fetchDrafts();
    set((s) => {
      /* 幂等：内容一致时返回原 state，避免无谓的重渲染
         （refresh 常被放在 effect 里，若每次都换数组引用，
         配合组件对 list 的订阅会形成「渲染 → refresh → 重渲染」的循环）。 */
      if (sameDrafts(s.drafts, loaded)) return s;
      return { drafts: loaded };
    });
  },

  create: () => createDraft(),

  upsert: (draft) => {
    const next = { ...draft, updatedAt: Date.now() };
    set((s) => {
      const exists = s.drafts.some((d) => d.id === next.id);
      return {
        drafts: exists ? s.drafts.map((d) => (d.id === next.id ? next : d)) : [next, ...s.drafts],
      };
    });
    void saveDraftApi(next);
  },

  remove: (id) => {
    set((s) => ({
      drafts: s.drafts.filter((d) => d.id !== id),
      editingId: s.editingId === id ? null : s.editingId,
    }));
    void deleteDraftApi(id);
  },

  clearAll: () => {
    set({ drafts: [], editingId: null });
    void clearDraftsApi();
  },

  get: (id) => get().drafts.find((d) => d.id === id),

  setEditing: (id) => set({ editingId: id }),

  runPublish: async ({ simulateFail = false } = {}) =>
    publishDraftApi({ simulateFail, onStage: (progress) => set({ progress }) }),

  resetProgress: () => set({ progress: { stage: 'idle', percent: 0 } }),
}));
