import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';
import s from './Drawer.module.css';

export interface DrawerProps {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  width?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** 右侧抽屉（审核详情 / 处置表单 / 举报详情等“重表单、重信息”场景） */
export function Drawer({
  open,
  title,
  subtitle,
  onClose,
  width = '520px',
  children,
  footer,
}: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className={s.mask} onClick={onClose} aria-hidden="true" />
      <aside
        className={s.drawer}
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
      >
        <header className={s.header}>
          <div className={s.titleWrap}>
            <h2 className={s.title}>{title}</h2>
            {subtitle ? <div className={s.subtitle}>{subtitle}</div> : null}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="关闭" icon={<X size={16} />} />
        </header>
        <div className={s.body}>{children}</div>
        {footer ? <footer className={s.footer}>{footer}</footer> : null}
      </aside>
    </>
  );
}
