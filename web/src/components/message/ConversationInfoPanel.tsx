import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BellOff,
  LogOut,
  Pin,
  Search,
  ShieldOff,
  Trash2,
  UserPlus,
  CheckCheck,
} from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { toast } from '@/stores/toastStore';
import { useConversationStore } from '@/stores/conversationStore';
import type { Conversation, GroupMember } from '@/types/message';
import styles from './ConversationInfoPanel.module.css';

interface ConversationInfoPanelProps {
  open: boolean;
  conversation: Conversation;
  members: GroupMember[];
  onClose: () => void;
  onLeft: () => void;
}

/**
 * 会话详情面板
 * 承载两个界面：
 *   · 群聊设置页 —— 群名 / 成员 / 公告 / 退群
 *   · 会话设置页 —— 免打扰、拉黑、举报入口的承载页
 * 单聊与群聊共用一个面板，按 kind 分支渲染。
 */
export function ConversationInfoPanel({
  open,
  conversation,
  members,
  onClose,
  onLeft,
}: ConversationInfoPanelProps) {
  const navigate = useNavigate();
  const settings = useConversationStore((s) => s.settings[conversation.conversation_id]);
  const updateSettings = useConversationStore((s) => s.updateSettings);
  const leave = useConversationStore((s) => s.leave);

  const [confirm, setConfirm] = useState<'leave' | 'block' | 'clear' | null>(null);
  const [memberQuery, setMemberQuery] = useState('');

  useEffect(() => {
    if (!open) setMemberQuery('');
  }, [open]);

  if (!settings) return null;

  const isGroup = conversation.kind === 'group';

  const filteredMembers = memberQuery.trim()
    ? members.filter(
        (m) =>
          m.nickname.toLowerCase().includes(memberQuery.trim().toLowerCase()) ||
          m.handle.toLowerCase().includes(memberQuery.trim().toLowerCase()),
      )
    : members;

  return (
    <>
      <Modal open={open} onClose={onClose} size="sm" title={isGroup ? '群聊设置' : '会话设置'}>
        {/* ---------- 头部卡 ---------- */}
        <div className={styles.head}>
          <span className={styles.head__avatar}>
            <img src={conversation.avatar_url} alt="" />
          </span>
          <span className={styles.head__title}>{conversation.title}</span>
          <span className={styles.head__sub}>
            {isGroup
              ? `${conversation.member_count} 位成员`
              : `@${conversation.peer_handle ?? ''}`}
          </span>
          {!isGroup ? (
            <button
              type="button"
              className={styles.head__link}
              onClick={() => {
                onClose();
                navigate(`/u/${conversation.peer_handle}`);
              }}
            >
              查看主页
            </button>
          ) : null}
        </div>

        {/* ---------- 通用开关组 ---------- */}
        <div className={styles.group}>
          <SettingRow
            icon={Pin}
            label="置顶会话"
            desc="置顶后会固定显示在消息列表顶部"
            control={
              <Switch
                checked={settings.pinned}
                onChange={(v) => updateSettings(conversation.conversation_id, { pinned: v })}
              />
            }
          />
          <SettingRow
            icon={BellOff}
            label="消息免打扰"
            desc={settings.muted ? `已开启 · 免打扰时段 ${settings.quiet_hours ?? '全天'}` : '开启后不再弹出通知'}
            control={
              <Switch
                checked={settings.muted}
                onChange={(v) =>
                  updateSettings(conversation.conversation_id, {
                    muted: v,
                    quiet_hours: v ? '22:00–08:00' : null,
                  })
                }
              />
            }
          />
          <SettingRow
            icon={CheckCheck}
            label="显示已读回执"
            desc="关闭后对方看不到你的已读状态"
            control={
              <Switch
                checked={settings.read_receipts}
                onChange={(v) =>
                  updateSettings(conversation.conversation_id, { read_receipts: v })
                }
              />
            }
          />
        </div>

        {/* ---------- 群成员 ---------- */}
        {isGroup ? (
          <div className={styles.group}>
            <div className={styles.group__label}>群成员 · {members.length}</div>

            <div className={styles.memberSearch}>
              <Search size={15} strokeWidth={2} aria-hidden />
              <input
                value={memberQuery}
                onChange={(e) => setMemberQuery(e.target.value)}
                placeholder="搜索成员"
                aria-label="搜索群成员"
              />
            </div>

            <div className={styles.members}>
              {filteredMembers.map((m) => (
                <span key={m.user_id} className={styles.member}>
                  <span className={styles.member__avatar}>
                    <img src={m.avatar_url} alt="" loading="lazy" />
                    {m.online ? <span className={styles.member__online} /> : null}
                  </span>
                  <span className={styles.member__name}>{m.nickname}</span>
                  {m.role !== 'member' ? (
                    <span className={styles.member__role}>
                      {m.role === 'owner' ? '群主' : '管理员'}
                    </span>
                  ) : null}
                </span>
              ))}
              {filteredMembers.length === 0 ? (
                <div className={styles.members__empty}>没有匹配的成员</div>
              ) : null}
            </div>

            <button
              type="button"
              className={styles.group__action}
              onClick={() => toast.show('邀请成员（Demo 未接入真实邀请流）')}
            >
              <UserPlus size={17} strokeWidth={1.9} aria-hidden />
              邀请成员加入
            </button>
          </div>
        ) : null}

        {/* ---------- 危险操作 ---------- */}
        <div className={styles.group}>
          {!isGroup ? (
            <button
              type="button"
              className={[styles.group__action, styles['group__action--danger']].join(' ')}
              onClick={() => setConfirm('block')}
            >
              <ShieldOff size={17} strokeWidth={1.9} aria-hidden />
              拉黑并举报
            </button>
          ) : null}

          <button
            type="button"
            className={styles.group__action}
            onClick={() => setConfirm('clear')}
          >
            <Trash2 size={17} strokeWidth={1.9} aria-hidden />
            清空聊天记录
          </button>

          <button
            type="button"
            className={[styles.group__action, styles['group__action--danger']].join(' ')}
            onClick={() => setConfirm('leave')}
          >
            <LogOut size={17} strokeWidth={1.9} aria-hidden />
            {isGroup ? '退出群聊' : '删除会话'}
          </button>
        </div>
      </Modal>

      {/* ---------- 二次确认 ---------- */}
      <ConfirmDialog
        open={confirm === 'leave'}
        onClose={() => setConfirm(null)}
        danger
        title={isGroup ? `退出「${conversation.title}」？` : '删除这个会话？'}
        confirmText={isGroup ? '退出群聊' : '删除会话'}
        description={
          isGroup
            ? '退出后你将不再收到该群的消息，历史记录会从你的消息列表中移除。群内其他成员不会收到通知。'
            : '删除后该会话会从消息列表中移除，对方不会被通知。如果对方再次给你发消息，会话会重新出现。'
        }
        onConfirm={() => {
          setConfirm(null);
          leave(conversation.conversation_id);
          onLeft();
        }}
      />

      <ConfirmDialog
        open={confirm === 'block'}
        onClose={() => setConfirm(null)}
        danger
        title={`拉黑 @${conversation.peer_handle ?? ''}？`}
        confirmText="拉黑"
        description="拉黑后 TA 无法给你发消息，会话会从列表中移除。你可以随时在「设置 → 隐私 → 黑名单」中解除。"
        onConfirm={() => {
          setConfirm(null);
          leave(conversation.conversation_id);
          toast.success(`已拉黑 @${conversation.peer_handle ?? ''}，并已举报该会话`);
          onLeft();
        }}
      />

      <ConfirmDialog
        open={confirm === 'clear'}
        onClose={() => setConfirm(null)}
        title="清空聊天记录？"
        confirmText="清空"
        description="仅清空你这边的记录，对方仍能看到完整的聊天内容。此操作无法撤销。"
        onConfirm={() => {
          setConfirm(null);
          toast.success('聊天记录已清空');
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function SettingRow({
  icon: Icon,
  label,
  desc,
  control,
}: {
  icon: typeof Pin;
  label: string;
  desc?: string;
  control: React.ReactNode;
}) {
  return (
    <div className={styles.row}>
      <span className={styles.row__icon} aria-hidden>
        <Icon size={17} strokeWidth={1.9} />
      </span>
      <span className={styles.row__body}>
        <span className={styles.row__label}>{label}</span>
        {desc ? <span className={styles.row__desc}>{desc}</span> : null}
      </span>
      <span className={styles.row__control}>{control}</span>
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={[styles.switch, checked ? styles['switch--on'] : ''].filter(Boolean).join(' ')}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.switch__knob} />
    </button>
  );
}
