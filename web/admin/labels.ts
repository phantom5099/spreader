/**
 * 领域枚举 → 中文标签映射（纯展示辅助）
 *
 * 只依赖 types.ts 的枚举，不碰数据；接真实后端时无需改动。
 */

import type {
  ActionSource,
  AppealStatus,
  AuditTaskStatus,
  ContentDisposalAction,
  ContentKind,
  ContentObjectStatus,
  LogActionType,
  MachineVerdict,
  ModerationObjectType,
  ReportStatus,
  RestrictedFeature,
  ReviewOutcome,
  RiskLevel,
  UserAccountState,
  UserDisposalLevel,
} from '@admin/types';

export const RISK_LABEL: Record<RiskLevel, string> = {
  urgent: '特急',
  high: '高',
  medium: '中',
  low: '低',
};

export const AUDIT_STATUS_LABEL: Record<AuditTaskStatus, string> = {
  pending: '待审核',
  escalated: '已升级',
  passed: '已通过',
  rejected: '未通过',
};

export const REVIEW_OUTCOME_LABEL: Record<ReviewOutcome, string> = {
  pass: '通过',
  reject: '不通过',
  escalate: '升级处理',
};

export const CONTENT_KIND_LABEL: Record<ContentKind, string> = {
  post: '动态',
  comment: '评论',
  media: '媒体',
};

export const CONTENT_STATUS_LABEL: Record<ContentObjectStatus, string> = {
  published: '已发布',
  reviewing: '审核中',
  takedown: '已下架',
  throttled: '已限流',
  deleted: '已删除',
  expired: '已到期',
};

export const DISPOSAL_ACTION_LABEL: Record<ContentDisposalAction | UserDisposalLevel, string> = {
  takedown: '下架',
  throttle: '限流',
  delete: '删除',
  restore: '恢复',
  warning: '警告',
  restrict: '功能限制',
  mute: '禁言',
  ban: '封禁',
};

export const LOG_ACTION_LABEL: Record<LogActionType, string> = {
  review_pass: '审核通过',
  review_reject: '审核不通过',
  review_escalate: '审核升级',
  takedown: '下架',
  throttle: '限流',
  delete: '删除',
  restore: '恢复',
  warning: '警告',
  restrict: '功能限制',
  mute: '禁言',
  ban: '封禁',
  revoke: '撤销处置',
};

export const USER_STATE_LABEL: Record<UserAccountState, string> = {
  normal: '正常',
  warning: '警告',
  restricted: '功能限制中',
  muted: '禁言中',
  banned: '已封禁',
};

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  pending: '待处理',
  processing: '处理中',
  resolved: '已结案',
  closed: '已关闭',
};

export const APPEAL_STATUS_LABEL: Record<AppealStatus, string> = {
  pending_review: '待复核',
  reviewing: '复核中',
  upheld: '维持原处置',
  overturned: '已撤销处置',
};

export const ACTION_SOURCE_LABEL: Record<ActionSource, string> = {
  machine: '机器审核',
  report: '用户举报',
  patrol: '主动巡查',
  regulator: '监管通报',
};

export const MACHINE_VERDICT_LABEL: Record<MachineVerdict, string> = {
  pass: '通过',
  reject: '不通过',
  uncertain: '不确定',
};

export const FEATURE_LABEL: Record<RestrictedFeature, string> = {
  post: '发布',
  comment: '评论',
  dm: '私信',
};

export const OBJECT_TYPE_LABEL: Record<ModerationObjectType, string> = {
  post: '动态',
  comment: '评论',
  media: '媒体',
  user: '用户',
  message: '私信',
};

/** 处置原因类别选项（与举报分类对齐，PRD 8.11.3） */
export const REASON_CATEGORIES = [
  '色情低俗',
  '暴力血腥',
  '违法犯罪',
  '虚假信息',
  '网络暴力',
  '侵权抄袭',
  '垃圾广告',
  '骚扰',
  '未成年人相关',
  '其他',
] as const;

/** 用户处置等级选项（由轻到重，PRD 8.11.4） */
export const USER_DISPOSAL_LEVELS: UserDisposalLevel[] = ['warning', 'restrict', 'mute', 'ban'];

/** 内容处置动作选项（PRD 8.11.3） */
export const CONTENT_DISPOSAL_ACTIONS: ContentDisposalAction[] = [
  'takedown',
  'throttle',
  'delete',
  'restore',
];

/** 严重程度排序：数字越大越严（账号状态“取最严”用，PRD 8.11.4 AC-5） */
const LEVEL_RANK: Record<UserDisposalLevel, number> = {
  warning: 1,
  restrict: 2,
  mute: 3,
  ban: 4,
};

export function stricterLevel(
  a: UserDisposalLevel | null,
  b: UserDisposalLevel | null,
): UserDisposalLevel | null {
  if (!a) return b;
  if (!b) return a;
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

/* ------------------------------------------------------------------ *
 * 时间格式化
 * ------------------------------------------------------------------ */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** '2026-10-16 18:42' */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** '10-16 18:42'（表格列宽紧张时用） */
export function formatShortDateTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** '3 小时前' / '2 天前' / '刚刚' */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const diff = now - Date.parse(iso);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const day = Math.floor(h / 24);
  if (day < 30) return `${day} 天前`;
  return formatShortDateTime(iso);
}

/** '已等待 26 小时' / '已等待 3 天 2 小时' */
export function formatWaiting(iso: string, now: number = Date.now()): string {
  const h = Math.max(0, Math.floor((now - Date.parse(iso)) / 3600_000));
  if (h < 24) return `已等待 ${h} 小时`;
  const day = Math.floor(h / 24);
  return `已等待 ${day} 天 ${h % 24} 小时`;
}

/** datetime-local 输入框value（本地时间，秒截断） */
export function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local value → ISO（空串返回 null） */
export function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
