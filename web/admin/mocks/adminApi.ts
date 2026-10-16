/**
 * 管理后台数据契约层（当前为 mock 实现）
 *
 * ── 为什么有这一层 ────────────────────────────────────────────────
 * 管理后台所有页面只允许从本文件取数，禁止直接读取数据集。
 * 后续接真实后端时，只替换本文件内部的函数实现（换成 fetch 调
 * `/v1/admin/*`），函数签名与返回形状不变，页面组件零改动。
 *
 * 每个函数上方标注了对应的未来 REST 端点。替换示例：
 *
 *   export async function fetchReviewQueue(filter: ReviewQueueFilter) {
 *     const qs = new URLSearchParams({ status: filter.status ?? 'all', ... });
 *     const res = await fetch(`${apiBaseUrl}/audit-tasks?${qs}`, {
 *       headers: authHeaders(),   // Authorization: Bearer <admin token>
 *     });
 *     if (!res.ok) throw new ApiError(res.status);
 *     return (await res.json()) as Page<AuditTask>;
 *   }
 *
 * `configureAdminApi()` 是预留的注入点（baseUrl / token 提供者）。
 * 真实环境下管理端令牌由登录接口下发，与用户端令牌体系隔离
 * （PRD 8.11.1：管理端独立入口、独立令牌、独立账号体系）。
 */

import type {
  AdminAccount,
  Appeal,
  AppealFilter,
  AppealReviewInput,
  AuditTask,
  BatchDisposalResultItem,
  ContentDisposalAction,
  ContentDisposalInput,
  ContentKind,
  ContentObject,
  ContentObjectFilter,
  ContentObjectStatus,
  DashboardStats,
  DisposalActionType,
  LogActionType,
  ModerationAction,
  ModerationLogEntry,
  ModerationLogFilter,
  ModerationObjectType,
  Page,
  Report,
  ReportFilter,
  ReportResolutionInput,
  ReviewDecisionInput,
  ReviewQueueFilter,
  SignInResult,
  SlaBreach,
  UserAccount,
  UserAccountFilter,
  UserDisposalInput,
  UserDisposalLevel,
} from '@admin/types';
import {
  ACTION_SOURCE_LABEL,
  CONTENT_KIND_LABEL,
  DISPOSAL_ACTION_LABEL,
  LOG_ACTION_LABEL,
  OBJECT_TYPE_LABEL,
  stricterLevel,
} from '@admin/labels';

/* ------------------------------------------------------------------ *
 * 预留注入点（接真实后端时使用）
 * ------------------------------------------------------------------ */

let apiBaseUrl = '/v1/admin';
let tokenProvider: (() => string | null) | null = null;

export function configureAdminApi(opts: {
  baseUrl?: string;
  getToken?: () => string | null;
}): void {
  if (opts.baseUrl) apiBaseUrl = opts.baseUrl;
  tokenProvider = opts.getToken ?? null;
}

/** 未来真实请求附带头（mock 模式下不会被调用，保留供替换实现使用） */
export function authHeaders(): Record<string, string> {
  const token = tokenProvider?.() ?? null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** 当前 API 基地址（默认 /v1/admin，可由 configureAdminApi 覆盖） */
export function adminApiBaseUrl(): string {
  return apiBaseUrl;
}

/** 模拟网络延迟，让加载态 / 骨架屏可见（与客户端 mocks 一致） */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ *
 * 常量：SLA 阈值 / 演示账号
 * ------------------------------------------------------------------ */

/**
 * SLA 阈值（小时）——演示值，取自行业实践（高危 24h / 中危 72h 的通行分档）；
 * 真实阈值需按 PRD 13.1 反馈时限要求与 Q-12 一并确认。
 */
const SLA_HOURS = { review: 24, report: 48, appeal: 72 } as const;

/** Demo 管理员账号（真实环境由服务端种子数据管理） */
const MOCK_ADMIN = {
  admin_id: 'adm_1',
  account: 'admin',
  password: 'spreader2026',
  name: '超级管理员',
};

/** 管理端会话在浏览器的存储 key（与用户端 authStore 的 key 不同，账号体系隔离） */
export const ADMIN_SESSION_KEY = 'spreader.admin.session.v1';

/** 用户端账号（演示“账号体系隔离”：这些账号不能登录管理后台，PRD 8.11.1 AC-2） */
const USER_SIDE_ACCOUNTS = ['zhixia', 'linwan', '13800000000', 'zhixia@spreader'];

/** 连续密码错误上限（PRD 8.11.1 AC-3；次数与时长见 Q-12，此处为演示值） */
const MAX_PASSWORD_ATTEMPTS = 5;
const LOCK_MINUTES = 5;

/* ------------------------------------------------------------------ *
 * 数据集（mock 私有；页面不可直接 import）
 * ------------------------------------------------------------------ */

function isoHoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

let idSeq = 9000;
function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}_${idSeq}`;
}

const U = {
  zhixia: { user_id: 'u_1001', nickname: '林知夏', handle: 'zhixia' },
  linwan: { user_id: 'u_1003', nickname: '林晚', handle: 'linwan' },
  chenmo: { user_id: 'u_1004', nickname: '陈默', handle: 'chenmo' },
  zhouhang: { user_id: 'u_1005', nickname: '周航', handle: 'zhouhang' },
  suqing: { user_id: 'u_1006', nickname: '苏晴', handle: 'suqing' },
  zhaoyiming: { user_id: 'u_1007', nickname: '赵一鸣', handle: 'zhaoyiming' },
  zhengbei: { user_id: 'u_1008', nickname: '郑北', handle: 'zhengbei' },
  wutong: { user_id: 'u_1009', nickname: '吴桐', handle: 'wutong' },
  fengxiaoman: { user_id: 'u_1010', nickname: '冯小满', handle: 'fengxiaoman' },
  sunxiaorui: { user_id: 'u_1011', nickname: '孙小芮', handle: 'sunxiaorui' },
  qianduobao: { user_id: 'u_1012', nickname: '钱多宝', handle: 'qianduobao' },
  chunan: { user_id: 'u_1013', nickname: '楚南', handle: 'chunan' },
} as const;

const auditTasks: AuditTask[] = [
  {
    task_id: 't_1001',
    object_type: 'post',
    object_id: 'p_2001',
    content_preview: '“内部渠道低价出票，加 V 详聊” + 联系方式图片',
    sensitive: false,
    author: U.zhouhang,
    machine: {
      verdict: 'reject',
      hit_features: ['垃圾广告', '导流联系方式'],
      strategy_version: 'text-feature-lib v3.2',
      confidence: 0.94,
      source: 'machine',
    },
    report_count: 3,
    risk: 'high',
    status: 'pending',
    created_at: isoHoursAgo(26),
    queue_entered_at: isoHoursAgo(26),
  },
  {
    task_id: 't_1002',
    object_type: 'comment',
    object_id: 'c_2001',
    content_preview: '“楼上说得对，这种人就是欠收拾”',
    sensitive: false,
    author: U.zhaoyiming,
    machine: {
      verdict: 'uncertain',
      hit_features: ['网络暴力'],
      strategy_version: 'text-feature-lib v3.2',
      confidence: 0.62,
      source: 'machine',
    },
    report_count: 1,
    risk: 'medium',
    status: 'pending',
    created_at: isoHoursAgo(9),
    queue_entered_at: isoHoursAgo(9),
  },
  {
    task_id: 't_1003',
    object_type: 'media',
    object_id: 'm_2001',
    content_preview: '视频封面：冲突场景（时长 00:47，含尖叫声）',
    sensitive: true,
    author: U.sunxiaorui,
    machine: {
      verdict: 'reject',
      hit_features: ['暴力血腥'],
      strategy_version: 'video-recognition v2.8',
      confidence: 0.97,
      source: 'machine',
    },
    report_count: 5,
    risk: 'urgent',
    status: 'pending',
    created_at: isoHoursAgo(3),
    queue_entered_at: isoHoursAgo(3),
  },
  {
    task_id: 't_1004',
    object_type: 'post',
    object_id: 'p_2002',
    content_preview: '“点击链接领取限量皮肤” + 短链',
    sensitive: false,
    author: U.zhouhang,
    machine: {
      verdict: 'reject',
      hit_features: ['垃圾广告', '风险短链'],
      strategy_version: 'text-feature-lib v3.2',
      confidence: 0.88,
      source: 'machine',
    },
    report_count: 0,
    risk: 'low',
    status: 'pending',
    created_at: isoHoursAgo(30),
    queue_entered_at: isoHoursAgo(30),
  },
  {
    task_id: 't_1005',
    object_type: 'post',
    object_id: 'p_2003',
    content_preview: '“某品牌饮料被检出有害物质”（未标注消息来源）',
    sensitive: false,
    author: U.wutong,
    machine: {
      verdict: 'uncertain',
      hit_features: ['虚假信息'],
      strategy_version: 'text-feature-lib v3.2',
      confidence: 0.71,
      source: 'machine',
    },
    report_count: 2,
    risk: 'high',
    status: 'pending',
    created_at: isoHoursAgo(5),
    queue_entered_at: isoHoursAgo(5),
  },
  {
    task_id: 't_1006',
    object_type: 'comment',
    object_id: 'c_2002',
    content_preview: '搬运自知乎回答的长段落，未注明出处',
    sensitive: false,
    author: U.chenmo,
    machine: {
      verdict: 'reject',
      hit_features: ['侵权抄袭'],
      strategy_version: 'perceptual-hash v1.4',
      confidence: 0.83,
      source: 'machine',
    },
    report_count: 1,
    risk: 'medium',
    status: 'escalated',
    created_at: isoHoursAgo(20),
    queue_entered_at: isoHoursAgo(20),
    decision: {
      outcome: 'escalate',
      reason_category: '侵权抄袭',
      basis: '疑似洗稿，需比对原文后判定',
      decided_at: isoHoursAgo(19),
      decided_by: 'admin',
    },
  },
  {
    task_id: 't_1007',
    object_type: 'post',
    object_id: 'p_2004',
    content_preview: '“高价回收银行卡、电话卡”（配图：成沓卡片）',
    sensitive: true,
    author: U.qianduobao,
    machine: {
      verdict: 'reject',
      hit_features: ['违法犯罪'],
      strategy_version: 'image-recognition v2.8',
      confidence: 0.96,
      source: 'machine',
    },
    report_count: 4,
    risk: 'urgent',
    status: 'escalated',
    created_at: isoHoursAgo(28),
    queue_entered_at: isoHoursAgo(28),
    decision: {
      outcome: 'escalate',
      reason_category: '违法犯罪',
      basis: '涉嫌帮助信息网络犯罪活动，需固定证据后处置并上报',
      decided_at: isoHoursAgo(27),
      decided_by: 'admin',
    },
  },
  {
    task_id: 't_1008',
    object_type: 'post',
    object_id: 'p_2005',
    content_preview: '周末 citywalk 路线分享（9 图）',
    sensitive: false,
    author: U.zhixia,
    machine: {
      verdict: 'pass',
      hit_features: [],
      strategy_version: 'text-feature-lib v3.2',
      confidence: 0.99,
      source: 'machine',
    },
    report_count: 0,
    risk: 'low',
    status: 'passed',
    created_at: isoHoursAgo(40),
    queue_entered_at: isoHoursAgo(40),
    decision: {
      outcome: 'pass',
      reason_category: '其他',
      basis: '机器判定通过，人工抽检无异常',
      decided_at: isoHoursAgo(39),
      decided_by: 'admin',
    },
  },
  {
    task_id: 't_1009',
    object_type: 'comment',
    object_id: 'c_2003',
    content_preview: '“这家店真的好吃，人均 40”',
    sensitive: false,
    author: U.suqing,
    machine: {
      verdict: 'pass',
      hit_features: [],
      strategy_version: 'text-feature-lib v3.2',
      confidence: 0.98,
      source: 'machine',
    },
    report_count: 0,
    risk: 'low',
    status: 'passed',
    created_at: isoHoursAgo(33),
    queue_entered_at: isoHoursAgo(33),
    decision: {
      outcome: 'pass',
      reason_category: '其他',
      basis: '无命中特征，直接放行',
      decided_at: isoHoursAgo(33),
      decided_by: 'system',
    },
  },
  {
    task_id: 't_1010',
    object_type: 'post',
    object_id: 'p_2006',
    content_preview: '“减肥神药，一周瘦十斤” + 联系方式',
    sensitive: false,
    author: U.qianduobao,
    machine: {
      verdict: 'reject',
      hit_features: ['垃圾广告', '虚假信息'],
      strategy_version: 'text-feature-lib v3.2',
      confidence: 0.91,
      source: 'report',
    },
    report_count: 6,
    risk: 'high',
    status: 'rejected',
    created_at: isoHoursAgo(50),
    queue_entered_at: isoHoursAgo(50),
    decision: {
      outcome: 'reject',
      reason_category: '虚假信息',
      basis: '无资质证明的减肥功效宣传，判定不通过',
      decided_at: isoHoursAgo(49),
      decided_by: 'admin',
    },
  },
  {
    task_id: 't_1011',
    object_type: 'media',
    object_id: 'm_2002',
    content_preview: '图片：与他人已发布作品高度相似（感知哈希距离 3）',
    sensitive: false,
    author: U.suqing,
    machine: {
      verdict: 'uncertain',
      hit_features: ['近似重复'],
      strategy_version: 'perceptual-hash v1.4',
      confidence: 0.66,
      source: 'machine',
    },
    report_count: 0,
    risk: 'medium',
    status: 'pending',
    created_at: isoHoursAgo(14),
    queue_entered_at: isoHoursAgo(14),
  },
  {
    task_id: 't_1012',
    object_type: 'post',
    object_id: 'p_2007',
    content_preview: '“开源项目 spreader 更新了 0.2 版本”',
    sensitive: false,
    author: U.zhengbei,
    machine: {
      verdict: 'pass',
      hit_features: [],
      strategy_version: 'text-feature-lib v3.2',
      confidence: 0.99,
      source: 'machine',
    },
    report_count: 0,
    risk: 'low',
    status: 'pending',
    created_at: isoHoursAgo(2),
    queue_entered_at: isoHoursAgo(2),
  },
  {
    task_id: 't_1013',
    object_type: 'comment',
    object_id: 'c_2004',
    content_preview: '“小朋友作业写太慢了，建议家长看看脑子”',
    sensitive: false,
    author: U.fengxiaoman,
    machine: {
      verdict: 'uncertain',
      hit_features: ['网络暴力', '未成年人相关'],
      strategy_version: 'text-feature-lib v3.2',
      confidence: 0.58,
      source: 'report',
    },
    report_count: 2,
    risk: 'high',
    status: 'pending',
    created_at: isoHoursAgo(1),
    queue_entered_at: isoHoursAgo(1),
  },
  {
    task_id: 't_1014',
    object_type: 'post',
    object_id: 'p_2008',
    content_preview: '“某地明天地震，速转家人”（无官方来源）',
    sensitive: false,
    author: U.chunan,
    machine: {
      verdict: 'reject',
      hit_features: ['虚假信息'],
      strategy_version: 'text-feature-lib v3.2',
      confidence: 0.79,
      source: 'machine',
    },
    report_count: 1,
    risk: 'medium',
    status: 'pending',
    created_at: isoHoursAgo(7),
    queue_entered_at: isoHoursAgo(7),
  },
];

const contentObjects: ContentObject[] = [
  {
    object_id: 'p_2001',
    object_type: 'post',
    author: U.zhouhang,
    preview: '“内部渠道低价出票，加 V 详聊” + 联系方式图片',
    sensitive: false,
    status: 'published',
    created_at: isoHoursAgo(27),
    report_count: 3,
    active_disposal_id: null,
  },
  {
    object_id: 'p_2002',
    object_type: 'post',
    author: U.zhouhang,
    preview: '“点击链接领取限量皮肤” + 短链',
    sensitive: false,
    status: 'published',
    created_at: isoHoursAgo(31),
    report_count: 0,
    active_disposal_id: null,
  },
  {
    object_id: 'p_2003',
    object_type: 'post',
    author: U.wutong,
    preview: '“某品牌饮料被检出有害物质”（未标注消息来源）',
    sensitive: false,
    status: 'takedown',
    created_at: isoHoursAgo(6),
    report_count: 2,
    active_disposal_id: 'act_5001',
  },
  {
    object_id: 'p_2004',
    object_type: 'post',
    author: U.qianduobao,
    preview: '“高价回收银行卡、电话卡”（配图：成沓卡片）',
    sensitive: true,
    status: 'takedown',
    created_at: isoHoursAgo(29),
    report_count: 4,
    active_disposal_id: 'act_5002',
  },
  {
    object_id: 'p_2005',
    object_type: 'post',
    author: U.zhixia,
    preview: '周末 citywalk 路线分享（9 图）',
    sensitive: false,
    status: 'published',
    created_at: isoHoursAgo(41),
    report_count: 0,
    active_disposal_id: null,
  },
  {
    object_id: 'p_2006',
    object_type: 'post',
    author: U.qianduobao,
    preview: '“减肥神药，一周瘦十斤” + 联系方式',
    sensitive: false,
    status: 'takedown',
    created_at: isoHoursAgo(51),
    report_count: 6,
    active_disposal_id: 'act_5003',
  },
  {
    object_id: 'p_2007',
    object_type: 'post',
    author: U.zhengbei,
    preview: '“开源项目 spreader 更新了 0.2 版本”',
    sensitive: false,
    status: 'published',
    created_at: isoHoursAgo(2),
    report_count: 0,
    active_disposal_id: null,
  },
  {
    object_id: 'p_2008',
    object_type: 'post',
    author: U.chunan,
    preview: '“某地明天地震，速转家人”（无官方来源）',
    sensitive: false,
    status: 'published',
    created_at: isoHoursAgo(8),
    report_count: 1,
    active_disposal_id: null,
  },
  {
    object_id: 'c_2001',
    object_type: 'comment',
    author: U.zhaoyiming,
    preview: '“楼上说得对，这种人就是欠收拾”',
    sensitive: false,
    status: 'published',
    created_at: isoHoursAgo(9),
    report_count: 1,
    active_disposal_id: null,
  },
  {
    object_id: 'c_2002',
    object_type: 'comment',
    author: U.chenmo,
    preview: '搬运自知乎回答的长段落，未注明出处',
    sensitive: false,
    status: 'takedown',
    created_at: isoHoursAgo(21),
    report_count: 1,
    active_disposal_id: 'act_5006',
  },
  {
    object_id: 'c_2003',
    object_type: 'comment',
    author: U.suqing,
    preview: '“这家店真的好吃，人均 40”',
    sensitive: false,
    status: 'published',
    created_at: isoHoursAgo(34),
    report_count: 0,
    active_disposal_id: null,
  },
  {
    object_id: 'c_2004',
    object_type: 'comment',
    author: U.fengxiaoman,
    preview: '“小朋友作业写太慢了，建议家长看看脑子”',
    sensitive: false,
    status: 'published',
    created_at: isoHoursAgo(1),
    report_count: 2,
    active_disposal_id: null,
  },
  {
    object_id: 'm_2001',
    object_type: 'media',
    author: U.sunxiaorui,
    preview: '视频：冲突场景（时长 00:47，含尖叫声）',
    sensitive: true,
    status: 'reviewing',
    created_at: isoHoursAgo(3),
    report_count: 5,
    active_disposal_id: null,
  },
  {
    object_id: 'm_2002',
    object_type: 'media',
    author: U.suqing,
    preview: '图片：与他人已发布作品高度相似',
    sensitive: false,
    status: 'published',
    created_at: isoHoursAgo(15),
    report_count: 0,
    active_disposal_id: null,
  },
  {
    object_id: 'm_2003',
    object_type: 'media',
    author: U.zhixia,
    preview: '图片：日落时的江边（作者已删除）',
    sensitive: false,
    status: 'deleted',
    created_at: isoHoursAgo(60),
    report_count: 0,
    active_disposal_id: null,
  },
];

const userAccounts: UserAccount[] = [
  {
    user_id: 'u_1003',
    nickname: '林晚',
    handle: 'linwan',
    phone_masked: '138****2210',
    account_state: 'normal',
    active_disposal: null,
    registered_at: isoHoursAgo(24 * 210),
    post_count: 128,
    report_received: 0,
  },
  {
    user_id: 'u_1004',
    nickname: '陈默',
    handle: 'chenmo',
    phone_masked: '137****8891',
    account_state: 'restricted',
    active_disposal: null,
    registered_at: isoHoursAgo(24 * 400),
    post_count: 56,
    report_received: 2,
  },
  {
    user_id: 'u_1005',
    nickname: '周航',
    handle: 'zhouhang',
    phone_masked: '150****3345',
    account_state: 'warning',
    active_disposal: null,
    registered_at: isoHoursAgo(24 * 35),
    post_count: 12,
    report_received: 3,
  },
  {
    user_id: 'u_1006',
    nickname: '苏晴',
    handle: 'suqing',
    phone_masked: '186****7782',
    account_state: 'normal',
    active_disposal: null,
    registered_at: isoHoursAgo(24 * 520),
    post_count: 431,
    report_received: 0,
  },
  {
    user_id: 'u_1007',
    nickname: '赵一鸣',
    handle: 'zhaoyiming',
    phone_masked: '135****1092',
    account_state: 'normal',
    active_disposal: null,
    registered_at: isoHoursAgo(24 * 120),
    post_count: 33,
    report_received: 1,
  },
  {
    user_id: 'u_1008',
    nickname: '郑北',
    handle: 'zhengbei',
    phone_masked: '159****6613',
    account_state: 'normal',
    active_disposal: null,
    registered_at: isoHoursAgo(24 * 90),
    post_count: 77,
    report_received: 0,
  },
  {
    user_id: 'u_1009',
    nickname: '吴桐',
    handle: 'wutong',
    phone_masked: '188****2245',
    account_state: 'normal',
    active_disposal: null,
    registered_at: isoHoursAgo(24 * 60),
    post_count: 41,
    report_received: 2,
  },
  {
    user_id: 'u_1010',
    nickname: '冯小满',
    handle: 'fengxiaoman',
    phone_masked: '133****5578',
    account_state: 'muted',
    active_disposal: null,
    registered_at: isoHoursAgo(24 * 150),
    post_count: 96,
    report_received: 5,
  },
  {
    user_id: 'u_1011',
    nickname: '孙小芮',
    handle: 'sunxiaorui',
    phone_masked: '176****9034',
    account_state: 'normal',
    active_disposal: null,
    registered_at: isoHoursAgo(24 * 12),
    post_count: 8,
    report_received: 5,
  },
  {
    user_id: 'u_1012',
    nickname: '钱多宝',
    handle: 'qianduobao',
    phone_masked: '155****4417',
    account_state: 'banned',
    active_disposal: null,
    registered_at: isoHoursAgo(24 * 5),
    post_count: 19,
    report_received: 11,
  },
  {
    user_id: 'u_1013',
    nickname: '楚南',
    handle: 'chunan',
    phone_masked: '137****2266',
    account_state: 'normal',
    active_disposal: null,
    registered_at: isoHoursAgo(24 * 240),
    post_count: 154,
    report_received: 1,
  },
];

const reports: Report[] = [
  {
    report_id: 'r_3001',
    reporter: U.suqing,
    target: { type: 'media', id: 'm_2001', label: '视频：冲突场景（00:47）' },
    category: '暴力血腥',
    description: '视频里有人打架，还有尖叫声，看着很不适',
    evidence_count: 2,
    status: 'pending',
    risk: 'urgent',
    created_at: isoHoursAgo(3),
    withdrawn: false,
  },
  {
    report_id: 'r_3002',
    reporter: U.zhixia,
    target: { type: 'post', id: 'p_2004', label: '“高价回收银行卡、电话卡”' },
    category: '违法犯罪',
    description: '回收银行卡明显是违法买卖，建议核查',
    evidence_count: 3,
    status: 'pending',
    risk: 'urgent',
    created_at: isoHoursAgo(5),
    withdrawn: false,
  },
  {
    report_id: 'r_3003',
    reporter: U.zhengbei,
    target: { type: 'post', id: 'p_2001', label: '“内部渠道低价出票”' },
    category: '垃圾广告',
    description: '引流卖票的，评论区一堆人问联系方式',
    evidence_count: 1,
    status: 'processing',
    risk: 'high',
    created_at: isoHoursAgo(20),
    withdrawn: false,
  },
  {
    report_id: 'r_3004',
    reporter: U.linwan,
    target: { type: 'comment', id: 'c_2004', label: '评论“建议家长看看脑子”' },
    category: '网络暴力',
    description: '涉及未成年人，言辞侮辱，希望处理',
    evidence_count: 1,
    status: 'pending',
    risk: 'high',
    created_at: isoHoursAgo(1),
    withdrawn: false,
  },
  {
    report_id: 'r_3005',
    reporter: U.fengxiaoman,
    target: { type: 'user', id: 'u_1010', label: '用户“冯小满”（被多次举报）' },
    category: '骚扰',
    description: '连续三条私信骚扰我，已拉黑',
    evidence_count: 4,
    status: 'resolved',
    risk: 'medium',
    created_at: isoHoursAgo(80),
    resolution: {
      verdict: 'violation',
      note: '私信骚扰属实，已禁言 3 天并通知本人',
      at: isoHoursAgo(79),
      by: 'admin',
      linked_action_id: 'act_5005',
    },
    withdrawn: false,
  },
  {
    report_id: 'r_3006',
    reporter: U.wutong,
    target: { type: 'post', id: 'p_2007', label: '“spreader 更新 0.2 版本”' },
    category: '虚假信息',
    description: '版本号不对，官方最新是 0.1.3',
    evidence_count: 1,
    status: 'resolved',
    risk: 'low',
    created_at: isoHoursAgo(90),
    resolution: {
      verdict: 'no_violation',
      note: '经核实为个人构建版本，非官方发布但无违规，结案',
      at: isoHoursAgo(89),
      by: 'admin',
      linked_action_id: null,
    },
    withdrawn: false,
  },
  {
    report_id: 'r_3007',
    reporter: U.chenmo,
    target: { type: 'post', id: 'p_2008', label: '“某地明天地震，速转家人”' },
    category: '虚假信息',
    description: '谣言！本地地震台没有消息',
    evidence_count: 2,
    status: 'processing',
    risk: 'high',
    created_at: isoHoursAgo(7),
    withdrawn: false,
  },
  {
    report_id: 'r_3008',
    reporter: U.zhaoyiming,
    target: { type: 'comment', id: 'c_2002', label: '评论“搬运自知乎回答的长段落”' },
    category: '侵权抄袭',
    description: '原文作者是我朋友，未获授权',
    evidence_count: 2,
    status: 'closed',
    risk: 'medium',
    created_at: isoHoursAgo(100),
    resolution: {
      verdict: 'no_violation',
      note: '举报人撤回，举报单结案；已生效处置不因此撤销',
      at: isoHoursAgo(99),
      by: 'admin',
      linked_action_id: null,
    },
    withdrawn: true,
  },
];

const appeals: Appeal[] = [
  {
    appeal_id: 'a_4001',
    appellant: U.wutong,
    target_action_id: 'act_5001',
    target_label: '动态 p_2003「某品牌饮料被检出有害物质」被下架',
    reason: '内容有权威媒体转载来源，不属于虚假信息，申请恢复',
    status: 'pending_review',
    created_at: isoHoursAgo(4),
  },
  {
    appeal_id: 'a_4002',
    appellant: U.fengxiaoman,
    target_action_id: 'act_5005',
    target_label: '账号被禁言 3 天（私信骚扰）',
    reason: '已向对方道歉并取得谅解，希望提前解除',
    status: 'reviewing',
    created_at: isoHoursAgo(30),
  },
  {
    appeal_id: 'a_4003',
    appellant: U.qianduobao,
    target_action_id: 'act_5003',
    target_label: '动态 p_2006「减肥神药」被下架',
    reason: '产品有检测报告，认为判定有误',
    status: 'upheld',
    created_at: isoHoursAgo(96),
    review: {
      outcome: 'upheld',
      note: '未提交有效资质，维持下架处置',
      at: isoHoursAgo(95),
      by: 'admin',
    },
  },
  {
    appeal_id: 'a_4004',
    appellant: U.chunan,
    target_action_id: 'act_5004',
    target_label: '动态 p_2008 被限流（地震谣言）',
    reason: '转发时未核实，已删除，申请恢复账号功能',
    status: 'overturned',
    created_at: isoHoursAgo(60),
    review: {
      outcome: 'overturned',
      note: '作者主动删除且为初犯，撤销限流，保留警告记录',
      at: isoHoursAgo(59),
      by: 'admin',
    },
  },
  {
    appeal_id: 'a_4005',
    appellant: U.zhouhang,
    target_action_id: 'act_5006',
    target_label: '评论 c_2002 被下架（“搬运自知乎回答的长段落”）',
    reason: '是朋友间正常聊天，不是广告',
    status: 'pending_review',
    created_at: isoHoursAgo(2),
  },
];

const actions: ModerationAction[] = [
  {
    action_id: 'act_5001',
    object_type: 'post',
    object_id: 'p_2003',
    object_label: '动态 p_2003「某品牌饮料被检出有害物质」',
    action: 'takedown',
    reason_category: '虚假信息',
    basis: '无权威来源的健康风险信息，命中虚假信息特征',
    source: 'report',
    executor: 'admin',
    effective_at: isoHoursAgo(6),
    expires_at: null,
    revoked: false,
    created_at: isoHoursAgo(6),
    batch_id: null,
  },
  {
    action_id: 'act_5002',
    object_type: 'post',
    object_id: 'p_2004',
    object_label: '动态 p_2004「高价回收银行卡、电话卡」',
    action: 'takedown',
    reason_category: '违法犯罪',
    basis: '涉嫌收售银行卡，图片识别命中且多人举报',
    source: 'report',
    executor: 'admin',
    effective_at: isoHoursAgo(29),
    expires_at: null,
    revoked: false,
    created_at: isoHoursAgo(29),
    batch_id: null,
  },
  {
    action_id: 'act_5003',
    object_type: 'post',
    object_id: 'p_2006',
    object_label: '动态 p_2006「减肥神药」',
    action: 'takedown',
    reason_category: '虚假信息',
    basis: '无资质证明的功效宣传',
    source: 'patrol',
    executor: 'admin',
    effective_at: isoHoursAgo(51),
    expires_at: null,
    revoked: false,
    created_at: isoHoursAgo(51),
    batch_id: null,
  },
  {
    action_id: 'act_5004',
    object_type: 'post',
    object_id: 'p_2008',
    object_label: '动态 p_2008「某地明天地震」',
    action: 'throttle',
    reason_category: '虚假信息',
    basis: '未证实的地震信息，降低分发权重，仅作者可见',
    source: 'report',
    executor: 'admin',
    effective_at: isoHoursAgo(8),
    expires_at: isoHoursAgo(-24 * 7),
    revoked: true,
    created_at: isoHoursAgo(8),
    batch_id: null,
  },
  {
    action_id: 'act_5005',
    object_type: 'user',
    object_id: 'u_1010',
    object_label: '用户 u_1010「冯小满」',
    action: 'mute',
    reason_category: '骚扰',
    basis: '私信骚扰举报认定违规，禁言 3 天',
    source: 'report',
    executor: 'admin',
    effective_at: isoHoursAgo(80),
    expires_at: isoHoursAgo(-72),
    revoked: false,
    created_at: isoHoursAgo(80),
    batch_id: null,
  },
  {
    action_id: 'act_5006',
    object_type: 'comment',
    object_id: 'c_2002',
    object_label: '评论 c_2002「搬运自知乎回答的长段落」',
    action: 'takedown',
    reason_category: '侵权抄袭',
    basis: '搬运内容被原作者朋友举报，暂下架待复核',
    source: 'report',
    executor: 'admin',
    effective_at: isoHoursAgo(21),
    expires_at: null,
    revoked: false,
    created_at: isoHoursAgo(21),
    batch_id: null,
  },
  {
    action_id: 'act_5007',
    object_type: 'user',
    object_id: 'u_1004',
    object_label: '用户 u_1004「陈默」',
    action: 'restrict',
    reason_category: '侵权抄袭',
    basis: '多次搬运未注明出处，限制发布功能 7 天',
    source: 'report',
    executor: 'admin',
    effective_at: isoHoursAgo(24),
    expires_at: isoHoursAgo(-24 * 7),
    revoked: false,
    created_at: isoHoursAgo(24),
    batch_id: null,
  },
  {
    action_id: 'act_5008',
    object_type: 'user',
    object_id: 'u_1005',
    object_label: '用户 u_1005「周航」',
    action: 'warning',
    reason_category: '垃圾广告',
    basis: '首次发布导流内容，予以警告',
    source: 'patrol',
    executor: 'admin',
    effective_at: isoHoursAgo(45),
    expires_at: null,
    revoked: false,
    created_at: isoHoursAgo(45),
    batch_id: null,
  },
  {
    action_id: 'act_5009',
    object_type: 'user',
    object_id: 'u_1012',
    object_label: '用户 u_1012「钱多宝」',
    action: 'ban',
    reason_category: '违法犯罪',
    basis: '多次发布违法信息且举报集中，永久封禁',
    source: 'regulator',
    executor: 'admin',
    effective_at: isoHoursAgo(24 * 2),
    expires_at: null,
    revoked: false,
    created_at: isoHoursAgo(24 * 2),
    batch_id: null,
  },
];

const logs: ModerationLogEntry[] = [
  {
    log_id: 'l_6001',
    action_type: 'takedown',
    object_type: 'post',
    object_id: 'p_2003',
    object_label: '动态 p_2003「某品牌饮料被检出有害物质」',
    reason_category: '虚假信息',
    basis: '无权威来源的健康风险信息，命中虚假信息特征',
    source: 'report',
    executor: 'admin',
    occurred_at: isoHoursAgo(6),
    revoked: false,
    action_id: 'act_5001',
    related_log_id: null,
  },
  {
    log_id: 'l_6002',
    action_type: 'takedown',
    object_type: 'post',
    object_id: 'p_2004',
    object_label: '动态 p_2004「高价回收银行卡、电话卡」',
    reason_category: '违法犯罪',
    basis: '涉嫌收售银行卡，图片识别命中且多人举报',
    source: 'report',
    executor: 'admin',
    occurred_at: isoHoursAgo(29),
    revoked: false,
    action_id: 'act_5002',
    related_log_id: null,
  },
  {
    log_id: 'l_6003',
    action_type: 'review_escalate',
    object_type: 'post',
    object_id: 'p_2004',
    object_label: '动态 p_2004「高价回收银行卡、电话卡」',
    reason_category: '违法犯罪',
    basis: '涉嫌帮助信息网络犯罪活动，需固定证据后处置并上报',
    source: 'machine',
    executor: 'admin',
    occurred_at: isoHoursAgo(27),
    revoked: false,
    action_id: null,
    related_log_id: null,
  },
  {
    log_id: 'l_6004',
    action_type: 'takedown',
    object_type: 'post',
    object_id: 'p_2006',
    object_label: '动态 p_2006「减肥神药」',
    reason_category: '虚假信息',
    basis: '无资质证明的功效宣传',
    source: 'patrol',
    executor: 'admin',
    occurred_at: isoHoursAgo(51),
    revoked: false,
    action_id: 'act_5003',
    related_log_id: null,
  },
  {
    log_id: 'l_6005',
    action_type: 'throttle',
    object_type: 'post',
    object_id: 'p_2008',
    object_label: '动态 p_2008「某地明天地震」',
    reason_category: '虚假信息',
    basis: '未证实的地震信息，降低分发权重，仅作者可见',
    source: 'report',
    executor: 'admin',
    occurred_at: isoHoursAgo(8),
    revoked: true,
    action_id: 'act_5004',
    related_log_id: null,
  },
  {
    log_id: 'l_6006',
    action_type: 'revoke',
    object_type: 'post',
    object_id: 'p_2008',
    object_label: '动态 p_2008「某地明天地震」',
    reason_category: '虚假信息',
    basis: '申诉复核撤销：作者主动删除且为初犯，撤销限流，保留警告记录',
    source: 'report',
    executor: 'admin',
    occurred_at: isoHoursAgo(59),
    revoked: false,
    action_id: 'act_5004',
    related_log_id: 'l_6005',
  },
  {
    log_id: 'l_6007',
    action_type: 'mute',
    object_type: 'user',
    object_id: 'u_1010',
    object_label: '用户 u_1010「冯小满」',
    reason_category: '骚扰',
    basis: '私信骚扰举报认定违规，禁言 3 天',
    source: 'report',
    executor: 'admin',
    occurred_at: isoHoursAgo(80),
    revoked: false,
    action_id: 'act_5005',
    related_log_id: null,
  },
  {
    log_id: 'l_6008',
    action_type: 'takedown',
    object_type: 'comment',
    object_id: 'c_2002',
    object_label: '评论 c_2002「搬运自知乎回答的长段落」',
    reason_category: '侵权抄袭',
    basis: '搬运内容被原作者朋友举报，暂下架待复核',
    source: 'report',
    executor: 'admin',
    occurred_at: isoHoursAgo(21),
    revoked: false,
    action_id: 'act_5006',
    related_log_id: null,
  },
  {
    log_id: 'l_6009',
    action_type: 'review_pass',
    object_type: 'post',
    object_id: 'p_2005',
    object_label: '动态 p_2005「周末 citywalk 路线分享」',
    reason_category: '其他',
    basis: '机器判定通过，人工抽检无异常',
    source: 'machine',
    executor: 'admin',
    occurred_at: isoHoursAgo(39),
    revoked: false,
    action_id: null,
    related_log_id: null,
  },
  {
    log_id: 'l_6010',
    action_type: 'review_reject',
    object_type: 'post',
    object_id: 'p_2006',
    object_label: '动态 p_2006「减肥神药」',
    reason_category: '虚假信息',
    basis: '无资质证明的减肥功效宣传，判定不通过',
    source: 'machine',
    executor: 'admin',
    occurred_at: isoHoursAgo(49),
    revoked: false,
    action_id: null,
    related_log_id: null,
  },
  {
    log_id: 'l_6011',
    action_type: 'warning',
    object_type: 'user',
    object_id: 'u_1005',
    object_label: '用户 u_1005「周航」',
    reason_category: '垃圾广告',
    basis: '首次发布导流内容，予以警告',
    source: 'patrol',
    executor: 'admin',
    occurred_at: isoHoursAgo(45),
    revoked: false,
    action_id: 'act_5008',
    related_log_id: null,
  },
  {
    log_id: 'l_6012',
    action_type: 'restrict',
    object_type: 'user',
    object_id: 'u_1004',
    object_label: '用户 u_1004「陈默」',
    reason_category: '侵权抄袭',
    basis: '多次搬运未注明出处，限制发布功能 7 天',
    source: 'report',
    executor: 'admin',
    occurred_at: isoHoursAgo(24),
    revoked: false,
    action_id: 'act_5007',
    related_log_id: null,
  },
  {
    log_id: 'l_6013',
    action_type: 'ban',
    object_type: 'user',
    object_id: 'u_1012',
    object_label: '用户 u_1012「钱多宝」',
    reason_category: '违法犯罪',
    basis: '多次发布违法信息且举报集中，永久封禁',
    source: 'regulator',
    executor: 'admin',
    occurred_at: isoHoursAgo(48),
    revoked: false,
    action_id: 'act_5009',
    related_log_id: null,
  },
];

/* 登录态与失败计数（mock 会话） */
let currentAdmin: AdminAccount | null = null;
let passwordAttempts = 0;
let lockedUntil = 0;

/* ------------------------------------------------------------------ *
 * 内部工具
 * ------------------------------------------------------------------ */

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function objectLabel(objectType: ModerationObjectType, objectId: string, preview: string): string {
  return `${OBJECT_TYPE_LABEL[objectType]} ${objectId}「${truncate(preview, 18)}」`;
}

function appendLog(entry: {
  action_type: LogActionType;
  object_type: ModerationObjectType;
  object_id: string;
  object_label: string;
  reason_category: string;
  basis: string;
  source: ModerationAction['source'];
  executor: string;
  action_id?: string | null;
  related_log_id?: string | null;
}): ModerationLogEntry {
  const log: ModerationLogEntry = {
    log_id: nextId('l'),
    occurred_at: new Date().toISOString(),
    revoked: false,
    action_id: entry.action_id ?? null,
    related_log_id: entry.related_log_id ?? null,
    ...entry,
  };
  logs.unshift(log);
  return log;
}

const CONTENT_STATUS_BY_ACTION: Record<ContentDisposalAction, ContentObjectStatus> = {
  takedown: 'takedown',
  throttle: 'throttled',
  delete: 'deleted',
  restore: 'published',
};

/** 按“最新一条未撤销处置”重算内容对象状态（无则保持基础状态） */
function recomputeObject(object: ContentObject): void {
  const active = actions
    .filter((a) => a.object_type === object.object_type && a.object_id === object.object_id && !a.revoked)
    .sort((a, b) => Date.parse(b.effective_at) - Date.parse(a.effective_at));
  const latest = active[0];
  if (latest && latest.action in CONTENT_STATUS_BY_ACTION) {
    object.status = CONTENT_STATUS_BY_ACTION[latest.action as ContentDisposalAction];
    object.active_disposal_id = latest.action_id;
  } else if (object.status !== 'reviewing' && object.status !== 'deleted') {
    object.status = 'published';
    object.active_disposal_id = null;
  }
}

/** 账号状态 = 所有未撤销用户处置中的最严级别（PRD 8.11.4 AC-5） */
function recomputeUser(user: UserAccount): void {
  const active = actions
    .filter((a) => a.object_type === 'user' && a.object_id === user.user_id && !a.revoked)
    .sort((a, b) => Date.parse(b.effective_at) - Date.parse(a.effective_at));

  let strictest: ModerationAction | null = null;
  for (const a of active) {
    if (
      a.action === 'warning' ||
      a.action === 'restrict' ||
      a.action === 'mute' ||
      a.action === 'ban'
    ) {
      const level = a.action as UserDisposalLevel;
      if (!strictest || stricterLevel(level, strictest.action as UserDisposalLevel) === level) {
        strictest = a;
      }
    }
  }

  if (!strictest) {
    user.account_state = 'normal';
    user.active_disposal = null;
    return;
  }
  const level = strictest.action as 'warning' | 'restrict' | 'mute' | 'ban';
  user.account_state =
    level === 'warning'
      ? 'warning'
      : level === 'restrict'
        ? 'restricted'
        : level === 'mute'
          ? 'muted'
          : 'banned';
  user.active_disposal = {
    level,
    reason_category: strictest.reason_category,
    expires_at: strictest.expires_at,
  };
}

function activeContentAction(object: ContentObject): ModerationAction | null {
  return (
    actions.find((a) => a.action_id === object.active_disposal_id && !a.revoked) ?? null
  );
}

/* ------------------------------------------------------------------ *
 * 管理端认证（PG-24）
 * ------------------------------------------------------------------ */

/** ↔ POST /v1/admin/auth/login */
export async function signIn(account: string, password: string): Promise<SignInResult> {
  await delay(420);

  const now = Date.now();
  if (lockedUntil > now) {
    return { ok: false, error: 'locked', locked_until: new Date(lockedUntil).toISOString() };
  }

  const trimmed = account.trim();
  if (!trimmed || !password) {
    return { ok: false, error: 'bad_credentials', attempts_left: attemptsLeft() };
  }

  /* 账号体系隔离：用户端账号不得登录管理后台（PRD 8.11.1 AC-2） */
  if (USER_SIDE_ACCOUNTS.includes(trimmed.toLowerCase())) {
    return { ok: false, error: 'user_side_account' };
  }

  if (trimmed !== MOCK_ADMIN.account || password !== MOCK_ADMIN.password) {
    passwordAttempts += 1;
    if (passwordAttempts >= MAX_PASSWORD_ATTEMPTS) {
      lockedUntil = now + LOCK_MINUTES * 60_000;
      passwordAttempts = 0;
      return { ok: false, error: 'locked', locked_until: new Date(lockedUntil).toISOString() };
    }
    return { ok: false, error: 'bad_credentials', attempts_left: attemptsLeft() };
  }

  passwordAttempts = 0;
  lockedUntil = 0;
  currentAdmin = {
    admin_id: MOCK_ADMIN.admin_id,
    account: MOCK_ADMIN.account,
    name: MOCK_ADMIN.name,
    status: 'active',
    last_login_at: new Date().toISOString(),
  };
  return { ok: true, admin: currentAdmin };
}

function attemptsLeft(): number {
  return Math.max(0, MAX_PASSWORD_ATTEMPTS - passwordAttempts);
}

/** ↔ GET /v1/admin/auth/me（刷新后恢复登录态用）
 *  mock 的“服务端会话”在页面刷新后会随 JS 上下文丢失，这里从持久化存储
 *  恢复（模拟真实服务端按管理端令牌认出管理员）；真实实现应带令牌请求。 */
export async function fetchCurrentAdmin(): Promise<AdminAccount | null> {
  await delay(80);
  if (currentAdmin) return currentAdmin;
  try {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as AdminAccount;
    currentAdmin = cached;
    return cached;
  } catch {
    return null;
  }
}

/** ↔ POST /v1/admin/auth/logout */
export async function signOut(): Promise<void> {
  await delay(120);
  currentAdmin = null;
}

/* ------------------------------------------------------------------ *
 * 工作台（仪表盘）
 * ------------------------------------------------------------------ */

/** ↔ GET /v1/admin/dashboard */
export async function fetchDashboardStats(): Promise<DashboardStats> {
  await delay(240);

  const now = Date.now();
  const todayStart = Date.parse(startOfTodayIso());

  const sla_breached: SlaBreach[] = [];
  for (const t of auditTasks) {
    if (t.status !== 'pending') continue;
    const waiting = (now - Date.parse(t.queue_entered_at)) / 3600_000;
    if (waiting > SLA_HOURS.review) {
      sla_breached.push({
        kind: 'review',
        id: t.task_id,
        label: `${CONTENT_KIND_LABEL[t.object_type]}「${truncate(t.content_preview, 16)}」`,
        waiting_hours: Math.floor(waiting),
      });
    }
  }
  for (const r of reports) {
    if (r.status !== 'pending' && r.status !== 'processing') continue;
    const waiting = (now - Date.parse(r.created_at)) / 3600_000;
    if (waiting > SLA_HOURS.report) {
      sla_breached.push({
        kind: 'report',
        id: r.report_id,
        label: `举报「${truncate(r.target.label, 16)}」`,
        waiting_hours: Math.floor(waiting),
      });
    }
  }
  for (const a of appeals) {
    if (a.status !== 'pending_review' && a.status !== 'reviewing') continue;
    const waiting = (now - Date.parse(a.created_at)) / 3600_000;
    if (waiting > SLA_HOURS.appeal) {
      sla_breached.push({
        kind: 'appeal',
        id: a.appeal_id,
        label: `申诉「${truncate(a.target_label, 16)}」`,
        waiting_hours: Math.floor(waiting),
      });
    }
  }
  sla_breached.sort((a, b) => b.waiting_hours - a.waiting_hours);

  return {
    pending_review: auditTasks.filter((t) => t.status === 'pending').length,
    escalated: auditTasks.filter((t) => t.status === 'escalated').length,
    today_actions: actions.filter((a) => Date.parse(a.created_at) >= todayStart).length,
    pending_reports: reports.filter((r) => r.status === 'pending' || r.status === 'processing').length,
    pending_appeals: appeals.filter((a) => a.status === 'pending_review' || a.status === 'reviewing')
      .length,
    sla_breached,
    recent: [...logs]
      .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))
      .slice(0, 8),
  };
}

/* ------------------------------------------------------------------ *
 * 内容审核队列（PG-25）
 * ------------------------------------------------------------------ */

/** ↔ GET /v1/admin/audit-tasks?status&kind&risk&keyword&sort&cursor&limit */
export async function fetchReviewQueue(filter: ReviewQueueFilter): Promise<Page<AuditTask>> {
  await delay(260);

  const limit = Math.min(Math.max(filter.limit ?? 10, 1), 50);
  let pool = auditTasks.filter((t) => {
    if (filter.status && filter.status !== 'all' && t.status !== filter.status) return false;
    if (filter.kind && filter.kind !== 'all' && t.object_type !== filter.kind) return false;
    if (filter.risk && filter.risk !== 'all' && t.risk !== filter.risk) return false;
    if (filter.keyword) {
      const kw = filter.keyword.toLowerCase();
      const hay = `${t.task_id} ${t.object_id} ${t.content_preview} ${t.author.nickname} ${t.author.handle}`.toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });

  if (filter.sort === 'most_reported') {
    pool = [...pool].sort(
      (a, b) => b.report_count - a.report_count || Date.parse(b.created_at) - Date.parse(a.created_at),
    );
  } else {
    /* 默认最旧优先：积压最久的先处理 */
    pool = [...pool].sort(
      (a, b) => Date.parse(a.queue_entered_at) - Date.parse(b.queue_entered_at),
    );
  }

  /* keyset 游标：锚定“返回的最后一条”，与客户端分页约定一致 */
  let start = 0;
  if (filter.cursor) {
    const idx = pool.findIndex((t) => t.task_id === filter.cursor);
    if (idx >= 0) start = idx + 1;
  }

  const items = pool.slice(start, start + limit);
  const next = pool[start + limit];
  return {
    items,
    next_cursor: next ? next.task_id : null,
    has_more: Boolean(next),
  };
}

/** ↔ GET /v1/admin/audit-tasks/{task_id} */
export async function fetchReviewTask(taskId: string): Promise<AuditTask | null> {
  await delay(180);
  return auditTasks.find((t) => t.task_id === taskId) ?? null;
}

/** ↔ POST /v1/admin/audit-tasks/{task_id}:decide */
export async function submitReviewDecision(
  taskId: string,
  input: ReviewDecisionInput,
): Promise<AuditTask> {
  await delay(320);

  const task = auditTasks.find((t) => t.task_id === taskId);
  if (!task) throw new Error('audit_task_not_found');

  const status =
    input.outcome === 'pass' ? 'passed' : input.outcome === 'reject' ? 'rejected' : 'escalated';
  task.status = status;
  task.decision = {
    outcome: input.outcome,
    reason_category: input.reason_category,
    basis: input.basis,
    decided_at: new Date().toISOString(),
    decided_by: currentAdmin?.account ?? 'admin',
  };

  const logType: LogActionType =
    input.outcome === 'pass'
      ? 'review_pass'
      : input.outcome === 'reject'
        ? 'review_reject'
        : 'review_escalate';
  appendLog({
    action_type: logType,
    object_type: task.object_type,
    object_id: task.object_id,
    object_label: objectLabel(task.object_type, task.object_id, task.content_preview),
    reason_category: input.reason_category,
    basis: input.basis,
    source: task.machine.source,
    executor: currentAdmin?.account ?? 'admin',
  });

  return task;
}

/* ------------------------------------------------------------------ *
 * 内容处置操作台（PG-26）
 * ------------------------------------------------------------------ */

/** ↔ GET /v1/admin/content-objects?keyword&type&status */
export async function fetchContentObjects(filter: ContentObjectFilter): Promise<ContentObject[]> {
  await delay(240);
  const kw = filter.keyword?.trim().toLowerCase() ?? '';
  return contentObjects
    .filter((o) => {
      if (filter.type && filter.type !== 'all' && o.object_type !== filter.type) return false;
      if (filter.status && filter.status !== 'all' && o.status !== filter.status) return false;
      if (kw) {
        const hay = `${o.object_id} ${o.preview} ${o.author.nickname} ${o.author.handle}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    })
    .map((o) => ({ ...o }));
}

/** ↔ GET /v1/admin/moderation-actions?object_type&object_id */
export async function fetchActionsForObject(
  objectType: ModerationObjectType,
  objectId: string,
): Promise<ModerationAction[]> {
  await delay(160);
  return actions
    .filter((a) => a.object_type === objectType && a.object_id === objectId)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

/** ↔ GET /v1/admin/moderation-actions/{action_id} */
export async function fetchAction(actionId: string): Promise<ModerationAction | null> {
  await delay(140);
  return actions.find((a) => a.action_id === actionId) ?? null;
}

/** ↔ GET /v1/admin/moderation-actions?recent=1&limit（操作台“当前处置 / 最近记录”用） */
export async function fetchRecentActions(limit = 50): Promise<ModerationAction[]> {
  await delay(200);
  return [...actions]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, limit);
}

/** ↔ POST /v1/admin/moderation-actions */
export async function createDisposal(
  objectType: ModerationObjectType,
  objectId: string,
  input: ContentDisposalInput,
): Promise<ModerationAction> {
  await delay(340);

  if (objectType === 'user' || objectType === 'message') {
    throw new Error('invalid_state');
  }
  const object = contentObjects.find((o) => o.object_id === objectId && o.object_type === objectType);
  if (!object || object.status === 'deleted') {
    throw new Error('object_missing');
  }

  const active = activeContentAction(object);
  if (input.action === 'restore' && !active) {
    throw new Error('invalid_state');
  }
  if (active && active.action === input.action) {
    throw new Error('invalid_state');
  }

  const label = objectLabel(object.object_type, object.object_id, object.preview);
  const action = applyDisposal(object.object_type, object.object_id, label, input);
  recomputeObject(object);
  return action;
}

/** ↔ POST /v1/admin/moderation-actions:batch（逐条生成独立记录，PRD 8.11.3 AC-4） */
export async function createDisposalBatch(
  items: { object_type: ContentKind; object_id: string }[],
  input: ContentDisposalInput,
): Promise<BatchDisposalResultItem[]> {
  await delay(420);

  const batchId = nextId('batch');
  return items.map(({ object_type, object_id }) => {
    const object = contentObjects.find(
      (o) => o.object_id === object_id && o.object_type === object_type,
    );
    /* 对象已被作者删除：标记“对象已不存在”，不影响同批其他对象（PRD 8.11.3 AC-5） */
    if (!object || object.status === 'deleted') {
      return { object_id, ok: false, error: 'object_missing' as const };
    }
    const active = activeContentAction(object);
    if (input.action === 'restore' && !active) {
      return { object_id, ok: false, error: 'invalid_state' as const };
    }
    if (active && active.action === input.action) {
      return { object_id, ok: false, error: 'invalid_state' as const };
    }
    const label = objectLabel(object.object_type, object.object_id, object.preview);
    const action = applyDisposal(object.object_type, object.object_id, label, input, batchId);
    recomputeObject(object);
    return { object_id, ok: true, action_id: action.action_id };
  });
}

/** ↔ POST /v1/admin/moderation-actions/{action_id}:revoke */
export async function revokeDisposal(actionId: string): Promise<ModerationAction> {
  await delay(320);

  const action = actions.find((a) => a.action_id === actionId);
  if (!action) throw new Error('action_not_found');
  if (action.revoked) throw new Error('invalid_state');

  action.revoked = true;
  const original = logs.find((l) => l.action_id === actionId && l.action_type !== 'revoke');
  if (original) original.revoked = true;

  appendLog({
    action_type: 'revoke',
    object_type: action.object_type,
    object_id: action.object_id,
    object_label: action.object_label,
    reason_category: action.reason_category,
    basis: `撤销「${DISPOSAL_ACTION_LABEL[action.action]}」，恢复至处置前状态`,
    source: 'patrol',
    executor: currentAdmin?.account ?? 'admin',
    action_id: action.action_id,
    related_log_id: original?.log_id ?? null,
  });

  /* 撤销后按剩余未撤销处置重算对象 / 账号状态 */
  if (action.object_type === 'user') {
    const user = userAccounts.find((u) => u.user_id === action.object_id);
    if (user) recomputeUser(user);
  } else if (action.object_type !== 'message') {
    const object = contentObjects.find(
      (o) => o.object_id === action.object_id && o.object_type === action.object_type,
    );
    if (object) recomputeObject(object);
  }

  return action;
}

function applyDisposal(
  objectType: ModerationObjectType,
  objectId: string,
  label: string,
  input: {
    action: DisposalActionType;
    reason_category: string;
    basis: string;
    source: ModerationAction['source'];
    effective_at?: string | null;
    expires_at?: string | null;
  },
  batchId: string | null = null,
): ModerationAction {
  const nowIso = new Date().toISOString();
  const action: ModerationAction = {
    action_id: nextId('act'),
    object_type: objectType,
    object_id: objectId,
    object_label: label,
    action: input.action,
    reason_category: input.reason_category,
    basis: input.basis,
    source: input.source,
    executor: currentAdmin?.account ?? 'admin',
    effective_at: input.effective_at ?? nowIso,
    expires_at: input.expires_at ?? null,
    revoked: false,
    created_at: nowIso,
    batch_id: batchId,
  };
  actions.unshift(action);

  appendLog({
    action_type: input.action,
    object_type: objectType,
    object_id: objectId,
    object_label: label,
    reason_category: input.reason_category,
    basis: input.basis,
    source: input.source,
    executor: action.executor,
    action_id: action.action_id,
  });

  return action;
}

/* ------------------------------------------------------------------ *
 * 用户处置（PG-27）
 * ------------------------------------------------------------------ */

/** ↔ GET /v1/admin/user-accounts?keyword&state */
export async function fetchUsers(filter: UserAccountFilter): Promise<UserAccount[]> {
  await delay(240);
  const kw = filter.keyword?.trim().toLowerCase() ?? '';
  return userAccounts
    .filter((u) => {
      if (filter.state && filter.state !== 'all' && u.account_state !== filter.state) return false;
      if (kw) {
        const hay = `${u.user_id} ${u.nickname} ${u.handle} ${u.phone_masked}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    })
    .map((u) => ({ ...u }));
}

/** ↔ GET /v1/admin/user-accounts/{user_id} */
export async function fetchUser(userId: string): Promise<UserAccount | null> {
  await delay(160);
  const user = userAccounts.find((u) => u.user_id === userId);
  return user ? { ...user } : null;
}

/** ↔ POST /v1/admin/user-accounts/{user_id}:dispose */
export async function applyUserDisposal(
  userId: string,
  input: UserDisposalInput,
): Promise<ModerationAction> {
  await delay(340);

  const user = userAccounts.find((u) => u.user_id === userId);
  if (!user) throw new Error('user_not_found');

  const label = `用户 ${user.user_id}「${user.nickname}」`;
  const action = applyDisposal('user', userId, label, {
    action: input.level,
    reason_category: input.reason_category,
    basis: input.basis,
    source: input.source,
    expires_at: input.expires_at ?? null,
  });

  /* 多级处置叠加取最严（PRD 8.11.4 AC-5）。
   * notify 开关只决定是否通知被处置人，通知本身不计入处置日志。 */
  recomputeUser(user);

  return action;
}

/* ------------------------------------------------------------------ *
 * 举报与申诉（PG-28）
 * ------------------------------------------------------------------ */

/** ↔ GET /v1/admin/reports?status&keyword */
export async function fetchReports(filter: ReportFilter): Promise<Report[]> {
  await delay(240);
  const kw = filter.keyword?.trim().toLowerCase() ?? '';
  return reports
    .filter((r) => {
      if (filter.status && filter.status !== 'all' && r.status !== filter.status) return false;
      if (kw) {
        const hay = `${r.report_id} ${r.target.label} ${r.target.id} ${r.category} ${r.reporter.nickname}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    })
    .map((r) => ({ ...r }));
}

/** ↔ GET /v1/admin/reports/{report_id} */
export async function fetchReport(reportId: string): Promise<Report | null> {
  await delay(160);
  const report = reports.find((r) => r.report_id === reportId);
  return report ? { ...report } : null;
}

/**
 * ↔ POST /v1/admin/reports/{report_id}:resolve
 *
 * 认定违规时由调用方传入刚落地处置的 action_id，实现“处置完成后回写举报单”
 * （PRD 8.11.5 AC-4）。未认定违规直接结案，不产生处置记录。
 */
export async function resolveReport(
  reportId: string,
  input: ReportResolutionInput,
  linkedActionId: string | null = null,
): Promise<Report> {
  await delay(300);

  const report = reports.find((r) => r.report_id === reportId);
  if (!report) throw new Error('report_not_found');

  report.status = 'resolved';
  report.resolution = {
    verdict: input.verdict,
    note: input.note,
    at: new Date().toISOString(),
    by: currentAdmin?.account ?? 'admin',
    linked_action_id: input.verdict === 'violation' ? linkedActionId : null,
  };

  appendLog({
    action_type: input.verdict === 'violation' ? 'review_reject' : 'review_pass',
    object_type: report.target.type === 'user' ? 'user' : report.target.type,
    object_id: report.target.id,
    object_label: `举报 ${report.report_id} → ${report.target.label}`,
    reason_category: report.category,
    basis: `举报${input.verdict === 'violation' ? '认定违规' : '未认定违规'}：${input.note}`,
    source: 'report',
    executor: currentAdmin?.account ?? 'admin',
    action_id: input.verdict === 'violation' ? linkedActionId : null,
  });

  return report;
}

/** ↔ POST /v1/admin/reports/{report_id}:close（演示“举报人撤回”：撤回后结案，已生效处置不撤销） */
export async function closeWithdrawnReport(reportId: string): Promise<Report> {
  await delay(240);

  const report = reports.find((r) => r.report_id === reportId);
  if (!report) throw new Error('report_not_found');

  report.withdrawn = true;
  report.status = 'closed';
  report.resolution = {
    verdict: 'no_violation',
    note: '举报人撤回，举报单结案；已生效处置不因此撤销',
    at: new Date().toISOString(),
    by: currentAdmin?.account ?? 'admin',
    linked_action_id: null,
  };
  return report;
}

/** ↔ GET /v1/admin/appeals?status&keyword */
export async function fetchAppeals(filter: AppealFilter): Promise<Appeal[]> {
  await delay(240);
  const kw = filter.keyword?.trim().toLowerCase() ?? '';
  return appeals
    .filter((a) => {
      if (filter.status && filter.status !== 'all' && a.status !== filter.status) return false;
      if (kw) {
        const hay = `${a.appeal_id} ${a.target_label} ${a.reason} ${a.appellant.nickname}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    })
    .map((a) => ({ ...a }));
}

/** ↔ GET /v1/admin/appeals/{appeal_id} */
export async function fetchAppeal(appealId: string): Promise<Appeal | null> {
  await delay(160);
  const appeal = appeals.find((a) => a.appeal_id === appealId);
  return appeal ? { ...appeal } : null;
}

/**
 * ↔ POST /v1/admin/appeals/{appeal_id}:review
 *
 * 维持：仅记录结论。撤销：自动撤销原处置、恢复对象、留痕（PRD 8.11.5 AC-6）。
 */
export async function reviewAppeal(
  appealId: string,
  input: AppealReviewInput,
): Promise<Appeal> {
  await delay(340);

  const appeal = appeals.find((a) => a.appeal_id === appealId);
  if (!appeal) throw new Error('appeal_not_found');

  appeal.status = input.outcome === 'upheld' ? 'upheld' : 'overturned';
  appeal.review = {
    outcome: input.outcome,
    note: input.note,
    at: new Date().toISOString(),
    by: currentAdmin?.account ?? 'admin',
  };

  if (input.outcome === 'overturned') {
    const action = actions.find((a) => a.action_id === appeal.target_action_id);
    if (action && !action.revoked) {
      await revokeDisposal(action.action_id);
    }
    appendLog({
      action_type: 'review_pass',
      object_type: action?.object_type ?? 'post',
      object_id: appeal.target_action_id,
      object_label: `申诉 ${appeal.appeal_id} → ${appeal.target_label}`,
      reason_category: '其他',
      basis: `申诉复核撤销原处置：${input.note}`,
      source: 'report',
      executor: currentAdmin?.account ?? 'admin',
      action_id: appeal.target_action_id,
    });
  } else {
    appendLog({
      action_type: 'review_reject',
      object_type: 'post',
      object_id: appeal.target_action_id,
      object_label: `申诉 ${appeal.appeal_id} → ${appeal.target_label}`,
      reason_category: '其他',
      basis: `申诉复核维持原处置：${input.note}`,
      source: 'report',
      executor: currentAdmin?.account ?? 'admin',
      action_id: appeal.target_action_id,
    });
  }

  return appeal;
}

/* ------------------------------------------------------------------ *
 * 处置日志检索（PG-29）
 * ------------------------------------------------------------------ */

/** ↔ GET /v1/admin/moderation-logs?from&to&executor&action_type&keyword */
export async function fetchLogs(filter: ModerationLogFilter): Promise<ModerationLogEntry[]> {
  await delay(240);

  const from = filter.from ? Date.parse(filter.from) : null;
  const to = filter.to ? Date.parse(filter.to) : null;
  const kw = filter.keyword?.trim().toLowerCase() ?? '';

  return logs
    .filter((l) => {
      const at = Date.parse(l.occurred_at);
      if (from !== null && at < from) return false;
      if (to !== null && at > to) return false;
      if (filter.executor && filter.executor !== 'all' && l.executor !== filter.executor) return false;
      if (filter.action_type && filter.action_type !== 'all' && l.action_type !== filter.action_type) {
        return false;
      }
      if (kw) {
        const hay = `${l.log_id} ${l.object_label} ${l.object_id} ${l.basis} ${l.reason_category}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    })
    .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
}

/**
 * ↔ GET /v1/admin/moderation-logs:export（CSV）
 *
 * 日志只读、不可修改；导出用于留存与报监管（《具有舆论属性或社会动员能力的
 * 互联网信息服务安全评估规定》第五条要求记录操作留痕字段）。
 */
export async function exportLogsCsv(filter: ModerationLogFilter): Promise<string> {
  const rows = await fetchLogs(filter);
  const header = [
    '日志ID',
    '时间',
    '动作',
    '对象类型',
    '对象',
    '原因类别',
    '判定依据',
    '来源',
    '执行者',
    '状态',
    '关联处置记录',
    '关联日志',
  ];
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map((l) =>
    [
      l.log_id,
      new Date(l.occurred_at).toLocaleString('zh-CN', { hour12: false }),
      LOG_ACTION_LABEL[l.action_type],
      OBJECT_TYPE_LABEL[l.object_type],
      l.object_label,
      l.reason_category,
      l.basis,
      ACTION_SOURCE_LABEL[l.source],
      l.executor,
      l.revoked ? '已撤销' : '有效',
      l.action_id ?? '',
      l.related_log_id ?? '',
    ]
      .map((v) => escape(String(v)))
      .join(','),
  );
  return `\uFEFF${[header.map(escape).join(','), ...lines].join('\r\n')}`;
}
