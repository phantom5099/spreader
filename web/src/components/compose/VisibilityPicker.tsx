import { useState } from 'react';
import { Globe, Users, UserCheck, Lock, Check, Search } from 'lucide-react';
import { Modal, modalStyles } from '@/components/common/Modal';
import { MENTION_POOL } from '@/mocks/media';
import { avatarDataUri } from '@/mocks/placeholders';
import type { Visibility } from '@/types/feed';

interface VisibilityOption {
  key: Visibility;
  label: string;
  desc: string;
  icon: typeof Globe;
}

const OPTIONS: VisibilityOption[] = [
  { key: 'public', label: '公开可见', desc: '所有人都可以看到这条动态', icon: Globe },
  { key: 'followers', label: '仅关注者可见', desc: '只有关注了你的人可以看到', icon: Users },
  { key: 'mutual', label: '仅互关好友可见', desc: '只有与你互相关注的人可以看到', icon: UserCheck },
  { key: 'specified', label: '指定好友可见', desc: '只有你选择的人可以看到', icon: UserCheck },
  { key: 'private', label: '仅自己可见', desc: '不会出现在任何人的信息流中', icon: Lock },
];

interface VisibilityPickerProps {
  open: boolean;
  value: Visibility;
  visibleTo: string[];
  onChange: (v: Visibility, ids: string[]) => void;
  onClose: () => void;
}

/** 可见范围选择器 */
export function VisibilityPicker({
  open,
  value,
  visibleTo,
  onChange,
  onClose,
}: VisibilityPickerProps) {
  const [pending, setPending] = useState<Visibility>(value);
  const [picked, setPicked] = useState<string[]>(visibleTo);
  const [query, setQuery] = useState('');

  const confirm = () => {
    onChange(pending, pending === 'specified' ? picked : []);
    onClose();
  };

  const filtered = MENTION_POOL.filter(
    (u) =>
      !query ||
      u.nickname.includes(query) ||
      u.handle.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="谁可以看这条动态"
      size="sm"
      footer={
        <button
          type="button"
          className={`${modalStyles.btn} ${modalStyles['btn--primary']}`}
          onClick={confirm}
        >
          完成
        </button>
      }
    >
      <div style={{ padding: '4px 0' }}>
        {OPTIONS.map((opt) => {
          const active = pending === opt.key;
          const Icon = opt.icon;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setPending(opt.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                padding: '12px 16px',
                textAlign: 'left',
                background: 'transparent',
              }}
            >
              <span
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 34,
                  height: 34,
                  flex: '0 0 auto',
                  borderRadius: 9999,
                  background: active ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <Icon size={18} strokeWidth={1.9} aria-hidden />
              </span>

              <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontWeight: 700,
                    fontSize: 'var(--font-base)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {opt.label}
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: 'var(--font-sm)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {opt.desc}
                </span>
              </span>

              <span
                style={{
                  flex: '0 0 auto',
                  width: 22,
                  height: 22,
                  borderRadius: 9999,
                  border: active ? 'none' : '1.5px solid var(--border-strong)',
                  background: active ? 'var(--accent)' : 'transparent',
                  color: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {active ? <Check size={14} strokeWidth={3} aria-hidden /> : null}
              </span>
            </button>
          );
        })}

        {/* 指定好友：展开选人 */}
        {pending === 'specified' ? (
          <div style={{ borderTop: '1px solid var(--border)', padding: '8px 16px 12px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                height: 38,
                padding: '0 12px',
                borderRadius: 9999,
                background: 'var(--bg-elevated)',
                marginBottom: 8,
              }}
            >
              <Search size={16} strokeWidth={2} color="var(--text-secondary)" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索好友"
                aria-label="搜索好友"
                style={{
                  flex: '1 1 auto',
                  minWidth: 0,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: 'var(--font-sm)',
                }}
              />
            </div>

            {picked.length > 0 ? (
              <p style={{ fontSize: 'var(--font-xs)', color: 'var(--accent)', marginBottom: 6 }}>
                已选 {picked.length} 人
              </p>
            ) : null}

            {filtered.map((u) => {
              const on = picked.includes(u.handle);
              return (
                <button
                  key={u.handle}
                  type="button"
                  onClick={() =>
                    setPicked((p) => (on ? p.filter((x) => x !== u.handle) : [...p, u.handle]))
                  }
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '7px 0',
                    textAlign: 'left',
                  }}
                >
                  <img
                    src={avatarDataUri(u.handle, u.nickname)}
                    alt=""
                    width={36}
                    height={36}
                    style={{ borderRadius: 9999, flex: '0 0 auto' }}
                  />
                  <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, fontSize: 'var(--font-sm)' }}>
                      {u.nickname}
                    </span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 'var(--font-xs)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      @{u.handle}
                    </span>
                  </span>
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 9999,
                      border: on ? 'none' : '1.5px solid var(--border-strong)',
                      background: on ? 'var(--accent)' : 'transparent',
                      color: '#fff',
                      display: 'grid',
                      placeItems: 'center',
                      flex: '0 0 auto',
                    }}
                  >
                    {on ? <Check size={12} strokeWidth={3} aria-hidden /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
