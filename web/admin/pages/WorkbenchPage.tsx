import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import type { DashboardStats, LogActionType } from '@admin/types';
import { fetchDashboardStats } from '@admin/mocks/adminApi';
import {
  ACTION_SOURCE_LABEL,
  LOG_ACTION_LABEL,
  RISK_LABEL,
  formatDateTime,
  formatRelative,
} from '@admin/labels';
import { PageHeader } from '@admin/components/PageHeader';
import { Panel } from '@admin/components/Panel';
import { StatCard } from '@admin/components/StatCard';
import { StatusBadge, type BadgeTone } from '@admin/components/StatusBadge';
import { RouteFallback } from '@admin/components/RouteFallback';
import s from './WorkbenchPage.module.css';

/** 动作类型 → 徽章色调（处置类偏危险、审核类中性、恢复/撤销偏成功） */
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

const SLA_KIND_LABEL = { review: '审核', report: '举报', appeal: '申诉' } as const;

/**
 * 工作台（仪表盘首页）
 *
 * 设计参照（调研报告 §2.8 / §3.10）：
 * - 指标卡 + 待办驱动：Meta Admin Home 的“待办驱动”与开源审核系统
 *   Coop Overview 的指标集（积压 / 今日处置 / 超时）
 * - SLA 超时预警：机器审 + 人工复核分工下的时效水位（PRD 13.1）
 */
export function WorkbenchPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchDashboardStats().then((data) => {
      if (alive) setStats(data);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!stats) return <RouteFallback />;

  return (
    <>
      <PageHeader title="工作台" description="今日审核与处置概览 · 数据为演示 Mock" />

      <div className={s.statGrid}>
        <StatCard
          label="待审核"
          value={stats.pending_review}
          tone="accent"
          to="/review"
          hint="进入审核队列"
        />
        <StatCard
          label="已升级"
          value={stats.escalated}
          tone="warning"
          to="/review"
          hint="转人工 / 高风险"
        />
        <StatCard label="今日处置" value={stats.today_actions} to="/logs" hint="查看处置日志" />
        <StatCard
          label="待处理举报"
          value={stats.pending_reports}
          tone="warning"
          to="/reports"
          hint="含处理中"
        />
        <StatCard
          label="待复核申诉"
          value={stats.pending_appeals}
          tone="warning"
          to="/reports"
          hint="申诉待出结论"
        />
      </div>

      <Panel
        title="SLA 超时预警"
        description="超过处理时限的积压任务（审核 24h / 举报 48h / 申诉 72h，演示阈值）"
        actions={
          <Link className={s.panelLink} to="/review">
            去处理
          </Link>
        }
      >
        {stats.sla_breached.length === 0 ? (
          <div className={s.empty}>
            <Inbox size={18} aria-hidden="true" />
            <span>当前没有超时任务</span>
          </div>
        ) : (
          <ul className={s.slaList}>
            {stats.sla_breached.map((b) => (
              <li key={`${b.kind}-${b.id}`} className={s.slaItem}>
                <StatusBadge tone="danger">{SLA_KIND_LABEL[b.kind]}</StatusBadge>
                <span className={s.slaLabel}>{b.label}</span>
                <span className={s.slaWait}>已等待 {b.waiting_hours} 小时</span>
                <Link
                  className={s.slaLink}
                  to={b.kind === 'review' ? `/review/${b.id}` : '/reports'}
                >
                  处理
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        className={s.recentPanel}
        title="最近处置记录"
        description="最新 8 条，完整记录与导出请前往处置日志"
        actions={
          <Link className={s.panelLink} to="/logs">
            全部日志
          </Link>
        }
      >
        <ul className={s.recentList}>
          {stats.recent.map((l) => (
            <li key={l.log_id} className={s.recentItem}>
              <span className={s.recentTime}>{formatRelative(l.occurred_at)}</span>
              <StatusBadge tone={actionTone(l.action_type)}>{LOG_ACTION_LABEL[l.action_type]}</StatusBadge>
              <span className={s.recentLabel} title={l.object_label}>
                {l.object_label}
              </span>
              <span className={s.recentMeta}>
                {l.reason_category} · {ACTION_SOURCE_LABEL[l.source]} · {formatDateTime(l.occurred_at)}
              </span>
              {l.revoked ? <StatusBadge tone="neutral">已撤销</StatusBadge> : null}
            </li>
          ))}
        </ul>
      </Panel>

      <p className={s.footNote}>
        风险分级参照《网络暴力信息治理规定》第十三条排序因素（{RISK_LABEL.urgent}级优先）。
      </p>
    </>
  );
}
