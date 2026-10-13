import { FileText, Trash2, Image as ImageIcon, Film } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { draftPreview } from '@/utils/draft';
import type { Draft } from '@/types/draft';
import { formatRelativeTime } from '@/utils/format';
import styles from './DraftsModal.module.css';

interface DraftsModalProps {
  open: boolean;
  drafts: Draft[];
  currentId: string;
  onOpen: (draft: Draft) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

/** 草稿箱：媒体缩略图 + 首行文字 + 编辑时间 + 删除 */
export function DraftsModal({
  open,
  drafts,
  currentId,
  onOpen,
  onDelete,
  onClose,
}: DraftsModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="草稿箱" size="sm">
      {drafts.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.empty__icon} aria-hidden>
            <FileText size={26} strokeWidth={1.6} />
          </span>
          <div className={styles.empty__title}>还没有草稿</div>
          <p className={styles.empty__desc}>编辑中的内容会自动保存到这里。</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {drafts.map((d) => {
            const isCurrent = d.id === currentId;
            const first = d.media[0];
            return (
              <li key={d.id}>
                <div className={styles.item}>
                  <button
                    type="button"
                    className={styles.item__main}
                    onClick={() => onOpen(d)}
                    disabled={isCurrent}
                  >
                    <span className={styles.item__thumb}>
                      {first ? (
                        <img src={first.url} alt="" />
                      ) : (
                        <span className={styles.item__thumbEmpty}>
                          <FileText size={18} strokeWidth={1.7} aria-hidden />
                        </span>
                      )}
                      {first?.kind === 'video' ? (
                        <span className={styles.item__kind}>
                          <Film size={11} strokeWidth={2.4} aria-hidden />
                        </span>
                      ) : first ? (
                        <span className={styles.item__kind}>
                          <ImageIcon size={11} strokeWidth={2.4} aria-hidden />
                        </span>
                      ) : null}
                    </span>

                    <span className={styles.item__body}>
                      <span className={styles.item__text}>{draftPreview(d)}</span>
                      <span className={styles.item__meta}>
                        {formatRelativeTime(new Date(d.updatedAt).toISOString())}前编辑
                        {isCurrent ? ' · 编辑中' : ''}
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className={styles.item__delete}
                    aria-label="删除草稿"
                    onClick={() => onDelete(d.id)}
                  >
                    <Trash2 size={17} strokeWidth={1.9} aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
