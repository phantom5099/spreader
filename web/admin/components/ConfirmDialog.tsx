import { useEffect, type ReactNode } from 'react';
import { Button } from './Button';
import s from './ConfirmDialog.module.css';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** 危险操作（封禁 / 删除 / 撤销）用红色确认按钮 */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 二次确认弹窗（批量处置、撤销、删除等不可逆或影响面大的操作） */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <>
      <div className={s.mask} onClick={onCancel} aria-hidden="true" />
      <div className={s.dialog} role="alertdialog" aria-modal="true" aria-label={title}>
        <h2 className={s.title}>{title}</h2>
        {message ? <div className={s.message}>{message}</div> : null}
        <div className={s.actions}>
          <Button onClick={onCancel}>{cancelText}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmText}
          </Button>
        </div>
      </div>
    </>
  );
}
