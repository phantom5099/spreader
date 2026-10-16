import type { ReactNode } from 'react';
import { cx } from '@admin/cx';
import s from './Panel.module.css';

export interface PanelProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** 内容面板（工作台分区 / 抽屉分区通用） */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: PanelProps) {
  return (
    <section className={cx(s.panel, className)}>
      {title ? (
        <header className={s.head}>
          <div className={s.headText}>
            <h2 className={s.title}>{title}</h2>
            {description ? <p className={s.description}>{description}</p> : null}
          </div>
          {actions ? <div className={s.headActions}>{actions}</div> : null}
        </header>
      ) : null}
      <div className={cx(s.body, bodyClassName)}>{children}</div>
    </section>
  );
}
