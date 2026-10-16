import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, EyeOff } from 'lucide-react';
import type { AuditTask, ReviewDecisionInput, ReviewOutcome } from '@admin/types';
import { fetchReports, fetchReviewTask, submitReviewDecision } from '@admin/mocks/adminApi';
import {
  ACTION_SOURCE_LABEL,
  AUDIT_STATUS_LABEL,
  CONTENT_KIND_LABEL,
  MACHINE_VERDICT_LABEL,
  REASON_CATEGORIES,
  REVIEW_OUTCOME_LABEL,
  RISK_LABEL,
  formatDateTime,
  formatRelative,
  formatWaiting,
} from '@admin/labels';
import { PageHeader } from '@admin/components/PageHeader';
import { Panel } from '@admin/components/Panel';
import { KeyValue } from '@admin/components/KeyValue';
import { Button } from '@admin/components/Button';
import { Field, Segmented, Select, TextArea } from '@admin/components/FormControls';
import { StatusBadge, type BadgeTone } from '@admin/components/StatusBadge';
import { RouteFallback } from '@admin/components/RouteFallback';
import { toast } from '@admin/stores/toastStore';
import s from './ReviewDetailPage.module.css';

const RISK_TONE: Record<AuditTask['risk'], BadgeTone> = {
  urgent: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'neutral',
};

/**
 * PG-25 审核详情（独立 URL，便于在队列 / 举报 / 申诉间跳转与刷新保留）
 *
 * - 敏感媒体默认模糊，悬停临时解除（避免审核员误触不适内容）
 * - 机器结论含命中特征 / 策略版本 / 置信度（判定依据可追溯）
 * - 判定表单：结论 + 原因类别 + 判定依据（必填）
 * - 判定与处置分离：不通过只记结论，下架 / 删除引导至处置操作台
 */
export function ReviewDetailPage() {
  const { taskId = '' } = useParams();
  const navigate = useNavigate();

  const [task, setTask] = useState<AuditTask | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [relatedReports, setRelatedReports] = useState(0);

  const [outcome, setOutcome] = useState<ReviewOutcome>('reject');
  const [reasonCategory, setReasonCategory] = useState('');
  const [basis, setBasis] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchReviewTask(taskId).then(async (data) => {
      if (!alive) return;
      if (!data) {
        setNotFound(true);
        return;
      }
      setTask(data);
      const all = await fetchReports({});
      if (alive) setRelatedReports(all.filter((r) => r.target.id === data.object_id).length);
    });
    return () => {
      alive = false;
    };
  }, [taskId]);

  if (notFound) {
    return (
      <div className={s.notFound}>
        <p>审核任务不存在或已不存在</p>
        <Link className={s.backLink} to="/review">
          返回审核队列
        </Link>
      </div>
    );
  }

  if (!task) return <RouteFallback />;

  const decided = Boolean(task.decision);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reasonCategory || !basis.trim()) {
      setError('请选择原因类别并填写判定依据');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await submitReviewDecision(taskId, {
        outcome,
        reason_category: reasonCategory,
        basis: basis.trim(),
      } satisfies ReviewDecisionInput);
      toast(`已判定：${REVIEW_OUTCOME_LABEL[outcome]}`);
      navigate('/review');
    } catch {
      setError('提交失败，请重试');
      setSubmitting(false);
    }
  };

  return (
    <>
      <Link className={s.backLink} to="/review">
        <ArrowLeft size={13} /> 返回审核队列
      </Link>

      <PageHeader
        title={`审核任务 ${task.task_id}`}
        description={`${CONTENT_KIND_LABEL[task.object_type]} ${task.object_id}`}
        actions={<StatusBadge tone={RISK_TONE[task.risk]}>{RISK_LABEL[task.risk]}风险</StatusBadge>}
      />

      <div className={s.layout}>
        <div className={s.mainCol}>
          <Panel title="内容预览">
            <div className={task.sensitive ? 'admin-sensitive' : s.previewBox}>
              <p className={s.previewText}>{task.content_preview}</p>
              {task.sensitive ? (
                <span className="admin-sensitive-mask">
                  <EyeOff size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                  敏感内容 · 悬停临时查看
                </span>
              ) : null}
            </div>
            <div className={s.previewMeta}>
              <span className="admin-id">对象：{task.object_id}</span>
              <span className="admin-id">发布：{formatRelative(task.created_at)}</span>
              <span className="admin-id">入队：{formatWaiting(task.queue_entered_at)}</span>
            </div>
          </Panel>

          <Panel title="机器审核结论">
            <div className={s.machineHead}>
              <StatusBadge
                tone={
                  task.machine.verdict === 'reject'
                    ? 'danger'
                    : task.machine.verdict === 'uncertain'
                      ? 'warning'
                      : 'success'
                }
              >
                {MACHINE_VERDICT_LABEL[task.machine.verdict]}
              </StatusBadge>
              <span className={s.confidence}>置信度 {Math.round(task.machine.confidence * 100)}%</span>
              <span className={s.source}>{ACTION_SOURCE_LABEL[task.machine.source]}</span>
            </div>
            <div className={s.features}>
              {task.machine.hit_features.length > 0 ? (
                task.machine.hit_features.map((f) => (
                  <StatusBadge key={f} tone="warning">
                    {f}
                  </StatusBadge>
                ))
              ) : (
                <span className={s.noFeatures}>未命中特征</span>
              )}
            </div>
            <div className={s.confidenceBar} aria-hidden="true">
              <div
                className={s.confidenceFill}
                style={{ width: `${Math.round(task.machine.confidence * 100)}%` }}
              />
            </div>
            <p className={s.strategy}>策略版本：{task.machine.strategy_version}</p>
          </Panel>

          <Panel title="举报信息">
            {relatedReports > 0 ? (
              <p className={s.reportHint}>
                该内容关联 {relatedReports} 条举报单，举报核实与处置回写请在
                <Link className={s.inlineLink} to="/reports">
                  举报与申诉
                </Link>
                页处理。
              </p>
            ) : (
              <p className={s.reportHint}>暂无关联举报（本条任务来自机器审核或主动巡查）。</p>
            )}
            <p className={s.reportCount}>累计被举报 {task.report_count} 次</p>
          </Panel>
        </div>

        <div className={s.sideCol}>
          <Panel title="作者上下文">
            <KeyValue
              items={[
                { label: '昵称', value: task.author.nickname },
                { label: '账号', value: `@${task.author.handle}` },
                { label: '用户 ID', value: <span className="admin-id">{task.author.user_id}</span> },
              ]}
            />
            <Link className={s.userLink} to={`/users?keyword=${task.author.user_id}`}>
              前往用户处置 →
            </Link>
          </Panel>

          <Panel title="任务信息">
            <KeyValue
              items={[
                { label: '任务 ID', value: <span className="admin-id">{task.task_id}</span> },
                { label: '当前状态', value: AUDIT_STATUS_LABEL[task.status] },
                { label: '风险等级', value: RISK_LABEL[task.risk] },
                { label: '入队时间', value: formatDateTime(task.queue_entered_at) },
              ]}
            />
          </Panel>

          {decided && task.decision ? (
            <Panel title="判定记录">
              <KeyValue
                items={[
                  { label: '结论', value: REVIEW_OUTCOME_LABEL[task.decision.outcome] },
                  { label: '原因类别', value: task.decision.reason_category },
                  { label: '判定依据', value: task.decision.basis },
                  { label: '判定时间', value: formatDateTime(task.decision.decided_at) },
                  { label: '判定人', value: task.decision.decided_by },
                ]}
              />
            </Panel>
          ) : (
            <Panel title="审核判定" description="结论与理由将写入处置日志">
              <form className={s.form} onSubmit={onSubmit}>
                <Field label="判定结论" required>
                  <Segmented
                    value={outcome}
                    onChange={setOutcome}
                    options={(Object.keys(REVIEW_OUTCOME_LABEL) as ReviewOutcome[]).map((v) => ({
                      value: v,
                      label: REVIEW_OUTCOME_LABEL[v],
                      description:
                        v === 'escalate'
                          ? '升级为人工重点复核'
                          : v === 'reject'
                            ? '记录不通过结论'
                            : '放行',
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
                <Field label="判定依据" required>
                  <TextArea
                    value={basis}
                    onChange={setBasis}
                    rows={3}
                    placeholder="说明判定理由，如命中策略、举报核实情况等"
                  />
                </Field>
                {error ? <p className={s.error}>{error}</p> : null}
                <div className={s.formActions}>
                  <Button variant="primary" type="submit" loading={submitting}>
                    提交判定
                  </Button>
                  <Button variant="ghost" onClick={() => navigate('/review')}>
                    取消
                  </Button>
                </div>
                {outcome === 'reject' ? (
                  <p className={s.formHint}>
                    判定不通过仅记录结论；如需下架 / 限流 / 删除该内容，请前往
                    <Link className={s.inlineLink} to="/content">
                      内容处置操作台
                    </Link>
                    。
                  </p>
                ) : null}
              </form>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
