import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  Appeal,
  AppealOutcome,
  BatchDisposalResultItem,
  ContentDisposalInput,
  ContentKind,
  ContentObject,
  ModerationAction,
  Report,
  ReportStatus,
} from '@admin/types';
import {
  closeWithdrawnReport,
  createDisposalBatch,
  fetchAction,
  fetchActionsForObject,
  fetchAppeals,
  fetchContentObjects,
  fetchReports,
  resolveReport,
  reviewAppeal,
} from '@admin/mocks/adminApi';
import {
  APPEAL_STATUS_LABEL,
  DISPOSAL_ACTION_LABEL,
  OBJECT_TYPE_LABEL,
  REPORT_STATUS_LABEL,
  RISK_LABEL,
  formatDateTime,
  formatRelative,
} from '@admin/labels';
import { PageHeader } from '@admin/components/PageHeader';
import { Button } from '@admin/components/Button';
import { DataTable, type Column } from '@admin/components/DataTable';
import { Drawer } from '@admin/components/Drawer';
import { DisposalForm } from '@admin/components/DisposalForm';
import { Field, SearchInput, Segmented, Select, TextArea } from '@admin/components/FormControls';
import { KeyValue } from '@admin/components/KeyValue';
import { StatusBadge, type BadgeTone } from '@admin/components/StatusBadge';
import { toast } from '@admin/stores/toastStore';
import s from './ReportsAppealsPage.module.css';

type Tab = 'reports' | 'appeals';

const RISK_TONE: Record<Report['risk'], BadgeTone> = {
  urgent: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'neutral',
};

const REPORT_STATUS_TONE: Record<ReportStatus, BadgeTone> = {
  pending: 'accent',
  processing: 'warning',
  resolved: 'success',
  closed: 'neutral',
};

/**
 * PG-28 举报与申诉处理
 *
 * 举报（PRD 8.11.5）：
 * - 状态流转：待处理 → 处理中 → 已结案 / 已关闭
 * - 认定违规 → 执行处置 → 处置记录回写举报单（关联处置线索）
 * - 未认定违规直接结案；举报人撤回后结案，已生效处置不因此撤销
 * 申诉：
 * - 维持：仅记录结论；撤销：自动撤销原处置、恢复对象、留痕并通知本人
 */
export function ReportsAppealsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get('tab') === 'appeals' ? 'appeals' : 'reports';

  const [reports, setReports] = useState<Report[]>([]);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);

  const [reportKeywordInput, setReportKeywordInput] = useState('');
  const [reportStatus, setReportStatus] = useState<ReportStatus | 'all'>('pending');
  const [appealKeywordInput, setAppealKeywordInput] = useState('');
  const [appealStatus, setAppealStatus] = useState<'pending_review' | 'reviewing' | 'all'>('pending_review');

  const [openReport, setOpenReport] = useState<Report | null>(null);
  const [relatedReports, setRelatedReports] = useState<Report[]>([]);
  const [targetActions, setTargetActions] = useState<ModerationAction[]>([]);
  const [targetObject, setTargetObject] = useState<ContentObject | null>(null);
  const [reportResults, setReportResults] = useState<BatchDisposalResultItem[] | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [noViolationNote, setNoViolationNote] = useState('');
  const [showNoViolation, setShowNoViolation] = useState(false);

  const [openAppeal, setOpenAppeal] = useState<Appeal | null>(null);
  const [targetAction, setTargetAction] = useState<ModerationAction | null>(null);
  const [appealOutcome, setAppealOutcome] = useState<AppealOutcome>('upheld');
  const [appealNote, setAppealNote] = useState('');
  const [appealSubmitting, setAppealSubmitting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const [r, a] = await Promise.all([
      fetchReports({ status: reportStatus, keyword: reportKeywordInput }),
      fetchAppeals({ status: appealStatus, keyword: appealKeywordInput }),
    ]);
    setReports(r);
    setAppeals(a);
    setLoading(false);
  }, [reportStatus, reportKeywordInput, appealStatus, appealKeywordInput]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /* ---------- 举报详情 ---------- */

  const openReportDrawer = async (report: Report) => {
    setOpenReport(report);
    setReportResults(null);
    setShowNoViolation(false);
    setNoViolationNote('');
    const [all, actions, objects] = await Promise.all([
      fetchReports({}),
      report.target.type === 'user'
        ? Promise.resolve([])
        : fetchActionsForObject(report.target.type, report.target.id),
      fetchContentObjects({}),
    ]);
    setRelatedReports(all.filter((r) => r.target.id === report.target.id && r.report_id !== report.report_id));
    setTargetActions(actions);
    setTargetObject(
      report.target.type === 'user'
        ? null
        : (objects.find((o) => o.object_id === report.target.id && o.object_type === report.target.type) ?? null),
    );
  };

  const closeReportDrawer = () => {
    setOpenReport(null);
    void reload();
  };

  const submitReportDisposal = async (input: ContentDisposalInput) => {
    if (!openReport || openReport.target.type === 'user') return;
    setReportSubmitting(true);
    const res = await createDisposalBatch(
      [{ object_type: openReport.target.type as ContentKind, object_id: openReport.target.id }],
      input,
    );
    const ok = res.find((r) => r.ok);
    if (ok?.action_id) {
      await resolveReport(
        openReport.report_id,
        { verdict: 'violation', note: input.basis },
        ok.action_id,
      );
      toast('已认定违规：处置已执行，举报单已回写关联处置记录');
    } else {
      toast(
        `处置失败：${res[0]?.error === 'object_missing' ? '对象已不存在（作者已删除）' : '当前状态不允许该操作'}`,
        'error',
      );
    }
    setReportResults(res);
    setReportSubmitting(false);
  };

  const submitNoViolation = async () => {
    if (!openReport || !noViolationNote.trim()) {
      toast('请填写结案说明', 'error');
      return;
    }
    await resolveReport(openReport.report_id, { verdict: 'no_violation', note: noViolationNote.trim() });
    toast('已结案：未认定违规');
    closeReportDrawer();
  };

  const simulateWithdraw = async () => {
    if (!openReport) return;
    await closeWithdrawnReport(openReport.report_id);
    toast('举报人已撤回，举报单结案；已生效处置不因此撤销', 'info');
    closeReportDrawer();
  };

  /* ---------- 申诉详情 ---------- */

  const openAppealDrawer = async (appeal: Appeal) => {
    setOpenAppeal(appeal);
    setAppealOutcome('upheld');
    setAppealNote('');
    setTargetAction(await fetchAction(appeal.target_action_id));
  };

  const submitAppealReview = async () => {
    if (!openAppeal || !appealNote.trim()) {
      toast('请填写复核说明', 'error');
      return;
    }
    setAppealSubmitting(true);
    await reviewAppeal(openAppeal.appeal_id, { outcome: appealOutcome, note: appealNote.trim() });
    toast(
      appealOutcome === 'overturned'
        ? '申诉通过：原处置已自动撤销、内容已恢复，全程留痕'
        : '申诉驳回：维持原处置',
    );
    setAppealSubmitting(false);
    setOpenAppeal(null);
    void reload();
  };

  /* ---------- 表格 ---------- */

  const reportColumns: Column<Report>[] = [
    {
      key: 'report',
      header: '举报单',
      render: (r) => (
        <div className={s.idCell}>
          <span className="admin-id">{r.report_id}</span>
          <span className={s.reporter}>{r.reporter.nickname} 举报</span>
        </div>
      ),
    },
    {
      key: 'target',
      header: '被举报对象',
      render: (r) => (
        <div className={s.targetCell}>
          <span className={s.targetLabel}>{r.target.label}</span>
          <span className="admin-id">
            {OBJECT_TYPE_LABEL[r.target.type]} · {r.target.id}
          </span>
        </div>
      ),
    },
    { key: 'category', header: '类别', width: '88px', render: (r) => r.category },
    {
      key: 'risk',
      header: '风险',
      width: '60px',
      render: (r) => <StatusBadge tone={RISK_TONE[r.risk]}>{RISK_LABEL[r.risk]}</StatusBadge>,
    },
    {
      key: 'status',
      header: '状态',
      width: '84px',
      render: (r) => <StatusBadge tone={REPORT_STATUS_TONE[r.status]}>{REPORT_STATUS_LABEL[r.status]}</StatusBadge>,
    },
    {
      key: 'created',
      header: '提交时间',
      width: '120px',
      render: (r) => <span className={s.time}>{formatRelative(r.created_at)}</span>,
    },
    {
      key: 'actions',
      header: '操作',
      width: '56px',
      render: (r) => (
        <button type="button" className="admin-text-action" onClick={() => void openReportDrawer(r)}>
          {r.status === 'pending' || r.status === 'processing' ? '处理' : '查看'}
        </button>
      ),
    },
  ];

  const appealColumns: Column<Appeal>[] = [
    {
      key: 'appeal',
      header: '申诉单',
      render: (a) => (
        <div className={s.idCell}>
          <span className="admin-id">{a.appeal_id}</span>
          <span className={s.reporter}>{a.appellant.nickname} 申诉</span>
        </div>
      ),
    },
    {
      key: 'target',
      header: '被申诉处置',
      render: (a) => <span className={s.targetLabel}>{a.target_label}</span>,
    },
    {
      key: 'status',
      header: '状态',
      width: '110px',
      render: (a) => (
        <StatusBadge
          tone={
            a.status === 'upheld'
              ? 'neutral'
              : a.status === 'overturned'
                ? 'success'
                : a.status === 'reviewing'
                  ? 'warning'
                  : 'accent'
          }
        >
          {APPEAL_STATUS_LABEL[a.status]}
        </StatusBadge>
      ),
    },
    {
      key: 'created',
      header: '提交时间',
      width: '120px',
      render: (a) => <span className={s.time}>{formatRelative(a.created_at)}</span>,
    },
    {
      key: 'actions',
      header: '操作',
      width: '56px',
      render: (a) => (
        <button type="button" className="admin-text-action" onClick={() => void openAppealDrawer(a)}>
          {a.status === 'pending_review' || a.status === 'reviewing' ? '复核' : '查看'}
        </button>
      ),
    },
  ];

  const reportPending = openReport?.status === 'pending' || openReport?.status === 'processing';
  const appealPending = openAppeal?.status === 'pending_review' || openAppeal?.status === 'reviewing';

  return (
    <>
      <PageHeader title="举报与申诉" description="举报认定与处置回写；申诉维持 / 撤销自动恢复并留痕" />

      <div className={s.tabs}>
        <button
          type="button"
          className={tab === 'reports' ? s.tabActive : s.tab}
          onClick={() => setSearchParams({ tab: 'reports' })}
        >
          举报处理
        </button>
        <button
          type="button"
          className={tab === 'appeals' ? s.tabActive : s.tab}
          onClick={() => setSearchParams({ tab: 'appeals' })}
        >
          申诉复核
        </button>
      </div>

      {tab === 'reports' ? (
        <>
          <div className={s.filterBar}>
            <Select
              value={reportStatus}
              onChange={(v) => setReportStatus(v as ReportStatus | 'all')}
              options={[
                { value: 'all', label: '全部状态' },
                ...(Object.keys(REPORT_STATUS_LABEL) as ReportStatus[]).map((v) => ({
                  value: v,
                  label: REPORT_STATUS_LABEL[v],
                })),
              ]}
            />
            <SearchInput
              value={reportKeywordInput}
              onChange={setReportKeywordInput}
              onSubmit={() => setReportKeywordInput(reportKeywordInput.trim())}
              placeholder="举报单号 / 对象 / 举报人"
            />
            <Button
              size="sm"
              onClick={() => setReportKeywordInput(reportKeywordInput.trim())}
            >
              筛选
            </Button>
          </div>
          <DataTable
            columns={reportColumns}
            rows={reports}
            rowKey={(r) => r.report_id}
            loading={loading}
            emptyText="没有符合条件的举报单"
          />
        </>
      ) : (
        <>
          <div className={s.filterBar}>
            <Select
              value={appealStatus}
              onChange={(v) => setAppealStatus(v as typeof appealStatus)}
              options={[
                { value: 'pending_review', label: '待复核' },
                { value: 'reviewing', label: '复核中' },
                { value: 'all', label: '全部状态' },
              ]}
            />
            <SearchInput
              value={appealKeywordInput}
              onChange={setAppealKeywordInput}
              onSubmit={() => setAppealKeywordInput(appealKeywordInput.trim())}
              placeholder="申诉单号 / 处置 / 申诉人"
            />
            <Button size="sm" onClick={() => setAppealKeywordInput(appealKeywordInput.trim())}>
              筛选
            </Button>
          </div>
          <DataTable
            columns={appealColumns}
            rows={appeals}
            rowKey={(a) => a.appeal_id}
            loading={loading}
            emptyText="没有符合条件的申诉单"
          />
        </>
      )}

      {/* ---------- 举报详情抽屉 ---------- */}
      <Drawer
        open={openReport !== null}
        title={openReport ? `举报单 ${openReport.report_id}` : '举报单'}
        subtitle={openReport ? `${REPORT_STATUS_LABEL[openReport.status]} · 提交于 ${formatDateTime(openReport.created_at)}` : undefined}
        onClose={closeReportDrawer}
        width="580px"
      >
        {openReport ? (
          <div className={s.drawerBody}>
            <section className={s.section}>
              <h3 className={s.sectionTitle}>举报信息</h3>
              <KeyValue
                items={[
                  { label: '举报人', value: `${openReport.reporter.nickname}（@${openReport.reporter.handle}）` },
                  {
                    label: '被举报对象',
                    value: `${OBJECT_TYPE_LABEL[openReport.target.type]} ${openReport.target.label}`,
                  },
                  { label: '举报类别', value: openReport.category },
                  { label: '风险等级', value: RISK_LABEL[openReport.risk] },
                  { label: '证据材料', value: `${openReport.evidence_count} 项` },
                  { label: '举报描述', value: openReport.description },
                ]}
              />
            </section>

            <section className={s.section}>
              <h3 className={s.sectionTitle}>关联同一处置线索的记录</h3>
              {relatedReports.length === 0 && targetActions.length === 0 ? (
                <p className={s.emptyHint}>暂无关联举报或处置记录</p>
              ) : (
                <ul className={s.relatedList}>
                  {relatedReports.map((r) => (
                    <li key={r.report_id}>
                      <span className="admin-id">{r.report_id}</span>
                      <span>
                        {r.reporter.nickname} 举报「{r.target.label}」· {REPORT_STATUS_LABEL[r.status]}
                      </span>
                    </li>
                  ))}
                  {targetActions.map((a) => (
                    <li key={a.action_id}>
                      <StatusBadge tone={a.revoked ? 'neutral' : 'danger'}>
                        {DISPOSAL_ACTION_LABEL[a.action]}
                        {a.revoked ? '（已撤销）' : ''}
                      </StatusBadge>
                      <span>
                        {formatRelative(a.created_at)} · {a.basis}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {reportPending ? (
              openReport.target.type === 'user' ? (
                <section className={s.section}>
                  <h3 className={s.sectionTitle}>举报处理</h3>
                  <p className={s.emptyHint}>
                    用户类举报请前往
                    <Link className={s.inlineLink} to={`/users?keyword=${openReport.target.id}`}>
                      用户处置
                    </Link>
                    页执行分级处置。
                  </p>
                  <Button size="sm" onClick={() => void submitNoViolation()}>
                    未认定违规，直接结案
                  </Button>
                </section>
              ) : (
                <>
                  <section className={s.section}>
                    <h3 className={s.sectionTitle}>认定违规并处置</h3>
                    <p className={s.sectionHint}>
                      执行处置后将自动回写本举报单（关联处置记录），状态变为已结案。
                    </p>
                    {targetObject ? (
                      <DisposalForm
                        objects={[targetObject]}
                        submitting={reportSubmitting}
                        results={reportResults}
                        onSubmit={submitReportDisposal}
                      />
                    ) : (
                      <p className={s.emptyHint}>对象不存在或已被作者删除，无法执行处置</p>
                    )}
                  </section>

                  <section className={s.section}>
                    <h3 className={s.sectionTitle}>其他处理</h3>
                    {showNoViolation ? (
                      <div className={s.noViolationBox}>
                        <Field label="结案说明" required>
                          <TextArea
                            value={noViolationNote}
                            onChange={setNoViolationNote}
                            rows={2}
                            placeholder="说明未认定违规的理由"
                          />
                        </Field>
                        <Button size="sm" onClick={() => void submitNoViolation()}>
                          确认结案
                        </Button>
                      </div>
                    ) : (
                      <div className={s.otherActions}>
                        <Button size="sm" onClick={() => setShowNoViolation(true)}>
                          未认定违规，结案
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void simulateWithdraw()}>
                          演示：举报人撤回
                        </Button>
                      </div>
                    )}
                  </section>
                </>
              )
            ) : (
              <section className={s.section}>
                <h3 className={s.sectionTitle}>处理结果</h3>
                {openReport.resolution ? (
                  <KeyValue
                    items={[
                      {
                        label: '结论',
                        value:
                          openReport.resolution.verdict === 'violation' ? '认定违规' : '未认定违规',
                      },
                      { label: '说明', value: openReport.resolution.note },
                      { label: '处理时间', value: formatDateTime(openReport.resolution.at) },
                      { label: '处理人', value: openReport.resolution.by },
                      {
                        label: '关联处置',
                        value: openReport.resolution.linked_action_id ? (
                          <span className="admin-id">{openReport.resolution.linked_action_id}</span>
                        ) : (
                          '—'
                        ),
                      },
                    ]}
                  />
                ) : (
                  <p className={s.emptyHint}>暂无处理结果</p>
                )}
                {openReport.withdrawn ? <p className={s.withdrawnHint}>该举报单已由举报人撤回</p> : null}
              </section>
            )}
          </div>
        ) : null}
      </Drawer>

      {/* ---------- 申诉详情抽屉 ---------- */}
      <Drawer
        open={openAppeal !== null}
        title={openAppeal ? `申诉单 ${openAppeal.appeal_id}` : '申诉单'}
        subtitle={openAppeal ? `${APPEAL_STATUS_LABEL[openAppeal.status]} · 提交于 ${formatDateTime(openAppeal.created_at)}` : undefined}
        onClose={() => setOpenAppeal(null)}
        width="560px"
        footer={
          appealPending ? (
            <>
              <Button onClick={() => setOpenAppeal(null)}>取消</Button>
              <Button variant="primary" loading={appealSubmitting} onClick={submitAppealReview}>
                提交复核结论
              </Button>
            </>
          ) : undefined
        }
      >
        {openAppeal ? (
          <div className={s.drawerBody}>
            <section className={s.section}>
              <h3 className={s.sectionTitle}>申诉信息</h3>
              <KeyValue
                items={[
                  { label: '申诉人', value: `${openAppeal.appellant.nickname}（@${openAppeal.appellant.handle}）` },
                  { label: '被申诉处置', value: openAppeal.target_label },
                  { label: '申诉理由', value: openAppeal.reason },
                ]}
              />
            </section>

            <section className={s.section}>
              <h3 className={s.sectionTitle}>原处置记录</h3>
              {targetAction ? (
                <KeyValue
                  items={[
                    { label: '处置动作', value: DISPOSAL_ACTION_LABEL[targetAction.action] },
                    { label: '原因类别', value: targetAction.reason_category },
                    { label: '判定依据', value: targetAction.basis },
                    { label: '生效时间', value: formatDateTime(targetAction.effective_at) },
                    {
                      label: '到期时间',
                      value: targetAction.expires_at ? formatDateTime(targetAction.expires_at) : '长期',
                    },
                    {
                      label: '当前状态',
                      value: targetAction.revoked ? <StatusBadge tone="neutral">已撤销</StatusBadge> : '生效中',
                    },
                  ]}
                />
              ) : (
                <p className={s.emptyHint}>未找到原处置记录</p>
              )}
            </section>

            {appealPending ? (
              <section className={s.section}>
                <h3 className={s.sectionTitle}>复核结论</h3>
                <Field label="结论" required>
                  <Segmented
                    value={appealOutcome}
                    onChange={setAppealOutcome}
                    options={[
                      { value: 'upheld', label: '维持原处置', description: '仅记录结论' },
                      {
                        value: 'overturned',
                        label: '撤销原处置',
                        description: '自动恢复内容 / 账号并留痕',
                      },
                    ]}
                  />
                </Field>
                <Field label="复核说明" required>
                  <TextArea
                    value={appealNote}
                    onChange={setAppealNote}
                    rows={3}
                    placeholder="说明复核理由，将写入处置日志"
                  />
                </Field>
              </section>
            ) : openAppeal.review ? (
              <section className={s.section}>
                <h3 className={s.sectionTitle}>复核结果</h3>
                <KeyValue
                  items={[
                    {
                      label: '结论',
                      value: openAppeal.review.outcome === 'upheld' ? '维持原处置' : '撤销原处置',
                    },
                    { label: '说明', value: openAppeal.review.note },
                    { label: '复核时间', value: formatDateTime(openAppeal.review.at) },
                    { label: '复核人', value: openAppeal.review.by },
                  ]}
                />
              </section>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </>
  );
}
