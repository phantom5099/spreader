import { Button } from './Button';
import { cx } from '@admin/cx';
import s from './Pagination.module.css';

export interface PaginationProps {
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  loading?: boolean;
  /** 右侧摘要文本，如“第 1 页 · 共 14 条” */
  summary?: string;
}

/** 游标分页（上一页 / 下一页；与客户端 keyset 分页约定一致） */
export function Pagination({ hasPrev, hasNext, onPrev, onNext, loading, summary }: PaginationProps) {
  return (
    <div className={s.root}>
      <Button size="sm" onClick={onPrev} disabled={!hasPrev || loading}>
        上一页
      </Button>
      {summary ? <span className={cx(s.summary, 'admin-ellipsis')}>{summary}</span> : null}
      <Button size="sm" onClick={onNext} disabled={!hasNext || loading}>
        下一页
      </Button>
    </div>
  );
}
