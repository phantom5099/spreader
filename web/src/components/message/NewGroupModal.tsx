import { useEffect, useMemo, useState } from 'react';
import { Check, Search, Users } from 'lucide-react';
import { Modal, modalStyles } from '@/components/common/Modal';
import { toast } from '@/stores/toastStore';
import { useConversationStore } from '@/stores/conversationStore';
import { GROUP_CANDIDATES } from '@/mocks/messages';
import styles from './NewGroupModal.module.css';

interface NewGroupModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}

const MAX_MEMBERS = 20;

/**
 * 新建群聊选人（消息组）
 * 多选用户 → 下一步填群名 → 创建。
 * 两步走：选人 → 群名，避免一个弹窗里堆两种输入。
 */
export function NewGroupModal({ open, onClose, onCreated }: NewGroupModalProps) {
  const createGroup = useConversationStore((s) => s.createGroup);

  const [step, setStep] = useState<'pick' | 'name'>('pick');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (!open) return;
    setStep('pick');
    setQuery('');
    setSelected(new Set());
    setTitle('');
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GROUP_CANDIDATES;
    return GROUP_CANDIDATES.filter(
      (u) => u.nickname.toLowerCase().includes(q) || u.handle.toLowerCase().includes(q),
    );
  }, [query]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_MEMBERS) next.add(id);
      else toast.error(`一个群聊最多 ${MAX_MEMBERS} 人`);
      return next;
    });
  };

  const selectedUsers = GROUP_CANDIDATES.filter((u) => selected.has(u.user_id));
  const full = selected.size >= MAX_MEMBERS;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={step === 'pick' ? '选择群聊成员' : '设置群聊信息'}
      headActions={
        step === 'pick' ? (
          <button
            type="button"
            className={`${modalStyles.btn} ${modalStyles.btnPrimary ?? ''} ${modalStyles['btn--primary']}`}
            disabled={selected.size === 0}
            onClick={() => setStep('name')}
          >
            下一步{selected.size > 0 ? `（${selected.size}）` : ''}
          </button>
        ) : (
          <button
            type="button"
            className={`${modalStyles.btn} ${modalStyles['btn--primary']}`}
            disabled={!title.trim()}
            onClick={() => {
              const id = createGroup(title.trim(), selectedUsers.map((u) => u.avatar_url));
              toast.success('群聊已创建');
              onCreated(id);
              onClose();
            }}
          >
            创建
          </button>
        )
      }
    >
      {step === 'pick' ? (
        <div className={styles.pick}>
          {/* 已选头像条 */}
          {selectedUsers.length > 0 ? (
            <div className={styles.selectedBar}>
              {selectedUsers.map((u) => (
                <button
                  key={u.user_id}
                  type="button"
                  className={styles.selectedChip}
                  onClick={() => toggle(u.user_id)}
                  aria-label={`移除 ${u.nickname}`}
                >
                  <span className={styles.selectedChip__avatar}>
                    <img src={u.avatar_url} alt="" />
                  </span>
                  <span className={styles.selectedChip__name}>{u.nickname}</span>
                  <span className={styles.selectedChip__x}>×</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className={styles.search}>
            <Search size={16} strokeWidth={2} aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索用户"
              aria-label="搜索用户"
            />
          </div>

          <div className={styles.list}>
            {filtered.length === 0 ? (
              <div className={styles.list__empty}>没有匹配的用户</div>
            ) : (
              filtered.map((u) => {
                const on = selected.has(u.user_id);
                return (
                  <button
                    key={u.user_id}
                    type="button"
                    className={[styles.item, on ? styles['item--on'] : ''].filter(Boolean).join(' ')}
                    onClick={() => toggle(u.user_id)}
                  >
                    <span className={styles.item__avatar}>
                      <img src={u.avatar_url} alt="" loading="lazy" />
                    </span>
                    <span className={styles.item__body}>
                      <span className={styles.item__name}>{u.nickname}</span>
                      <span className={styles.item__handle}>@{u.handle}</span>
                    </span>
                    <span
                      className={[styles.item__check, on ? styles['item__check--on'] : '']
                        .filter(Boolean)
                        .join(' ')}
                      aria-hidden
                    >
                      {on ? <Check size={14} strokeWidth={3} /> : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className={styles.footer}>
            <span>
              已选 {selected.size}/{MAX_MEMBERS}
            </span>
            {full ? <span className={styles.footer__warn}>已达上限</span> : null}
          </div>
        </div>
      ) : (
        <div className={styles.nameStep}>
          <div className={styles.nameStep__preview}>
            <span className={styles.nameStep__icon} aria-hidden>
              <Users size={22} strokeWidth={1.9} />
            </span>
            <span className={styles.nameStep__stack}>
              {selectedUsers.slice(0, 5).map((u) => (
                <img key={u.user_id} src={u.avatar_url} alt="" />
              ))}
            </span>
            <span className={styles.nameStep__count}>{selectedUsers.length} 位成员</span>
          </div>

          <label className={styles.nameStep__field}>
            <span className={styles.nameStep__label}>
              群聊名称
              <span className={styles.nameStep__count2}>{title.length}/30</span>
            </span>
            <input
              className={styles.nameStep__input}
              value={title}
              maxLength={30}
              autoFocus
              placeholder="例如：周末爬山小分队"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <p className={styles.nameStep__hint}>
            创建后你将成为群主，可以随时在群聊设置中邀请成员或修改群名。
          </p>

          <button type="button" className={styles.nameStep__back} onClick={() => setStep('pick')}>
            返回修改成员
          </button>
        </div>
      )}
    </Modal>
  );
}
