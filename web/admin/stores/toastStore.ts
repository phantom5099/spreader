/**
 * 轻提示（toast）
 *
 * 与客户端 Toaster 同风格但独立实现：管理后台要能单独部署，
 * 不引用 src/ 下的任何组件。用于操作结果反馈（处置成功、失败原因等）。
 */

import { create } from 'zustand';

export type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
}

let seq = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  push: (message, tone = 'success') => {
    seq += 1;
    const id = seq;
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3600);
  },

  dismiss: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

/** 非 hook 场景快捷调用 */
export function toast(message: string, tone: ToastTone = 'success'): void {
  useToastStore.getState().push(message, tone);
}
