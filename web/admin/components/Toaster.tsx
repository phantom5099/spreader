import { useToastStore } from '@admin/stores/toastStore';
import s from './Toaster.module.css';

/** 全局轻提示（操作结果反馈） */
export function Toaster() {
  const toasts = useToastStore((st) => st.toasts);
  const dismiss = useToastStore((st) => st.dismiss);

  return (
    <div className={s.root} aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={[s.toast, s[t.tone]].join(' ')}
          role="status"
          onClick={() => dismiss(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
