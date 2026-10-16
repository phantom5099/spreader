import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import type {
  AuditTask,
  AuditTaskStatus,
  ContentKind,
  Page as TaskPage,
  RiskLevel,
  ReviewDecisionInput,
  ReviewOutcome,
} from '@admin/types';
import { fetchReviewQueue, submitReviewDecision } from '@admin/mocks/adminApi';
import {
  AUDIT_STATUS_LABEL,
  CONTENT_KIND_LABEL,
  MACHINE_VERDICT_LABEL,
  REVIEW_OUTCOME_LABEL,
  RISK_LABEL,
  REASON_CATEGORIES,
  formatWaiting,
} from '@admin/labels';
import { PageHeader } from '@admin/components/PageHeader';
import { Button } from '@admin/components/Button';
import { DataTable, type Column } from '@admin/components/DataTable';
import { Pagination } from '@admin/components/Pagination';
import { Drawer } from '@admin/components/Drawer';
import { Field, SearchInput, Segmented, Select, TextArea } from '@admin/components/FormControls';
import { StatusBadge, type BadgeTone } from '@admin/components/StatusBadge';
import { toast } from '@admin/stores/toastStore';
import s from './ReviewQueuePage.module.css';

interface FilterState {
  status: AuditTaskStatus | 'all';
  kind: ContentKind | 'all';
  risk: RiskLevel | 'all';
  keyword: string;
  sort: 'oldest' | 'most_reported';
}

const INITIAL_FILTER: FilterState = {
  status: 'pending',
  kind: 'all',
  risk: 'all',
  keyword: '',
  sort: 'oldest',
};

const PAGE_SIZE = 10;

const RISK_TONE: Record<RiskLevel, BadgeTone> = {
  urgent: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'neutral',
};

const STATUS_TONE: Record<AuditTaskStatus, BadgeTone> = {
  pending: 'accent',
  escalated: 'warning',
  passed: 'success',
  rejected: 'danger',
};

/**
 * PG-25 内容审核队列
 *
 * - 筛选：状态 / 类型 / 风险 / 关键词；默认最旧优先（积压先处理），
 *   可切换“被举报最多”（PRD 8.11.2）
 * - 分页：keyset 游标，与客户端分页约定一致
 * - 行选跨页保留，支持批量判定（通过 / 不通过 / 升级）
 * - 判定与处置分离：这里只出审核结论，处置走内容处置操作台
 */
export function ReviewQueuePage() {
  const navigate = useNavigate();

  const [filter, setFilter] = useState<FilterState>(INITIAL_FILTER);
  const [keywordInput, setKeywordInput] = useState('');
  const [page, setPage] = useState<TaskPage<AuditTask> | null>(null);
  const [loading, setLoading] = useState(true);
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);

  const currentCursor = cursorStack.length > 0 ? cursorStack[cursorStack.length - 1] : null;

  const load = useCallback(
    async (cursor: string | null) => {
      setLoading(true);
      const data = await fetchReviewQueue({ ...filter, cursor, limit: PAGE_SIZE });
      setPage(data);
      setLoading(false);
    },
    [filter],
  );

  /* 筛选变化即回到第一页 */
  useEffect(() => {
    setCursorStack([]);
    void load(null);
  }, [load]);

  const onNext = () => {
    if (!page?.next_cursor) return;
    setCursorStack((st) => [...st, currentCursor]);
    void load(page.next_cursor);
  };

  const onPrev = () => {
    if (cursorStack.length === 0) return;
    const nextStack = cursorStack.slice(0, -1);
    setCursorStack(nextStack);
    void load(nextStack.length > 0 ? nextStack[nextStack.length - 1] : null);
  };

  const applyKeyword = () => {
    setFilter((f) => ({ ...f, keyword: keywordInput.trim() }));
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (ids: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allChecked = ids.length > 0 && ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allChecked) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const rows = page?.items ?? [];

  const columns: Column<AuditTask>[] = [
    {
      key: 'content',
      header: '内容',
      render: (t) => (
        <div className={s.contentCell}>
          <span className={s.preview}>{t.content_preview}</span>
          <span className="admin-id">
            {t.task_id} · {t.object_id} · @{t.author.handle}
          </span>
        </div>
      ),
    },
    {
      key: 'kind',
      header: '类型',
      width: '64px',
      render: (t) => CONTENT_KIND_LABEL[t.object_type],
    },
    {
      key: 'machine',
      header: '机器结论',
      width: '110px',
      render: (t) => (
        <div className={s.machineCell}>
          <StatusBadge
            tone={t.machine.verdict === 'reject' ? 'danger' : t.machine.verdict === 'uncertain' ? 'warning' : 'success'}
          >
            {MACHINE_VERDICT_LABEL[t.machine.verdict]}
          </StatusBadge>
          <span className={s.confidence}>置信度 {Math.round(t.machine.confidence * 100)}%</span>
        </div>
      ),
    },
    {
      key: 'reports',
      header: '举报',
      width: '52px',
      align: 'right',
      render: (t) => (t.report_count > 0 ? t.report_count : '—'),
    },
    {
      key: 'risk',
      header: '风险',
      width: '64px',
      render: (t) => <StatusBadge tone={RISK_TONE[t.risk]}>{RISK_LABEL[t.risk]}</StatusBadge>,
    },
    {
      key: 'status',
      header: '状态',
      width: '76px',
      render: (t) => <StatusBadge tone={STATUS_TONE[t.status]}>{AUDIT_STATUS_LABEL[t.status]}</StatusBadge>,
    },
    {
      key: 'waiting',
      header: '排队时长',
      width: '120px',
      render: (t) => (
        <span className={t.status === 'pending' ? s.waiting : s.waitingMuted}>
          {formatWaiting(t.queue_entered_at)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      width: '56px',
      render: (t) => (
        /* 用 Link 而非 navigate()：详情是独立 URL，支持右键新标签页打开、复制链接 */
        <Link
          to={`/review/${t.task_id}`}
          className="admin-text-action"
          onClick={(e) => e.stopPropagation()}
        >
          详情
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="内容审核队列"
        description="机器审核结论 + 人工判定；判定只记录结论，内容处置请前往处置操作台"
      />

      <div className={s.filterBar}>
        <Select
          value={filter.status}
          onChange={(v) => setFilter((f) => ({ ...f, status: v as FilterState['status'] }))}
          options={[
            { value: 'all', label: '全部状态' },
            ...(Object.keys(AUDIT_STATUS_LABEL) as AuditTaskStatus[]).map((v) => ({
              value: v,
              label: AUDIT_STATUS_LABEL[v],
            })),
          ]}
        />
        <Select
          value={filter.kind}
          onChange={(v) => setFilter((f) => ({ ...f, kind: v as FilterState['kind'] }))}
          options={[
            { value: 'all', label: '全部类型' },
            ...(Object.keys(CONTENT_KIND_LABEL) as ContentKind[]).map((v) => ({
              value: v,
              label: CONTENT_KIND_LABEL[v],
            })),
          ]}
        />
        <Select
          value={filter.risk}
          onChange={(v) => setFilter((f) => ({ ...f, risk: v as FilterState['risk'] }))}
          options={[
            { value: 'all', label: '全部风险' },
            ...(Object.keys(RISK_LABEL) as RiskLevel[]).map((v) => ({
              value: v,
              label: RISK_LABEL[v],
            })),
          ]}
        />
        <Select
          value={filter.sort}
          onChange={(v) => setFilter((f) => ({ ...f, sort: v as FilterState['sort'] }))}
          options={[
            { value: 'oldest', label: '最旧优先' },
            { value: 'most_reported', label: '被举报最多' },
          ]}
        />
        <SearchInput
          value={keywordInput}
          onChange={setKeywordInput}
          onSubmit={applyKeyword}
          placeholder="内容 / 任务号 / 作者"
        />
        <Button size="sm" onClick={applyKeyword}>
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

      {selected.size > 0 ? (
        <div className={s.batchBar}>
          <span className={s.batchCount}>已选 {selected.size} 项（跨页保留）</span>
          <div className={s.batchActions}>
            <Button size="sm" variant="primary" onClick={() => setBatchOpen(true)}>
              批量判定
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              清除选择
            </Button>
          </div>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(t) => t.task_id}
        loading={loading}
        emptyText="没有符合条件的审核任务"
        selectable={{ selectedIds: selected, onToggle: toggle, onToggleAll: toggleAll }}
        onRowClick={(t) => navigate(`/review/${t.task_id}`)}
      />

      <Pagination
        hasPrev={cursorStack.length > 0}
        hasNext={Boolean(page?.has_more)}
        onPrev={onPrev}
        onNext={onNext}
        loading={loading}
        summary={`本页 ${rows.length} 条${page?.has_more ? ' · 还有更多' : ''}`}
      />

      <BatchDecisionDrawer
        open={batchOpen}
        count={selected.size}
        submitting={false}
        onClose={() => setBatchOpen(false)}
        onSubmit={async (input) => {
          let ok = 0;
          let fail = 0;
          for (const id of selected) {
            try {
              await submitReviewDecision(id, input);
              ok += 1;
            } catch {
              fail += 1;
            }
          }
          setSelected(new Set());
          setBatchOpen(false);
          void load(currentCursor);
          toast(`批量判定完成：成功 ${ok} 条${fail > 0 ? `，失败 ${fail} 条` : ''}`, fail > 0 ? 'error' : 'success');
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * 批量判定抽屉
 * ------------------------------------------------------------------ */

interface BatchDecisionDrawerProps {
  open: boolean;
  count: number;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (input: ReviewDecisionInput) => void | Promise<void>;
}

function BatchDecisionDrawer({
  open,
  count,
  submitting,
  onClose,
  onSubmit,
}: BatchDecisionDrawerProps) {
  const [outcome, setOutcome] = useState<ReviewOutcome>('pass');
  const [reasonCategory, setReasonCategory] = useState('');
  const [basis, setBasis] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!reasonCategory || !basis.trim()) {
      setError('请选择原因类别并填写判定依据');
      return;
    }
    setError(null);
    void onSubmit({ outcome, reason_category: reasonCategory, basis: basis.trim() });
  };

  return (
    <Drawer
      open={open}
      title="批量判定"
      subtitle={`将对已选 ${count} 个任务应用同一判定结论与理由`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" loading={submitting} onClick={submit}>
            确认判定
          </Button>
        </>
      }
    >
      <div className={s.batchForm}>
        <Field label="判定结论" required>
          <Segmented
            value={outcome}
            onChange={setOutcome}
            options={(Object.keys(REVIEW_OUTCOME_LABEL) as ReviewOutcome[]).map((v) => ({
              value: v,
              label: REVIEW_OUTCOME_LABEL[v],
            }))}
          />
        </Field>
        <Field label="原因类别" required>
          <Select
            value={reasonCategory}
            onChange={setReasonCategory}
            options={[
              { value: '', label: '请选择' },
              ...REASON_CATEGORIES.map((c) => ({ value: c, label: c })),
            ]}
          />
        </Field>
        <Field label="判定依据" required hint="同一条理由将写入每个任务的判定记录与处置日志">
          <TextArea value={basis} onChange={setBasis} rows={3} />
        </Field>
        {error ? <p className={s.batchError}>{error}</p> : null}
        <p className={s.batchNote}>
          说明：批量判定只记录审核结论；如需下架 / 限流 / 删除，请在内容处置操作台执行（判定与处置职责分离）。
        </p>
      </div>
    </Drawer>
  );
}
