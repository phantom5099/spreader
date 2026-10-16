import type { ReactNode } from 'react';
import s from './PageHeader.module.css';

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

/** 页面标题区：标题 + 说明 + 右侧操作 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className={s.header}>
      <div className={s.text}>
        <h1 className={s.title}>{title}</h1>
        {description ? <p className={s.description}>{description}</p> : null}
      </div>
      {actions ? <div className={s.actions}>{actions}</div> : null}
    </header>
  );
}
