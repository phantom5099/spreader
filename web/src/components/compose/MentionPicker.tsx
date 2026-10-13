import { useState } from 'react';
import { Check, Search, AtSign } from 'lucide-react';
import { Modal, modalStyles } from '@/components/common/Modal';
import { MENTION_POOL } from '@/mocks/media';
import { avatarDataUri } from '@/mocks/placeholders';

interface MentionPickerProps {
  open: boolean;
  selected: string[];
  onChange: (handles: string[]) => void;
  onClose: () => void;
}

/** @提及选择器（最多 10 人） */
export function MentionPicker({ open, selected, onChange, onClose }: MentionPickerProps) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>(selected);

  const MAX = 10;
  const filtered = MENTION_POOL.filter(
    (u) =>
      !query ||
      u.nickname.includes(query) ||
      u.handle.toLowerCase().includes(query.toLowerCase()),
  );

  const toggle = (handle: string) => {
    setPicked((p) => {
      if (p.includes(handle)) return p.filter((x) => x !== handle);
      if (p.length >= MAX) return p;
      return [...p, handle];
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="提及某人"
      size="sm"
      footer={
        <>
          <span
            style={{
              flex: '1 1 auto',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-secondary)',
            }}
          >
            已选 {picked.length} / {MAX}
          </span>
          <button
            type="button"
            className={`${modalStyles.btn} ${modalStyles['btn--primary']}`}
            onClick={() => {
              onChange(picked);
              onClose();
            }}
          >
            完成
          </button>
        </>
      }
    >
      <div style={{ padding: '12px 16px 4px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 40,
            padding: '0 12px',
            borderRadius: 9999,
            background: 'var(--bg-elevated)',
          }}
        >
          <Search size={17} strokeWidth={2} color="var(--text-secondary)" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索用户"
            aria-label="搜索用户"
            autoFocus
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
      </div>

      <div style={{ paddingBottom: 8 }}>
        {filtered.map((u) => {
          const on = picked.includes(u.handle);
          return (
            <button
              key={u.handle}
              type="button"
              onClick={() => toggle(u.handle)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                padding: '9px 16px',
                textAlign: 'left',
              }}
            >
              <img
                src={avatarDataUri(u.handle, u.nickname)}
                alt=""
                width={40}
                height={40}
                style={{ borderRadius: 9999, flex: '0 0 auto' }}
              />
              <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 'var(--font-sm)' }}>
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
                  width: 22,
                  height: 22,
                  borderRadius: 9999,
                  border: on ? 'none' : '1.5px solid var(--border-strong)',
                  background: on ? 'var(--accent)' : 'transparent',
                  color: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  flex: '0 0 auto',
                }}
              >
                {on ? <Check size={14} strokeWidth={3} aria-hidden /> : null}
              </span>
            </button>
          );
        })}

        {filtered.length === 0 ? (
          <p
            style={{
              padding: '20px 16px',
              textAlign: 'center',
              fontSize: 'var(--font-sm)',
              color: 'var(--text-secondary)',
            }}
          >
            <AtSign size={20} strokeWidth={1.6} style={{ opacity: 0.5 }} aria-hidden />
            <br />
            没有找到相关用户
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
