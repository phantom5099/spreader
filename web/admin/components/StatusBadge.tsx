import type { ReactNode } from 'react';
import { cx } from '@admin/cx';
import s from './StatusBadge.module.css';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

export interface StatusBadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  title?: string;
}

/** 状态徽章（风险等级 / 任务状态 / 账号状态等通用） */
export function StatusBadge({ tone = 'neutral', children, title }: StatusBadgeProps) {
  return (
    <span className={cx(s.badge, s[tone])} title={title}>
      {children}
    </span>
  );
}
