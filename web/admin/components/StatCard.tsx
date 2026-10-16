import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '@admin/cx';
import s from './StatCard.module.css';

export interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'neutral' | 'accent' | 'warning' | 'danger';
  /** 提供时整卡可点击跳转（工作台待办驱动） */
  to?: string;
}

/** 统计卡（工作台指标） */
export function StatCard({ label, value, hint, tone = 'neutral', to }: StatCardProps) {
  const body = (
    <>
      <span className={s.label}>{label}</span>
      <span className={cx(s.value, s[tone])}>{value}</span>
      {hint ? <span className={s.hint}>{hint}</span> : null}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={s.card}>
        {body}
      </Link>
    );
  }
  return <div className={s.card}>{body}</div>;
}
