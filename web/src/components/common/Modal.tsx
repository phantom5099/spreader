import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import styles from './Modal.module.css';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** 底部固定操作区 */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** 是否允许点遮罩关闭（破坏性操作建议关闭） */
  closeOnOverlay?: boolean;
  /** 头部右侧动作 */
  headActions?: ReactNode;
  /** 是否显示关闭按钮 */
  showClose?: boolean;
}

/**
 * 通用浮层
 * 8 个模态层（图片编辑、举报原因、可见范围、话题、@提及、新建群选人、二次确认…）共用。
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnOverlay = true,
  headActions,
  showClose = true,
}: ModalProps) {
  /* ESC 关闭 + 锁定背景滚动 */
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={styles.overlay}
      onClick={closeOnOverlay ? onClose : undefined}
      role="presentation"
    >
      <div
        className={[styles.dialog, styles[`dialog--${size}`]].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {title || showClose || headActions ? (
          <div className={styles.head}>
            {showClose ? (
              <button
                type="button"
                className={styles.head__close}
                aria-label="关闭"
                onClick={onClose}
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            ) : null}

            {title ? <div className={styles.head__title}>{title}</div> : <div style={{ flex: 1 }} />}

            {headActions ? <div className={styles.head__actions}>{headActions}</div> : null}
          </div>
        ) : null}

        <div className={styles.body}>{children}</div>

        {footer ? <div className={styles.foot}>{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export { styles as modalStyles };
