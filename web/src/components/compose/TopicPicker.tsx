import { useState } from 'react';
import { Hash, Check, Search, Plus } from 'lucide-react';
import { Modal, modalStyles } from '@/components/common/Modal';
import { TOPIC_POOL } from '@/mocks/media';
import { formatCount } from '@/utils/format';

interface TopicPickerProps {
  open: boolean;
  selected: string[];
  onChange: (topics: string[]) => void;
  onClose: () => void;
}

/** 话题选择器（最多 5 个） */
export function TopicPicker({ open, selected, onChange, onClose }: TopicPickerProps) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>(selected);

  const MAX = 5;
  const filtered = TOPIC_POOL.filter((t) => !query || t.topic.includes(query));
  const canCreate = query.trim().length > 0 && !TOPIC_POOL.some((t) => t.topic === query.trim());

  const toggle = (topic: string) => {
    setPicked((p) => {
      if (p.includes(topic)) return p.filter((x) => x !== topic);
      if (p.length >= MAX) return p;
      return [...p, topic];
    });
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    padding: '11px 16px',
    textAlign: 'left',
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="添加话题"
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
            placeholder="搜索或创建话题"
            aria-label="搜索话题"
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
        {canCreate ? (
          <button
            type="button"
            style={rowStyle}
            onClick={() => {
              toggle(query.trim());
              setQuery('');
            }}
          >
            <span
              style={{
                display: 'grid',
                placeItems: 'center',
                width: 34,
                height: 34,
                borderRadius: 9999,
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
                flex: '0 0 auto',
              }}
            >
              <Plus size={17} strokeWidth={2.2} aria-hidden />
            </span>
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 'var(--font-sm)' }}>
                创建新话题
              </span>
              <span
                style={{
                  display: 'block',
                  fontSize: 'var(--font-xs)',
                  color: 'var(--text-secondary)',
                }}
              >
                #{query.trim()}
              </span>
            </span>
          </button>
        ) : null}

        {filtered.map((t) => {
          const on = picked.includes(t.topic);
          return (
            <button key={t.topic} type="button" style={rowStyle} onClick={() => toggle(t.topic)}>
              <span
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 34,
                  height: 34,
                  borderRadius: 9999,
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)',
                  flex: '0 0 auto',
                }}
              >
                <Hash size={17} strokeWidth={2} aria-hidden />
              </span>
              <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 'var(--font-sm)' }}>
                  {t.topic}
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: 'var(--font-xs)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {formatCount(t.post_count)} 条动态
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

        {filtered.length === 0 && !canCreate ? (
          <p
            style={{
              padding: '20px 16px',
              textAlign: 'center',
              fontSize: 'var(--font-sm)',
              color: 'var(--text-secondary)',
            }}
          >
            没有找到相关话题
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
