import type { ReactNode } from 'react';
import { cx } from '@admin/cx';
import s from './DataTable.module.css';

export interface Column<T> {
  key: string;
  header: ReactNode;
  width?: string;
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyText?: string;
  /** 开启跨页选择：selectedIds 由页面维护，翻页不清空 */
  selectable?: {
    selectedIds: Set<string>;
    onToggle: (id: string) => void;
    onToggleAll: (ids: string[]) => void;
  };
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
}

/** 通用数据表（筛选 / 分页 / 行选 / 行内操作由页面组装） */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyText = '暂无数据',
  selectable,
  onRowClick,
  rowClassName,
}: DataTableProps<T>) {
  const allChecked =
    rows.length > 0 && rows.every((r) => selectable?.selectedIds.has(rowKey(r)));

  return (
    <div className={s.wrap}>
      <table className={s.table}>
        <thead>
          <tr>
            {selectable ? (
              <th className={cx(s.cell, s.checkCell)}>
                <input
                  type="checkbox"
                  aria-label="全选本页"
                  checked={allChecked}
                  onChange={(e) =>
                    selectable.onToggleAll(e.target.checked ? rows.map(rowKey) : [])
                  }
                />
              </th>
            ) : null}
            {columns.map((c) => (
              <th
                key={c.key}
                className={cx(s.cell, c.align === 'right' && s.right)}
                style={c.width ? { width: c.width } : undefined}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 3 }, (_, i) => (
                <tr key={`skeleton-${i}`}>
                  {selectable ? <td className={cx(s.cell, s.checkCell)} /> : null}
                  {columns.map((c) => (
                    <td key={c.key} className={s.cell}>
                      <div className="skeleton-shimmer" style={{ height: 14, borderRadius: 4 }} />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => {
                const id = rowKey(row);
                return (
                  <tr
                    key={id}
                    className={cx(
                      onRowClick && s.clickable,
                      selectable?.selectedIds.has(id) && s.selected,
                      rowClassName?.(row),
                    )}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {selectable ? (
                      <td
                        className={cx(s.cell, s.checkCell)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          aria-label={`选择 ${id}`}
                          checked={selectable.selectedIds.has(id)}
                          onChange={() => selectable.onToggle(id)}
                        />
                      </td>
                    ) : null}
                    {columns.map((c) => (
                      <td key={c.key} className={cx(s.cell, c.align === 'right' && s.right)}>
                        {c.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
        </tbody>
      </table>
      {!loading && rows.length === 0 ? <div className={s.empty}>{emptyText}</div> : null}
    </div>
  );
}
