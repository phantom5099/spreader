import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useToastStore } from '@/stores/toastStore';
import styles from './Toaster.module.css';

/**
 * 全局轻提示容器
 * 挂在 AppShell 外层，任何页面都能用 toast.success / toast.error 触发。
 */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className={styles.toaster} role="region" aria-label="通知">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={[styles.toast, t.tone !== 'default' ? styles[`toast--${t.tone}`] : '']
            .filter(Boolean)
            .join(' ')}
          role={t.tone === 'error' ? 'alert' : 'status'}
        >
          {t.tone === 'success' ? (
            <CheckCircle2 size={17} strokeWidth={2.2} aria-hidden />
          ) : t.tone === 'error' ? (
            <AlertCircle size={17} strokeWidth={2.2} aria-hidden />
          ) : (
            <Info size={17} strokeWidth={2.2} aria-hidden />
          )}

          <span className={styles.toast__message}>{t.message}</span>

          {t.onRetry ? (
            <button
              type="button"
              className={styles.toast__action}
              onClick={() => {
                t.onRetry?.();
                dismiss(t.id);
              }}
            >
              重试
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
