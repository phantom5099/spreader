import type { ReactNode } from 'react';
import s from './KeyValue.module.css';

export interface KeyValueProps {
  items: { label: string; value: ReactNode }[];
  columns?: 1 | 2;
}

/** 键值对列表（详情抽屉的元信息区） */
export function KeyValue({ items, columns = 1 }: KeyValueProps) {
  return (
    <dl className={columns === 2 ? s.grid2 : s.grid1}>
      {items.map((it) => (
        <div key={it.label} className={s.row}>
          <dt className={s.label}>{it.label}</dt>
          <dd className={s.value}>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
