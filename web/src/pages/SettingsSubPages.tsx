import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info, Lock, Mail, Phone, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { SettingsGroup, SettingsRow, SettingsSwitch } from '@/components/settings/SettingsRow';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { toast } from '@/stores/toastStore';
import { CURRENT_USER, CURRENT_USER_CONTACTS } from '@/mocks/currentUser';
import {
  INTEREST_TOPICS,
  MY_INTERESTS,
  MY_TAGS,
  NOTIFICATION_SETTINGS,
  QUIET_HOURS,
} from '@/mocks/settings';
import styles from './SettingsSubPage.module.css';

/* -------------------------------------------------------------------------- */
/*  账号设置                                                                    */
/* -------------------------------------------------------------------------- */

export function SettingsAccountPage() {
  const navigate = useNavigate();
  const phone = CURRENT_USER_CONTACTS.phone;
  const [email, setEmail] = useState(CURRENT_USER_CONTACTS.email);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.page__main}>
          <PageHeader title="账号" onBack={() => navigate('/settings')} />

          <div className={styles.card}>
            <span className={styles.card__avatar}>
              <img src={CURRENT_USER.avatar_url} alt="" />
            </span>
            <span className={styles.card__body}>
              <span className={styles.card__name}>{CURRENT_USER.nickname}</span>
              <span className={styles.card__sub}>@{CURRENT_USER.handle}</span>
            </span>
            <button type="button" className={styles.card__btn} onClick={() => navigate('/me')}>
              编辑资料
            </button>
          </div>

          <SettingsGroup title="登录方式">
            <SettingsRow
              icon={<Phone size={19} strokeWidth={1.9} />}
              label="手机号"
              desc={phone}
              control={<span className={styles.link}>更换</span>}
              onClick={() => toast.show('更换手机号（Demo 未接入短信流）')}
            />
            <SettingsRow
              icon={<Mail size={19} strokeWidth={1.9} />}
              label="邮箱"
              desc={email}
              control={<span className={styles.link}>更换</span>}
              onClick={() => {
                setEmail(
                  email === CURRENT_USER_CONTACTS.email
                    ? CURRENT_USER_CONTACTS.backupEmail
                    : CURRENT_USER_CONTACTS.email,
                );
                toast.success('已切换备用邮箱（Demo）');
              }}
            />
          </SettingsGroup>

          <SettingsGroup title="账号安全">
            <SettingsRow
              icon={<Lock size={19} strokeWidth={1.9} />}
              label="修改密码"
              to="/settings/privacy"
            />
            <SettingsRow
              icon={<ShieldCheck size={19} strokeWidth={1.9} />}
              label="两步验证"
              desc="未开启，建议开启以提高账号安全性"
              control={<span className={styles.link}>去开启</span>}
              onClick={() => toast.show('两步验证（Demo 未实现）')}
            />
          </SettingsGroup>

          <SettingsGroup title="注销">
            <SettingsRow
              icon={<Trash2 size={19} strokeWidth={1.9} />}
              label="注销账号"
              desc="永久删除账号与全部内容，不可恢复"
              danger
              to="/settings/deactivate"
            />
          </SettingsGroup>

          <div className={styles.tail} />
        </div>
      </div>
    </AppShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  偏好设置                                                                    */
/* -------------------------------------------------------------------------- */

export function SettingsPreferencesPage() {
  const navigate = useNavigate();
  const [picked, setPicked] = useState<Set<string>>(new Set(MY_INTERESTS));
  const [personalize, setPersonalize] = useState(true);
  const [allowFollowSuggest, setAllowFollowSuggest] = useState(true);

  const toggle = (t: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.page__main}>
          <PageHeader title="偏好设置" onBack={() => navigate('/settings')} />

          <SettingsGroup
            title="内容类别"
            desc={`选择你感兴趣的方向（已选 ${picked.size} 个）。至少要选 1 个才能开启个性化推荐。`}
          >
            <div className={styles.chips}>
              {INTEREST_TOPICS.map((t) => {
                const on = picked.has(t);
                return (
                  <button
                    key={t}
                    type="button"
                    className={[styles.chip, on ? styles['chip--on'] : ''].filter(Boolean).join(' ')}
                    aria-pressed={on}
                    onClick={() => toggle(t)}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </SettingsGroup>

          <SettingsGroup title="推荐">
            <SettingsRow
              label="个性化推荐"
              desc="根据你的兴趣标签与互动记录调整推荐排序"
              control={
                <SettingsSwitch
                  checked={personalize}
                  disabled={picked.size === 0}
                  onChange={setPersonalize}
                />
              }
            />
            <SettingsRow
              label="推荐你可能认识的人"
              desc="基于共同关注与通讯录匹配"
              control={<SettingsSwitch checked={allowFollowSuggest} onChange={setAllowFollowSuggest} />}
            />
          </SettingsGroup>

          <SettingsGroup title="内容偏好">
            <SettingsRow
              label="查看更多可能敏感的内容"
              desc="关闭后，被标记为敏感的内容默认折叠"
              control={<SettingsSwitch checked={false} onChange={() => toast.show('已更新内容偏好')} />}
            />
            <SettingsRow
              label="隐藏转发内容"
              desc="信息流中不展示他人转推的动态"
              control={<SettingsSwitch checked={false} onChange={() => toast.show('已更新内容偏好')} />}
            />
          </SettingsGroup>

          <div className={styles.tail} />
        </div>
      </div>
    </AppShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  通知设置                                                                    */
/* -------------------------------------------------------------------------- */

export function SettingsNotificationsPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NOTIFICATION_SETTINGS.flatMap((g) => g.rows.map((r) => [r.key, r.on]))),
  );
  const [quiet, setQuiet] = useState(true);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.page__main}>
          <PageHeader title="通知设置" onBack={() => navigate('/settings')} />

          <SettingsGroup
            title="免打扰"
            desc="开启后，指定时段内不再弹出推送；消息仍会正常接收并标记未读。"
          >
            <SettingsRow
              label="免打扰时段"
              desc={quiet ? `每天 ${QUIET_HOURS.start} – 次日 ${QUIET_HOURS.end}` : '当前关闭'}
              control={<SettingsSwitch checked={quiet} onChange={setQuiet} />}
            />
          </SettingsGroup>

          {NOTIFICATION_SETTINGS.map((g) => (
            <SettingsGroup key={g.title} title={g.title}>
              {g.rows.map((r) => (
                <SettingsRow
                  key={r.key}
                  label={r.label}
                  desc={r.desc}
                  control={
                    <SettingsSwitch
                      checked={state[r.key] ?? false}
                      onChange={(v) => setState((prev) => ({ ...prev, [r.key]: v }))}
                    />
                  }
                />
              ))}
            </SettingsGroup>
          ))}

          <div className={styles.tail} />
        </div>
      </div>
    </AppShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  隐私与安全                                                                  */
/* -------------------------------------------------------------------------- */

export function SettingsPrivacyPage() {
  const navigate = useNavigate();
  const [onlineStatus, setOnlineStatus] = useState(true);
  const [privateAccount, setPrivateAccount] = useState(false);
  const [dmFromAnyone, setDmFromAnyone] = useState(false);
  const [searchable, setSearchable] = useState(true);
  const [blockOpen, setBlockOpen] = useState(false);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.page__main}>
          <PageHeader title="隐私与安全" onBack={() => navigate('/settings')} />

          <SettingsGroup
            title="账号可见性"
            desc="私密账号的动态只有已通过你确认的关注者才能看到。"
          >
            <SettingsRow
              label="私密账号"
              desc="开启后，新的关注需要你逐一确认"
              control={<SettingsSwitch checked={privateAccount} onChange={setPrivateAccount} />}
            />
            <SettingsRow
              label="在线状态"
              desc="关闭后，所有人（包括已关注的人）都看不到你是否在线"
              control={<SettingsSwitch checked={onlineStatus} onChange={setOnlineStatus} />}
            />
            <SettingsRow
              label="在搜索结果中显示"
              desc="关闭后，其他人无法通过昵称或用户名搜到你"
              control={<SettingsSwitch checked={searchable} onChange={setSearchable} />}
            />
          </SettingsGroup>

          <SettingsGroup title="互动与消息">
            <SettingsRow
              label="允许陌生人发私信"
              desc="关闭后，只有你关注的人可以给你发消息"
              control={<SettingsSwitch checked={dmFromAnyone} onChange={setDmFromAnyone} />}
            />
            <SettingsRow
              label="过滤低质量回复"
              desc="自动折叠疑似垃圾或重复的回复"
              control={<SettingsSwitch checked onChange={() => toast.show('已更新过滤设置')} />}
            />
          </SettingsGroup>

          <SettingsGroup title="关系管理">
            <SettingsRow
              icon={<ShieldCheck size={19} strokeWidth={1.9} />}
              label="黑名单"
              desc="管理被你拉黑的账号"
              to="/settings/lists/topics"
              control={<span className={styles.link}>管理</span>}
            />
            <SettingsRow
              label="解除全部拉黑"
              danger
              onClick={() => setBlockOpen(true)}
              control={<span className={styles.link}>解除</span>}
            />
          </SettingsGroup>

          <SettingsGroup title="登录与安全">
            <SettingsRow
              icon={<UserRound size={19} strokeWidth={1.9} />}
              label="登录设备管理"
              desc="当前有 2 台设备处于登录状态"
              to="/settings/account"
            />
            <SettingsRow
              label="双重验证"
              desc="未开启"
              control={<span className={styles.link}>开启</span>}
              onClick={() => toast.show('双重验证（Demo 未实现）')}
            />
          </SettingsGroup>

          <div className={styles.tail} />
        </div>
      </div>

      <ConfirmDialog
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        danger
        title="解除全部拉黑？"
        confirmText="全部解除"
        description="解除后，这些人可以重新关注你、查看你的动态并向你发消息。此操作会一次性作用于黑名单中的全部账号。"
        onConfirm={() => {
          setBlockOpen(false);
          toast.success('已解除全部拉黑');
        }}
      />
    </AppShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  个性化标签管理                                                         */
/* -------------------------------------------------------------------------- */

export function SettingsTagsPage() {
  const navigate = useNavigate();
  const [tags, setTags] = useState<string[]>(MY_TAGS);
  const [clearOpen, setClearOpen] = useState(false);

  const remove = (t: string) => {
    setTags((prev) => prev.filter((x) => x !== t));
    toast.show(`已移除标签「${t}」，推荐结果会随之调整`);
  };

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.page__main}>
          <PageHeader
            title="个性化标签"
            onBack={() => navigate('/settings')}
            actions={
              <button
                type="button"
                className={styles.headAction}
                disabled={tags.length === 0}
                onClick={() => setClearOpen(true)}
              >
                一键清空
              </button>
            }
          />

          <SettingsGroup
            title={`已生成 ${tags.length} 个标签`}
            desc="这些标签由你的浏览与互动行为自动生成，用于调整推荐排序。移除某个标签后，相关内容会相应减少。"
          >
            {tags.length === 0 ? (
              <div className={styles.emptyTags}>
                <Info size={24} strokeWidth={1.6} aria-hidden />
                <span className={styles.emptyTags__title}>还没有生成标签</span>
                <span className={styles.emptyTags__desc}>
                  多浏览和互动一段时间后，系统会自动为你生成兴趣标签。
                </span>
              </div>
            ) : (
              <div className={styles.chips}>
                {tags.map((t) => (
                  <span key={t} className={styles.tag}>
                    {t}
                    <button
                      type="button"
                      className={styles.tag__x}
                      aria-label={`移除标签 ${t}`}
                      onClick={() => remove(t)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </SettingsGroup>

          <SettingsGroup>
            <SettingsRow
              label="关闭个性化推荐"
              desc="关闭后，推荐流将不再参考你的兴趣标签"
              control={<SettingsSwitch checked={false} onChange={() => toast.show('已更新推荐设置')} />}
            />
            <SettingsRow
              label="下载我的数据"
              desc="导出一份包含你的动态与互动的归档文件"
              to="/settings/about"
            />
          </SettingsGroup>

          <div className={styles.tail} />
        </div>
      </div>

      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        danger
        title="清空全部个性化标签？"
        confirmText="全部清空"
        description="清空后，推荐流会在接下来一段时间内重新学习你的兴趣，短期内推荐准确度可能下降。"
        onConfirm={() => {
          setTags([]);
          setClearOpen(false);
          toast.success('已清空全部个性化标签');
        }}
      />
    </AppShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  账号注销                                                                    */
/* -------------------------------------------------------------------------- */

const LOSSES = [
  '你的全部动态、图片与视频将被永久删除',
  '所有关注关系、粉丝关系会同时解除',
  '私信与群聊记录将从所有成员侧消失',
  '收藏、草稿与个性化标签不可恢复',
  '用户名在冷静期结束后会被释放，可能被他人注册',
];

export function SettingsDeactivatePage() {
  const navigate = useNavigate();
  const [ack, setAck] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState('');

  const canProceed = ack && typed.trim() === CURRENT_USER.handle;

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.page__main}>
          <PageHeader title="注销账号" onBack={() => navigate('/settings')} />

          <div className={styles.warnBox}>
            <span className={styles.warnBox__icon} aria-hidden>
              <Trash2 size={22} strokeWidth={1.9} />
            </span>
            <h2 className={styles.warnBox__title}>注销后无法恢复</h2>
            <p className={styles.warnBox__desc}>
              请确认你已阅读并理解下面的影响。注销申请提交后会进入
              <strong> 30 天冷静期</strong>，期间你随时可以登录并撤销。
            </p>
          </div>

          <SettingsGroup title="注销将导致">
            {LOSSES.map((l) => (
              <div key={l} className={styles.lossRow}>
                <span className={styles.lossRow__dot} aria-hidden />
                <span className={styles.lossRow__text}>{l}</span>
              </div>
            ))}
          </SettingsGroup>

          <SettingsGroup title="确认注销">
            <label className={styles.ackRow}>
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
                className={styles.ackRow__box}
              />
              <span className={styles.ackRow__text}>
                我已了解上述影响，并确认注销这个账号。
              </span>
            </label>

            <div className={styles.typeRow}>
              <span className={styles.typeRow__label}>
                请输入你的用户名 <strong>@{CURRENT_USER.handle}</strong> 以继续
              </span>
              <input
                className={[
                  styles.typeRow__input,
                  typed && typed.trim() !== CURRENT_USER.handle ? styles['typeRow__input--bad'] : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={CURRENT_USER.handle}
              />
            </div>
          </SettingsGroup>

          <div className={styles.submitRow}>
            <button
              type="button"
              className={styles.submitRow__cancel}
              onClick={() => navigate('/settings')}
            >
              取消
            </button>
            <button
              type="button"
              className={styles.submitRow__danger}
              disabled={!canProceed}
              onClick={() => setConfirmOpen(true)}
            >
              提交注销申请
            </button>
          </div>

          <div className={styles.tail} />
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        danger
        title="最后确认：真的要注销吗？"
        confirmText="确认提交注销"
        description="提交后账号会立即进入 30 天冷静期，期间你的主页将显示为「已注销」。冷静期内登录即可撤销，逾期将永久删除全部数据。"
        onConfirm={() => {
          setConfirmOpen(false);
          toast.success('注销申请已提交，你可以在 30 天内登录撤销');
          navigate('/settings');
        }}
      />
    </AppShell>
  );
}
