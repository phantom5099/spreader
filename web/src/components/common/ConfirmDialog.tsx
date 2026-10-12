import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal, modalStyles } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  /** 说明影响范围（要求写明） */
  description: ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** 是否破坏性（红色按钮 + 警告图标） */
  danger?: boolean;
  /** 确认按钮禁用（如强制勾选后） */
  confirmDisabled?: boolean;
  /** 额外内容（勾选项等） */
  children?: ReactNode;
  /** 次要动作（三选一场景，如"不保存"） */
  tertiary?: { text: string; onClick: () => void };
}

/**
 * 二次确认弹窗
 * 破坏性操作（拉黑 / 删除 / 注销 / 清空历史）统一使用。
 * 规格要求：必须说明影响范围，红色按钮。
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  danger = false,
  confirmDisabled = false,
  children,
  tertiary,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      showClose={false}
      closeOnOverlay={false}
      footer={
        <>
          {tertiary ? (
            <button
              type="button"
              className={`${modalStyles.btn} ${modalStyles['btn--ghost']}`}
              style={{ marginRight: 'auto' }}
              onClick={tertiary.onClick}
            >
              {tertiary.text}
            </button>
          ) : null}
          <button type="button" className={`${modalStyles.btn} ${modalStyles['btn--ghost']}`} onClick={onClose}>
            {cancelText}
          </button>
          <button
            type="button"
            className={`${modalStyles.btn} ${danger ? modalStyles['btn--danger'] : modalStyles['btn--primary']}`}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </>
      }
    >
      <div style={{ padding: '24px 24px 4px', textAlign: danger ? 'center' : 'left' }}>
        {danger ? (
          <span
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 48,
              height: 48,
              margin: '0 auto 14px',
              borderRadius: 9999,
              background: 'var(--danger-soft)',
              color: 'var(--danger)',
            }}
            aria-hidden
          >
            <AlertTriangle size={24} strokeWidth={1.9} />
          </span>
        ) : null}

        <h2
          style={{
            fontSize: 'var(--font-lg)',
            fontWeight: 800,
            marginBottom: 8,
            textAlign: danger ? 'center' : 'left',
          }}
        >
          {title}
        </h2>

        <div
          style={{
            fontSize: 'var(--font-sm)',
            color: 'var(--text-secondary)',
            lineHeight: 1.65,
          }}
        >
          {description}
        </div>

        {children ? <div style={{ marginTop: 16 }}>{children}</div> : null}
      </div>
    </Modal>
  );
}
