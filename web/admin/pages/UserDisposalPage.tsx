import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import type {
  ActionSource,
  ModerationAction,
  RestrictedFeature,
  UserAccount,
  UserAccountState,
  UserDisposalInput,
  UserDisposalLevel,
} from '@admin/types';
import {
  applyUserDisposal,
  fetchRecentActions,
  fetchUsers,
  revokeDisposal,
} from '@admin/mocks/adminApi';
import {
  ACTION_SOURCE_LABEL,
  DISPOSAL_ACTION_LABEL,
  FEATURE_LABEL,
  REASON_CATEGORIES,
  USER_DISPOSAL_LEVELS,
  USER_STATE_LABEL,
  formatDateTime,
  formatShortDateTime,
  stricterLevel,
} from '@admin/labels';
import { PageHeader } from '@admin/components/PageHeader';
import { Button } from '@admin/components/Button';
import { DataTable, type Column } from '@admin/components/DataTable';
import { Drawer } from '@admin/components/Drawer';
import { ConfirmDialog } from '@admin/components/ConfirmDialog';
import { Checkbox, Field, SearchInput, Segmented, Select, TextArea, TextInput } from '@admin/components/FormControls';
import { KeyValue } from '@admin/components/KeyValue';
import { StatusBadge, type BadgeTone } from '@admin/components/StatusBadge';
import { toast } from '@admin/stores/toastStore';
import s from './UserDisposalPage.module.css';

const STATE_TONE: Record<UserAccountState, BadgeTone> = {
  normal: 'success',
  warning: 'warning',
  restricted: 'warning',
  muted: 'danger',
  banned: 'danger',
};

const LEVEL_DESC: Record<UserDisposalLevel, string> = {
  warning: '记录在案，不限制功能',
  restrict: '限制选定的发布 / 评论 / 私信',
  mute: '禁止评论与私信互动',
  ban: '禁止登录与使用',
};

const SOURCE_OPTIONS: { value: string; label: string }[] = (
  Object.keys(ACTION_SOURCE_LABEL) as ActionSource[]
).map((v) => ({ value: v, label: ACTION_SOURCE_LABEL[v] }));

/**
 * PG-27 用户处置
 *
 * - 分级：警告 → 功能限制 → 禁言 → 封禁（PRD 8.11.4）
 * - 功能限制细到单项（发布 / 评论 / 私信）
 * - 多级处置叠加时账号状态取最严（AC-5）
 * - 处置可撤销、留痕；默认通知被处置人
 */
export function UserDisposalPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialKeyword = searchParams.get('keyword') ?? '';

  const [keyword, setKeyword] = useState(initialKeyword);
  const [keywordInput, setKeywordInput] = useState(initialKeyword);
  const [state, setState] = useState<UserAccountState | 'all'>('all');
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const [drawerUser, setDrawerUser] = useState<UserAccount | null>(null);
  const [history, setHistory] = useState<ModerationAction[]>([]);
  const [revokeTarget, setRevokeTarget] = useState<ModerationAction | null>(null);

  /* 表单状态 */
  const [level, setLevel] = useState<UserDisposalLevel>('warning');
  const [features, setFeatures] = useState<RestrictedFeature[]>([]);
  const [reasonCategory, setReasonCategory] = useState('');
  const [basis, setBasis] = useState('');
  const [source, setSource] = useState<ActionSource>('patrol');
  const [expires, setExpires] = useState('');
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setUsers(await fetchUsers({ keyword, state }));
    setLoading(false);
  }, [keyword, state]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openDrawer = async (user: UserAccount) => {
    setDrawerUser(user);
    const recent = await fetchRecentActions(50);
    setHistory(
      recent
        .filter((a) => a.object_type === 'user' && a.object_id === user.user_id)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    );
    /* 表单复位 */
    setLevel('warning');
    setFeatures([]);
    setReasonCategory('');
    setBasis('');
    setSource('patrol');
    setExpires('');
    setNotify(true);
    setError(null);
  };

  const toggleFeature = (f: RestrictedFeature) => {
    setFeatures((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  const submit = async () => {
    if (!drawerUser) return;
    if (!reasonCategory || !basis.trim() || (level === 'restrict' && features.length === 0)) {
      setError(
        level === 'restrict' && features.length === 0
          ? '功能限制至少选择一项'
          : '请选择原因类别并填写判定依据',
      );
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await applyUserDisposal(drawerUser.user_id, {
        level,
        features: level === 'restrict' ? features : undefined,
        reason_category: reasonCategory,
        basis: basis.trim(),
        source,
        expires_at: level === 'warning' ? null : expires || null,
        notify,
      } satisfies UserDisposalInput);
      toast(`已执行「${DISPOSAL_ACTION_LABEL[level]}」${notify ? '，已通知本人' : ''}`);
      setDrawerUser(null);
      await reload();
    } catch {
      toast('处置失败，请重试', 'error');
    }
    setSubmitting(false);
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await revokeDisposal(revokeTarget.action_id);
      toast('已撤销该用户处置');
    } catch {
      toast('撤销失败，请重试', 'error');
    }
    setRevokeTarget(null);
    if (drawerUser) {
      const fresh = (await fetchUsers({ keyword: drawerUser.user_id }))[0];
      if (fresh) setDrawerUser(fresh);
      const recent = await fetchRecentActions(50);
      setHistory(
        recent
          .filter((a) => a.object_type === 'user' && a.object_id === drawerUser.user_id)
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
      );
    }
    await reload();
  };

  const columns: Column<UserAccount>[] = [
    {
      key: 'user',
      header: '用户',
      render: (u) => (
        <div className={s.userCell}>
          <span className={s.nickname}>{u.nickname}</span>
          <span className="admin-id">
            @{u.handle} · {u.user_id}
          </span>
        </div>
      ),
    },
    { key: 'phone', header: '手机号', width: '110px', render: (u) => <span className="admin-id">{u.phone_masked}</span> },
    {
      key: 'state',
      header: '账号状态',
      width: '104px',
      render: (u) => <StatusBadge tone={STATE_TONE[u.account_state]}>{USER_STATE_LABEL[u.account_state]}</StatusBadge>,
    },
    {
      key: 'disposal',
      header: '当前处置',
      width: '170px',
      render: (u) =>
        u.active_disposal ? (
          <div className={s.disposalCell}>
            <span className={s.disposalLevel}>{DISPOSAL_ACTION_LABEL[u.active_disposal.level]}</span>
            <span className="admin-id">
              {u.active_disposal.expires_at
                ? `至 ${formatShortDateTime(u.active_disposal.expires_at)}`
                : '长期'}
            </span>
          </div>
        ) : (
          <span className={s.noDisposal}>—</span>
        ),
    },
    {
      key: 'registered',
      header: '注册时间',
      width: '130px',
      render: (u) => <span className={s.time}>{formatDateTime(u.registered_at)}</span>,
    },
    { key: 'posts', header: '发布', width: '56px', align: 'right', render: (u) => u.post_count },
    {
      key: 'reports',
      header: '被举报',
      width: '68px',
      align: 'right',
      render: (u) => (u.report_received > 0 ? u.report_received : '—'),
    },
    {
      key: 'actions',
      header: '操作',
      width: '56px',
      render: (u) => (
        <button type="button" className="admin-text-action" onClick={() => void openDrawer(u)}>
          处置
        </button>
      ),
    },
  ];

  /* 叠加提示：新处置比现有处置轻时，账号状态仍取最严 */
  const stackingHint =
    drawerUser?.active_disposal &&
    stricterLevel(level, drawerUser.active_disposal.level) === drawerUser.active_disposal.level &&
    level !== drawerUser.active_disposal.level
      ? `账号当前处于「${DISPOSAL_ACTION_LABEL[drawerUser.active_disposal.level]}」，新处置将叠加，账号状态仍取最严：${DISPOSAL_ACTION_LABEL[drawerUser.active_disposal.level]}`
      : null;

  return (
    <>
      <PageHeader title="用户处置" description="警告 → 功能限制 → 禁言 → 封禁；多级叠加取最严，处置可撤销" />

      <div className={s.filterBar}>
        <SearchInput
          value={keywordInput}
          onChange={setKeywordInput}
          onSubmit={() => {
            setKeyword(keywordInput.trim());
            setSearchParams(keywordInput.trim() ? { keyword: keywordInput.trim() } : {});
          }}
          placeholder="用户 ID / 手机号 / 昵称 / 账号"
        />
        <Select
          value={state}
          onChange={(v) => setState(v as UserAccountState | 'all')}
          options={[
            { value: 'all', label: '全部状态' },
            ...(Object.keys(USER_STATE_LABEL) as UserAccountState[]).map((v) => ({
              value: v,
              label: USER_STATE_LABEL[v],
            })),
          ]}
        />
        <Button
          size="sm"
          variant="ghost"
          icon={<RotateCcw size={13} />}
          onClick={() => {
            setKeywordInput('');
            setKeyword('');
            setState('all');
            setSearchParams({});
          }}
        >
          重置
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={users}
        rowKey={(u) => u.user_id}
        loading={loading}
        emptyText="没有符合条件的用户"
      />

      {/* 处置抽屉 */}
      <Drawer
        open={drawerUser !== null}
        title={drawerUser ? `用户处置：${drawerUser.nickname}` : '用户处置'}
        subtitle={drawerUser ? `@${drawerUser.handle} · ${drawerUser.user_id}` : undefined}
        onClose={() => setDrawerUser(null)}
        width="560px"
        footer={
          <>
            <Button onClick={() => setDrawerUser(null)}>取消</Button>
            <Button variant="primary" loading={submitting} onClick={submit}>
              确认处置
            </Button>
          </>
        }
      >
        {drawerUser ? (
          <div className={s.drawerBody}>
            <section className={s.section}>
              <h3 className={s.sectionTitle}>账号信息</h3>
              <KeyValue
                columns={2}
                items={[
                  { label: '昵称', value: drawerUser.nickname },
                  { label: '账号', value: `@${drawerUser.handle}` },
                  { label: '手机号', value: drawerUser.phone_masked },
                  { label: '账号状态', value: USER_STATE_LABEL[drawerUser.account_state] },
                  { label: '注册时间', value: formatDateTime(drawerUser.registered_at) },
                  { label: '发布 / 被举报', value: `${drawerUser.post_count} / ${drawerUser.report_received}` },
                ]}
              />
            </section>

            <section className={s.section}>
              <h3 className={s.sectionTitle}>处置记录</h3>
              {history.length === 0 ? (
                <p className={s.emptyHistory}>暂无处置记录</p>
              ) : (
                <ul className={s.historyList}>
                  {history.map((a) => (
                    <li key={a.action_id} className={s.historyItem}>
                      <div className={s.historyHead}>
                        <span className={s.historyAction}>{DISPOSAL_ACTION_LABEL[a.action]}</span>
                        <span className="admin-id">{formatShortDateTime(a.created_at)}</span>
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
                      </div>
                      <p className={s.historyBasis}>{a.basis}</p>
                      <div className={s.historyMeta}>
                        <span className="admin-id">{a.reason_category}</span>
                        <span className="admin-id">
                          {a.expires_at ? `到期 ${formatShortDateTime(a.expires_at)}` : '长期'}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={s.section}>
              <h3 className={s.sectionTitle}>执行处置</h3>
              {stackingHint ? <p className={s.stackingHint}>{stackingHint}</p> : null}

              <Field label="处置等级" required>
                <Segmented
                  value={level}
                  onChange={setLevel}
                  options={USER_DISPOSAL_LEVELS.map((v) => ({
                    value: v,
                    label: DISPOSAL_ACTION_LABEL[v],
                    description: LEVEL_DESC[v],
                  }))}
                />
              </Field>

              {level === 'restrict' ? (
                <Field label="限制的功能" required hint="可多选">
                  <div className={s.featureRow}>
                    {(Object.keys(FEATURE_LABEL) as RestrictedFeature[]).map((f) => (
                      <Checkbox
                        key={f}
                        checked={features.includes(f)}
                        onChange={() => toggleFeature(f)}
                        label={FEATURE_LABEL[f]}
                      />
                    ))}
                  </div>
                </Field>
              ) : null}

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
                  placeholder="说明处置理由，将写入处置记录与日志"
                />
              </Field>

              <div className={s.formRow}>
                <Field label="处置来源">
                  <Select value={source} onChange={(v) => setSource(v as ActionSource)} options={SOURCE_OPTIONS} />
                </Field>
                <Field
                  label="到期时间"
                  hint={level === 'warning' ? '警告不设到期' : '留空 = 永久'}
                >
                  <TextInput
                    type="datetime-local"
                    value={expires}
                    onChange={setExpires}
                    disabled={level === 'warning'}
                  />
                </Field>
              </div>

              <Checkbox
                checked={notify}
                onChange={setNotify}
                label="通知被处置人（默认开启，站内信 + 推送）"
              />

              {error ? <p className={s.error}>{error}</p> : null}
            </section>
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={revokeTarget !== null}
        title="确认撤销该用户处置？"
        message={
          revokeTarget
            ? `将撤销对「${revokeTarget.object_label}」的「${DISPOSAL_ACTION_LABEL[revokeTarget.action]}」，账号状态按剩余处置重算，并留痕。`
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
