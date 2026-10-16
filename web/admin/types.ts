/**
 * 管理后台领域类型
 *
 * 这些类型即未来 `/v1/admin/*` 接口的 DTO 形状（对齐 PRD §9.1 的
 * Admin / AuditTask / ModerationAction / Report / Appeal / ModerationLog 实体）。
 * 接真实后端时若字段有差异，只改本文件与 `src/mocks/admin.ts` 的实现，
 * 页面组件不动。
 */

/** 风险等级（队列优先级输入，对齐《网络暴力信息治理规定》第十三条的排序因子） */
export type RiskLevel = 'urgent' | 'high' | 'medium' | 'low';

/** 审核任务状态（对齐 PRD 9.1 AuditTask.status） */
export type AuditTaskStatus = 'pending' | 'escalated' | 'passed' | 'rejected';

/** 审核判定结论 */
export type ReviewOutcome = 'pass' | 'reject' | 'escalate';

/** 内容对象类型 */
export type ContentKind = 'post' | 'comment' | 'media';

/** 机器审核结论 */
export type MachineVerdict = 'pass' | 'reject' | 'uncertain';

/** 处置来源（对齐 PRD 8.11.6） */
export type ActionSource = 'machine' | 'report' | 'patrol' | 'regulator';

/** 内容处置动作（PRD 8.11.3） */
export type ContentDisposalAction = 'takedown' | 'throttle' | 'delete' | 'restore';

/** 用户处置等级（PRD 8.11.4，由轻到重） */
export type UserDisposalLevel = 'warning' | 'restrict' | 'mute' | 'ban';

/** 处置记录的动作类型（内容处置 + 用户处置） */
export type DisposalActionType = ContentDisposalAction | UserDisposalLevel;

/** 用户可被限制的功能项 */
export type RestrictedFeature = 'post' | 'comment' | 'dm';

/** 处置对象类型（对齐 PRD 9.1 ModerationAction.object_type） */
export type ModerationObjectType = 'post' | 'comment' | 'media' | 'user' | 'message';

/** 内容对象状态（对齐 PRD 9.2 动态状态机） */
export type ContentObjectStatus =
  | 'published'
  | 'reviewing'
  | 'takedown'
  | 'throttled'
  | 'deleted'
  | 'expired';

/** 账号状态（对齐 PRD 9.2 账号状态机） */
export type UserAccountState = 'normal' | 'warning' | 'restricted' | 'muted' | 'banned';

/** 举报单状态（PRD 8.11.5） */
export type ReportStatus = 'pending' | 'processing' | 'resolved' | 'closed';

/** 举报判定结论 */
export type ReportVerdict = 'violation' | 'no_violation';

/** 申诉单状态（PRD 9.1 Appeal.status） */
export type AppealStatus = 'pending_review' | 'reviewing' | 'upheld' | 'overturned';

/** 申诉复核结论 */
export type AppealOutcome = 'upheld' | 'overturned';

/** 处置日志的动作类型：审核判定 + 处置动作 + 撤销 */
export type LogActionType =
  | 'review_pass'
  | 'review_reject'
  | 'review_escalate'
  | ContentDisposalAction
  | UserDisposalLevel
  | 'revoke';

/** 管理员账号（PRD 9.1 Admin；本期单一超级管理员，无角色字段） */
export interface AdminAccount {
  admin_id: string;
  account: string;
  name: string;
  status: 'active' | 'disabled';
  last_login_at: string | null;
}

/** 审核任务（PRD 9.1 AuditTask） */
export interface AuditTask {
  task_id: string;
  object_type: ContentKind;
  object_id: string;
  /** 内容文本摘要；媒体对象给占位说明 */
  content_preview: string;
  /** 是否为敏感媒体（审核视图默认模糊，悬停临时解除） */
  sensitive: boolean;
  author: UserRef;
  machine: {
    verdict: MachineVerdict;
    /** 命中的特征 / 策略名 */
    hit_features: string[];
    /** 策略或模型版本（PRD 8.11.6 要求记录判定依据） */
    strategy_version: string;
    /** 置信度 0~1 */
    confidence: number;
    source: ActionSource;
  };
  report_count: number;
  risk: RiskLevel;
  status: AuditTaskStatus;
  created_at: string;
  /** 进入队列时间（SLA 计时基准） */
  queue_entered_at: string;
  decision?: {
    outcome: ReviewOutcome;
    reason_category: string;
    basis: string;
    decided_at: string;
    decided_by: string;
  };
}

/** 用户引用（脱敏展示用） */
export interface UserRef {
  user_id: string;
  nickname: string;
  handle: string;
}

/** 内容对象（处置操作台的操作对象） */
export interface ContentObject {
  object_id: string;
  object_type: ContentKind;
  author: UserRef;
  preview: string;
  sensitive: boolean;
  status: ContentObjectStatus;
  created_at: string;
  report_count: number;
  /** 当前生效的处置记录 id（有则展示“处置中”） */
  active_disposal_id: string | null;
}

/** 处置记录（PRD 9.1 ModerationAction） */
export interface ModerationAction {
  action_id: string;
  object_type: ModerationObjectType;
  object_id: string;
  /** 对象展示名（脱敏） */
  object_label: string;
  action: DisposalActionType;
  reason_category: string;
  basis: string;
  source: ActionSource;
  /** 执行者：管理员账号，或 system（机器处置） */
  executor: string;
  effective_at: string;
  /** 到期时间；undefined = 长期 / 永久 */
  expires_at: string | null;
  revoked: boolean;
  created_at: string;
  /** 批量处置时同一批共享 */
  batch_id: string | null;
}

/** 用户账号（处置操作台的操作对象） */
export interface UserAccount {
  user_id: string;
  nickname: string;
  handle: string;
  /** 脱敏手机号 */
  phone_masked: string;
  account_state: UserAccountState;
  /** 当前生效的用户处置 */
  active_disposal: {
    level: UserDisposalLevel;
    reason_category: string;
    expires_at: string | null;
  } | null;
  registered_at: string;
  post_count: number;
  /** 累计被举报次数 */
  report_received: number;
}

/** 举报单（PRD 9.1 Report） */
export interface Report {
  report_id: string;
  reporter: UserRef;
  target: {
    type: ContentKind | 'user';
    id: string;
    label: string;
  };
  category: string;
  description: string;
  evidence_count: number;
  status: ReportStatus;
  risk: RiskLevel;
  created_at: string;
  resolution?: {
    verdict: ReportVerdict;
    note: string;
    at: string;
    by: string;
    /** 认定违规时关联落地的处置记录 */
    linked_action_id: string | null;
  };
  /** 举报人撤回（撤回后结案，已生效处置不撤销） */
  withdrawn: boolean;
}

/** 申诉单（PRD 9.1 Appeal） */
export interface Appeal {
  appeal_id: string;
  appellant: UserRef;
  /** 被申诉的处置记录 */
  target_action_id: string;
  target_label: string;
  reason: string;
  status: AppealStatus;
  created_at: string;
  review?: {
    outcome: AppealOutcome;
    note: string;
    at: string;
    by: string;
  };
}

/** 处置日志（PRD 9.1 ModerationLog） */
export interface ModerationLogEntry {
  log_id: string;
  action_type: LogActionType;
  object_type: ModerationObjectType;
  object_id: string;
  object_label: string;
  reason_category: string;
  basis: string;
  source: ActionSource;
  executor: string;
  occurred_at: string;
  /** 对应动作是否已被撤销 */
  revoked: boolean;
  /** 关联的处置记录 id */
  action_id: string | null;
  /** 撤销记录指向原记录 */
  related_log_id: string | null;
}

/** 仪表盘统计（工作台首页） */
export interface DashboardStats {
  pending_review: number;
  escalated: number;
  today_actions: number;
  pending_reports: number;
  pending_appeals: number;
  /** SLA 超时预警（阈值见 src/mocks/admin.ts 的 SLA 常量） */
  sla_breached: SlaBreach[];
  recent: ModerationLogEntry[];
}

export interface SlaBreach {
  kind: 'review' | 'report' | 'appeal';
  id: string;
  label: string;
  waiting_hours: number;
}

/* ------------------------------------------------------------------ *
 * 请求 / 响应形状（= 未来 REST 接口的 query / body，按项目分页约定
 * 使用 keyset 游标 cursor / limit / next_cursor / has_more）
 * ------------------------------------------------------------------ */

export interface ReviewQueueFilter {
  status?: AuditTaskStatus | 'all';
  kind?: ContentKind | 'all';
  risk?: RiskLevel | 'all';
  keyword?: string;
  /** oldest = 最旧优先（默认）；most_reported = 被举报最多 */
  sort?: 'oldest' | 'most_reported';
  cursor?: string | null;
  limit?: number;
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface ReviewDecisionInput {
  outcome: ReviewOutcome;
  reason_category: string;
  basis: string;
}

export interface ContentObjectFilter {
  keyword?: string;
  type?: ContentKind | 'all';
  status?: ContentObjectStatus | 'all';
}

export interface ContentDisposalInput {
  action: ContentDisposalAction;
  reason_category: string;
  basis: string;
  source: ActionSource;
  /** 生效时间；缺省 = 立即 */
  effective_at?: string | null;
  /** 到期时间；仅限流等限时处置需要，null = 长期 */
  expires_at?: string | null;
}

export interface BatchDisposalResultItem {
  object_id: string;
  ok: boolean;
  /** 失败原因，如 object_missing（对象已被作者删除） */
  error?: 'object_missing' | 'invalid_state';
  action_id?: string;
}

export interface UserAccountFilter {
  keyword?: string;
  state?: UserAccountState | 'all';
}

export interface UserDisposalInput {
  level: UserDisposalLevel;
  /** 功能限制 / 禁言细到的单项；warning / ban 为空 */
  features?: RestrictedFeature[];
  reason_category: string;
  basis: string;
  source: ActionSource;
  /** 限时处置的到期时间；null = 永久（仅 ban / mute 允许永久） */
  expires_at?: string | null;
  /** 是否通知被处置人（PRD 8.11.4 主流程 3） */
  notify: boolean;
}

export interface ReportFilter {
  status?: ReportStatus | 'all';
  keyword?: string;
}

export interface ReportResolutionInput {
  verdict: ReportVerdict;
  note: string;
}

export interface AppealFilter {
  status?: AppealStatus | 'all';
  keyword?: string;
}

export interface AppealReviewInput {
  outcome: AppealOutcome;
  note: string;
}

export interface ModerationLogFilter {
  from?: string | null;
  to?: string | null;
  executor?: string | 'all';
  action_type?: LogActionType | 'all';
  keyword?: string;
}

export interface SignInResult {
  ok: boolean;
  admin?: AdminAccount;
  /** 失败原因；locked 表示触发限制登录（AC-3） */
  error?: 'bad_credentials' | 'user_side_account' | 'disabled' | 'locked';
  /** locked 时的解禁时间（ISO） */
  locked_until?: string;
  /** 剩余错误次数（达上限即锁定） */
  attempts_left?: number;
}
