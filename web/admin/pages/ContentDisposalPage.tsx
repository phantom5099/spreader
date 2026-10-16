import { useCallback, useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type {
  BatchDisposalResultItem,
  ContentDisposalInput,
  ContentKind,
  ContentObject,
  ContentObjectStatus,
  ModerationAction,
} from '@admin/types';
import {
  createDisposalBatch,
  fetchContentObjects,
  fetchRecentActions,
  revokeDisposal,
} from '@admin/mocks/adminApi';
import {
  CONTENT_KIND_LABEL,
  CONTENT_STATUS_LABEL,
  DISPOSAL_ACTION_LABEL,
  formatRelative,
  formatShortDateTime,
} from '@admin/labels';
import { PageHeader } from '@admin/components/PageHeader';
import { Panel } from '@admin/components/Panel';
import { Button } from '@admin/components/Button';
import { DataTable, type Column } from '@admin/components/DataTable';
import { Pagination } from '@admin/components/Pagination';
import { Drawer } from '@admin/components/Drawer';
import { ConfirmDialog } from '@admin/components/ConfirmDialog';
import { DisposalForm } from '@admin/components/DisposalForm';
import { SearchInput, Select } from '@admin/components/FormControls';
import { StatusBadge, type BadgeTone } from '@admin/components/StatusBadge';
import { toast } from '@admin/stores/toastStore';
import s from './ContentDisposalPage.module.css';

interface FilterState {
  keyword: string;
  type: ContentKind | 'all';
  status: ContentObjectStatus | 'all';
}

const INITIAL_FILTER: FilterState = { keyword: '', type: 'all', status: 'all' };
const PAGE_SIZE = 10;

const STATUS_TONE: Record<ContentObjectStatus, BadgeTone> = {
  published: 'success',
  reviewing: 'info',
  takedown: 'danger',
  throttled: 'warning',
  deleted: 'neutral',
  expired: 'neutral',
};

/**
 * PG-26 内容处置操作台
 *
 * - 检索：关键词 / 类型 / 当前状态
 * - 选择：逐条 / 全选本页 / 按筛选条件全选（PRD 8.11.3 AC-3）
 * - 处置：下架 / 限流 / 删除 / 恢复，含原因类别、判定依据、生效与到期时间；
 *   批量逐条执行、逐条出结果，对象已不存在不影响同批其他对象（AC-4 / AC-5）
 * - 可回写：撤销任一处置，原记录与撤销记录并存留痕
 */
export function ContentDisposalPage() {
  const [filter, setFilter] = useState<FilterState>(INITIAL_FILTER);
  const [keywordInput, setKeywordInput] = useState('');
  const [objects, setObjects] = useState<ContentObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageIdx, setPageIdx] = useState(0);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerObjects, setDrawerObjects] = useState<ContentObject[] | null>(null);
  const [results, setResults] = useState<BatchDisposalResultItem[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [revokeTarget, setRevokeTarget] = useState<ModerationAction | null>(null);
  const [historyTarget, setHistoryTarget] = useState<ContentObject | null>(null);
  const [historyActions, setHistoryActions] = useState<ModerationAction[]>([]);
  const [recent, setRecent] = useState<ModerationAction[]>([]);

  /* 当前生效处置：object_id → 最新未撤销处置（用于行内“撤销”） */
  const [activeMap, setActiveMap] = useState<Map<string, ModerationAction>>(new Map());

  const reload = useCallback(async () => {
    setLoading(true);
    const [list, recentActions] = await Promise.all([
      fetchContentObjects(filter),
      fetchRecentActions(50),
    ]);
    setObjects(list);
    setRecent(recentActions);
    const map = new Map<string, ModerationAction>();
    for (const a of recentActions) {
      if (a.revoked || a.object_type === 'user' || a.object_type === 'message') continue;
      const key = `${a.object_type}:${a.object_id}`;
      if (!map.has(key)) map.set(key, a);
    }
    setActiveMap(map);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    setPageIdx(0);
    void reload();
  }, [reload]);

  const totalPages = Math.max(1, Math.ceil(objects.length / PAGE_SIZE));
  const safePage = Math.min(pageIdx, totalPages - 1);
  const visible = objects.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = (ids: string[]) => {
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

  const openBatchDrawer = (objs: ContentObject[]) => {
    setResults(null);
    setDrawerObjects(objs);
  };

  const submitDisposal = async (input: ContentDisposalInput) => {
    if (!drawerObjects) return;
    setSubmitting(true);
    const items = drawerObjects.map((o) => ({ object_type: o.object_type, object_id: o.object_id }));
    const res = await createDisposalBatch(items, input);
    setResults(res);
    setSubmitting(false);
    const ok = res.filter((r) => r.ok).length;
    if (ok > 0) toast(`处置已执行：成功 ${ok} 条${res.length - ok > 0 ? `，失败 ${res.length - ok} 条` : ''}`);
    else toast('处置未执行：所有对象均不满足条件', 'error');
  };

  const closeDrawer = () => {
    setDrawerObjects(null);
    setResults(null);
    setSelected(new Set());
    void reload();
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await revokeDisposal(revokeTarget.action_id);
      toast('已撤销该处置，内容恢复至处置前状态');
    } catch {
      toast('撤销失败，请重试', 'error');
    }
    setRevokeTarget(null);
    void reload();
  };

  const openHistory = async (obj: ContentObject) => {
    const list = await fetchRecentActions(50);
    setHistoryActions(
      list
        .filter((a) => a.object_type === obj.object_type && a.object_id === obj.object_id)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    );
    setHistoryTarget(obj);
  };

  const columns: Column<ContentObject>[] = [
    {
      key: 'content',
      header: '内容',
      render: (o) => (
        <div className={s.contentCell}>
          <span className={s.preview}>{o.preview}</span>
          <span className="admin-id">{o.object_id}</span>
        </div>
      ),
    },
    { key: 'kind', header: '类型', width: '56px', render: (o) => CONTENT_KIND_LABEL[o.object_type] },
    {
      key: 'author',
      header: '作者',
      width: '110px',
      render: (o) => (
        <div className={s.authorCell}>
          <span>{o.author.nickname}</span>
          <span className="admin-id">@{o.author.handle}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: '状态',
      width: '84px',
      render: (o) => <StatusBadge tone={STATUS_TONE[o.status]}>{CONTENT_STATUS_LABEL[o.status]}</StatusBadge>,
    },
    {
      key: 'reports',
      header: '举报',
      width: '52px',
      align: 'right',
      render: (o) => (o.report_count > 0 ? o.report_count : '—'),
    },
    {
      key: 'disposal',
      header: '当前处置',
      width: '150px',
      render: (o) => {
        const active = activeMap.get(`${o.object_type}:${o.object_id}`);
        if (!active) return <span className={s.noDisposal}>—</span>;
        return (
          <div className={s.disposalCell}>
            <span className={s.disposalAction}>{DISPOSAL_ACTION_LABEL[active.action]}</span>
            <span className="admin-id">
              {active.expires_at ? `至 ${formatShortDateTime(active.expires_at)}` : '长期'}
            </span>
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: '操作',
      width: '118px',
      render: (o) => {
        const active = activeMap.get(`${o.object_type}:${o.object_id}`);
        return (
          <div className={s.rowActions}>
            <button type="button" className="admin-text-action" onClick={() => openBatchDrawer([o])}>
              处置
            </button>
            {active ? (
              <button
                type="button"
                className="admin-text-danger"
                onClick={() => setRevokeTarget(active)}
              >
                撤销
              </button>
            ) : null}
            <button type="button" className="admin-text-action" onClick={() => void openHistory(o)}>
              历史
            </button>
          </div>
        );
      },
    },
  ];

  const selectedObjects = objects.filter((o) => selected.has(o.object_id));

  return (
    <>
      <PageHeader
        title="内容处置操作台"
        description="下架 / 限流 / 删除 / 恢复；批量逐条执行，处置可撤销、全程留痕"
      />

      <div className={s.filterBar}>
        <SearchInput
          value={keywordInput}
          onChange={setKeywordInput}
          onSubmit={() => setFilter((f) => ({ ...f, keyword: keywordInput.trim() }))}
          placeholder="内容 / 对象号 / 作者"
        />
        <Select
          value={filter.type}
          onChange={(v) => setFilter((f) => ({ ...f, type: v as FilterState['type'] }))}
          options={[
            { value: 'all', label: '全部类型' },
            ...(Object.keys(CONTENT_KIND_LABEL) as ContentKind[]).map((v) => ({
              value: v,
              label: CONTENT_KIND_LABEL[v],
            })),
          ]}
        />
        <Select
          value={filter.status}
          onChange={(v) => setFilter((f) => ({ ...f, status: v as FilterState['status'] }))}
          options={[
            { value: 'all', label: '全部状态' },
            ...(Object.keys(CONTENT_STATUS_LABEL) as ContentObjectStatus[]).map((v) => ({
              value: v,
              label: CONTENT_STATUS_LABEL[v],
            })),
          ]}
        />
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
        <div className={s.selectAllBox}>
          {selected.size > 0 && selected.size === objects.length ? (
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              清除选择（{selected.size}）
            </Button>
          ) : (
            <Button size="sm" onClick={() => setSelected(new Set(objects.map((o) => o.object_id)))}>
              按筛选全选（{objects.length} 条）
            </Button>
          )}
        </div>
      </div>

      {selected.size > 0 ? (
        <div className={s.batchBar}>
          <span className={s.batchCount}>已选 {selected.size} 项（跨页保留）</span>
          <div className={s.batchActions}>
            <Button size="sm" variant="primary" onClick={() => openBatchDrawer(selectedObjects)}>
              批量处置
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              清除选择
            </Button>
          </div>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(o) => o.object_id}
        loading={loading}
        emptyText="没有符合条件的内容对象"
        selectable={{
          selectedIds: selected,
          onToggle: toggle,
          onToggleAll: toggleAllVisible,
        }}
      />

      <Pagination
        hasPrev={safePage > 0}
        hasNext={safePage < totalPages - 1}
        onPrev={() => setPageIdx((p) => Math.max(0, p - 1))}
        onNext={() => setPageIdx((p) => Math.min(totalPages - 1, p + 1))}
        loading={loading}
        summary={`第 ${safePage + 1} / ${totalPages} 页 · 共 ${objects.length} 条`}
      />

      <Panel
        className={s.recentPanel}
        title="最近处置记录"
        description="最新 5 条；原记录与撤销记录并存，可在处置日志页检索导出"
      >
        {recent.length === 0 ? (
          <p className={s.recentEmpty}>暂无处置记录</p>
        ) : (
          <ul className={s.recentList}>
            {recent.slice(0, 5).map((a) => (
              <li key={a.action_id} className={s.recentItem}>
                <span className={s.recentTime}>{formatRelative(a.created_at)}</span>
                <span className={s.recentAction}>{DISPOSAL_ACTION_LABEL[a.action]}</span>
                <span className={s.recentLabel} title={a.object_label}>
                  {a.object_label}
                </span>
                <span className="admin-id">{a.reason_category}</span>
                {a.revoked ? (
                  <StatusBadge tone="neutral">已撤销</StatusBadge>
                ) : (
                  <button
                    type="button"
                    className="admin-text-danger"
                    onClick={() => setRevokeTarget(a)}
                  >
                    撤销
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* 处置抽屉（单条 / 批量共用） */}
      <Drawer
        open={drawerObjects !== null}
        title={
          drawerObjects && drawerObjects.length === 1
            ? `处置：${CONTENT_KIND_LABEL[drawerObjects[0].object_type]} ${drawerObjects[0].object_id}`
            : `批量处置（${drawerObjects?.length ?? 0} 个对象）`
        }
        subtitle="处置动作 + 原因类别 + 判定依据 + 生效 / 到期时间"
        onClose={closeDrawer}
        width="560px"
        footer={
          results ? (
            <Button variant="primary" onClick={closeDrawer}>
              完成
            </Button>
          ) : undefined
        }
      >
        {drawerObjects ? (
          <DisposalForm
            key={drawerObjects.map((o) => o.object_id).join(',')}
            objects={drawerObjects}
            submitting={submitting}
            results={results}
            onSubmit={submitDisposal}
          />
        ) : null}
      </Drawer>

      {/* 处置历史 */}
      <Drawer
        open={historyTarget !== null}
        title={historyTarget ? `处置历史：${historyTarget.object_id}` : '处置历史'}
        subtitle="含已撤销记录（原记录与撤销记录并存）"
        onClose={() => setHistoryTarget(null)}
      >
        {historyActions.length === 0 ? (
          <p className={s.recentEmpty}>该对象暂无处置记录</p>
        ) : (
          <ul className={s.historyList}>
            {historyActions.map((a) => (
              <li key={a.action_id} className={s.historyItem}>
                <div className={s.historyHead}>
                  <span className={s.recentAction}>{DISPOSAL_ACTION_LABEL[a.action]}</span>
                  <span className="admin-id">{formatShortDateTime(a.created_at)}</span>
                  {a.revoked ? <StatusBadge tone="neutral">已撤销</StatusBadge> : null}
                  {a.batch_id ? <StatusBadge tone="info">批量</StatusBadge> : null}
                </div>
                <p className={s.historyBasis}>{a.basis}</p>
                <div className={s.historyMeta}>
                  <span className="admin-id">{a.reason_category}</span>
                  <span className="admin-id">
                    {a.expires_at ? `到期 ${formatShortDateTime(a.expires_at)}` : '长期'}
                  </span>
                  <span className="admin-id">执行者 {a.executor}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Drawer>

      {/* 撤销二次确认 */}
      <ConfirmDialog
        open={revokeTarget !== null}
        title="确认撤销该处置？"
        message={
          revokeTarget
            ? `将撤销对「${revokeTarget.object_label}」的「${DISPOSAL_ACTION_LABEL[revokeTarget.action]}」，内容 / 账号恢复至处置前状态，并在处置日志中留下撤销记录。`
            : ''
        }
        confirmText="确认撤销"
        danger
        onConfirm={confirmRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </>
  );
}
