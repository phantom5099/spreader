import { useCallback, useEffect, useState } from 'react';
import { Download, RotateCcw } from 'lucide-react';
import type { LogActionType, ModerationLogEntry, ModerationLogFilter } from '@admin/types';
import { exportLogsCsv, fetchLogs } from '@admin/mocks/adminApi';
import {
  ACTION_SOURCE_LABEL,
  LOG_ACTION_LABEL,
  OBJECT_TYPE_LABEL,
  formatDateTime,
} from '@admin/labels';
import { PageHeader } from '@admin/components/PageHeader';
import { Panel } from '@admin/components/Panel';
import { Button } from '@admin/components/Button';
import { DataTable, type Column } from '@admin/components/DataTable';
import { SearchInput, Select } from '@admin/components/FormControls';
import { StatusBadge, type BadgeTone } from '@admin/components/StatusBadge';
import { toast } from '@admin/stores/toastStore';
import s from './ModerationLogPage.module.css';

function actionTone(type: LogActionType): BadgeTone {
  switch (type) {
    case 'takedown':
    case 'delete':
    case 'ban':
    case 'mute':
    case 'restrict':
    case 'review_reject':
      return 'danger';
    case 'throttle':
    case 'warning':
    case 'review_escalate':
      return 'warning';
    case 'restore':
    case 'revoke':
    case 'review_pass':
      return 'success';
    default:
      return 'info';
  }
}

const INITIAL_FILTER: ModerationLogFilter = {
  from: null,
  to: null,
  executor: 'all',
  action_type: 'all',
  keyword: '',
};

/**
 * PG-29 处置日志检索
 *
 * - 只读审计页：不可修改、不可删除（原记录与撤销记录并存）
 * - 五维筛选：时间范围 / 执行者 / 动作类型 / 关键词
 * - CSV 导出：含 BOM，Excel 直接打开中文不乱码
 * - 留存提示：网络日志 ≥ 6 个月，内容与处置记录 ≥ 60 日（演示环境）
 */
export function ModerationLogPage() {
  const [filter, setFilter] = useState<ModerationLogFilter>(INITIAL_FILTER);
  const [keywordInput, setKeywordInput] = useState('');
  const [logs, setLogs] = useState<ModerationLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setLogs(await fetchLogs(filter));
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onExport = async () => {
    setExporting(true);
    try {
      const csv = await exportLogsCsv(filter);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '');
      a.href = url;
      a.download = `moderation-logs-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast(`已导出 ${logs.length} 条日志`);
    } catch {
      toast('导出失败，请重试', 'error');
    }
    setExporting(false);
  };

  const columns: Column<ModerationLogEntry>[] = [
    {
      key: 'time',
      header: '时间',
      width: '140px',
      render: (l) => <span className={s.time}>{formatDateTime(l.occurred_at)}</span>,
    },
    {
      key: 'action',
      header: '动作',
      width: '96px',
      render: (l) => <StatusBadge tone={actionTone(l.action_type)}>{LOG_ACTION_LABEL[l.action_type]}</StatusBadge>,
    },
    {
      key: 'object',
      header: '对象',
      render: (l) => (
        <div className={s.objectCell}>
          <span className={s.objectLabel} title={l.object_label}>
            {l.object_label}
          </span>
          <span className="admin-id">
            {OBJECT_TYPE_LABEL[l.object_type]} · {l.object_id}
            {l.related_log_id ? ` · 撤销自 ${l.related_log_id}` : ''}
          </span>
        </div>
      ),
    },
    { key: 'reason', header: '原因类别', width: '88px', render: (l) => l.reason_category },
    {
      key: 'basis',
      header: '判定依据',
      render: (l) => (
        <span className={s.basis} title={l.basis}>
          {l.basis}
        </span>
      ),
    },
    {
      key: 'source',
      header: '来源',
      width: '84px',
      render: (l) => (
        <span className={s.source}>{ACTION_SOURCE_LABEL[l.source]}</span>
      ),
    },
    { key: 'executor', header: '执行者', width: '76px', render: (l) => <span className="admin-id">{l.executor}</span> },
    {
      key: 'state',
      header: '状态',
      width: '76px',
      render: (l) =>
        l.revoked ? <StatusBadge tone="neutral">已撤销</StatusBadge> : <StatusBadge tone="success">有效</StatusBadge>,
    },
  ];

  return (
    <>
      <PageHeader
        title="处置日志"
        description="全量操作留痕，只读不可修改；原记录与撤销记录并存"
        actions={
          <Button
            size="sm"
            icon={<Download size={14} />}
            loading={exporting}
            onClick={onExport}
          >
            导出 CSV
          </Button>
        }
      />

      <Panel className={s.noticePanel}>
        <p className={s.noticeText}>
          留存要求：网络日志留存不少于 6 个月，内容与处置记录留存不少于 60 日（演示环境）。
          日志仅支持检索与导出，不支持修改或删除。
        </p>
      </Panel>

      <div className={s.filterBar}>
        <input
          className={s.dateInput}
          type="datetime-local"
          aria-label="开始时间"
          value={filter.from ?? ''}
          onChange={(e) => setFilter((f) => ({ ...f, from: e.target.value || null }))}
        />
        <span className={s.dateSep}>至</span>
        <input
          className={s.dateInput}
          type="datetime-local"
          aria-label="结束时间"
          value={filter.to ?? ''}
          onChange={(e) => setFilter((f) => ({ ...f, to: e.target.value || null }))}
        />
        <Select
          value={filter.executor ?? 'all'}
          onChange={(v) => setFilter((f) => ({ ...f, executor: v }))}
          options={[
            { value: 'all', label: '全部执行者' },
            { value: 'admin', label: 'admin（人工）' },
            { value: 'system', label: 'system（机器）' },
          ]}
        />
        <Select
          value={filter.action_type ?? 'all'}
          onChange={(v) => setFilter((f) => ({ ...f, action_type: v as LogActionType | 'all' }))}
          options={[
            { value: 'all', label: '全部动作' },
            ...(Object.keys(LOG_ACTION_LABEL) as LogActionType[]).map((v) => ({
              value: v,
              label: LOG_ACTION_LABEL[v],
            })),
          ]}
        />
        <SearchInput
          value={keywordInput}
          onChange={setKeywordInput}
          onSubmit={() => setFilter((f) => ({ ...f, keyword: keywordInput.trim() }))}
          placeholder="对象 / 判定依据 / 日志号"
        />
        <Button size="sm" onClick={() => setFilter((f) => ({ ...f, keyword: keywordInput.trim() }))}>
          筛选
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<RotateCcw size={13} />}
          onClick={() => {
            setKeywordInput('');
            setFilter(INITIAL_FILTER);
          }}
        >
          重置
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={logs}
        rowKey={(l) => l.log_id}
        loading={loading}
        emptyText="没有符合条件的日志记录"
        rowClassName={(l) => (l.revoked ? s.revokedRow : undefined)}
      />

      <p className={s.countHint}>共 {logs.length} 条记录</p>
    </>
  );
}
