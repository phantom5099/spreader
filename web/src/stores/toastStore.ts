/**
 * 全局轻提示（toast）
 * 成功提示 2 秒自动消失；失败提示带重试按钮。
 */
import { create } from 'zustand';

type ToastTone = 'default' | 'success' | 'error';

interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
  /** 失败时的重试动作 */
  onRetry?: () => void;
  /** 毫秒；error 默认更久 */
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => string;
  success: (message: string) => string;
  error: (message: string, onRetry?: () => void) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

let seq = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push: (t) => {
    const id = `t_${Date.now()}_${seq++}`;
    const toast: Toast = { id, ...t };
    set({ toasts: [...get().toasts, toast] });

    const duration = t.duration ?? (t.tone === 'error' ? 4000 : 2000);
    window.setTimeout(() => get().dismiss(id), duration);
    return id;
  },

  success: (message) => get().push({ message, tone: 'success' }),
  error: (message, onRetry) => get().push({ message, tone: 'error', onRetry }),

  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  clear: () => set({ toasts: [] }),
}));

/** 便捷函数（非 hook 场景：store 内部、事件回调） */
export const toast = {
  success: (m: string) => useToastStore.getState().success(m),
  error: (m: string, onRetry?: () => void) => useToastStore.getState().error(m, onRetry),
  show: (m: string) => useToastStore.getState().push({ message: m, tone: 'default' }),
};
