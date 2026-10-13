import { useEffect, useMemo, useState } from 'react';
import { Globe, Lock, UserCheck, Users } from 'lucide-react';
import { Modal, modalStyles } from '@/components/common/Modal';
import { VisibilityPicker } from '@/components/compose/VisibilityPicker';
import { updatePostApi } from '@/mocks/api';
import { toast } from '@/stores/toastStore';
import { visibilityLabel } from '@/utils/format';
import type { FeedItem, Visibility } from '@/types/feed';
import styles from './EditPostModal.module.css';

const MAX_LENGTH = 2000;

interface EditPostModalProps {
  open: boolean;
  item: FeedItem;
  onClose: () => void;
  /** 保存成功回调，调用方用它更新列表里的那一条 */
  onSaved: (item: FeedItem) => void;
}

/** 可见范围图标 */
function VisIcon({ value }: { value: Visibility }) {
  const Icon =
    value === 'private'
      ? Lock
      : value === 'followers'
        ? Users
        : value === 'public'
          ? Globe
          : UserCheck;
  return <Icon size={16} strokeWidth={1.9} aria-hidden />;
}

/**
 * 编辑动态
 * 发布后的动态只开放「正文 + 可见范围」两项编辑 —— 媒体增删会牵动转码与审核，
 * 真实产品里也是走另一条重发布流程。
 */
export function EditPostModal({ open, item, onClose, onSaved }: EditPostModalProps) {
  const [text, setText] = useState(item.text);
  const [visibility, setVisibility] = useState<Visibility>(item.flags.visibility);
  const [visibleTo, setVisibleTo] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  /* 每次打开都用最新的动态内容回填 */
  useEffect(() => {
    if (!open) return;
    setText(item.text);
    setVisibility(item.flags.visibility);
    setVisibleTo([]);
    setPickerOpen(false);
    setSaving(false);
  }, [open, item]);

  const over = text.length > MAX_LENGTH;
  const changed = useMemo(
    () => text !== item.text || visibility !== item.flags.visibility,
    [text, item.text, visibility, item.flags.visibility],
  );
  const canSave = changed && !over && !saving;

  const save = () => {
    if (!canSave) return;
    setSaving(true);
    void updatePostApi(item.content_id, { text, visibility })
      .then((next) => {
        if (next) onSaved(next);
        toast.success('修改已保存');
        onClose();
      })
      .catch(() => {
        toast.error('保存失败，请重试');
        setSaving(false);
      });
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="md"
        title="编辑动态"
        closeOnOverlay={false}
        footer={
          <>
            <button
              type="button"
              className={`${modalStyles.btn} ${modalStyles['btn--ghost']}`}
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              className={`${modalStyles.btn} ${modalStyles['btn--primary']}`}
              disabled={!canSave}
              onClick={save}
            >
              {saving ? '保存中…' : '保存修改'}
            </button>
          </>
        }
      >
        <div className={styles.body}>
          <button
            type="button"
            className={styles.visibility}
            onClick={() => setPickerOpen(true)}
          >
            <span className={styles.visibility__icon}>
              <VisIcon value={visibility} />
            </span>
            <span className={styles.visibility__text}>
              <span className={styles.visibility__label}>{visibilityLabel(visibility)}</span>
              <span className={styles.visibility__desc}>点击修改谁可以看到这条动态</span>
            </span>
          </button>

          <label className={styles.field}>
            <textarea
              className={styles.textarea}
              value={text}
              rows={6}
              aria-label="动态正文"
              placeholder="说点什么…"
              onChange={(e) => setText(e.target.value)}
            />
            <span
              className={[styles.counter, over ? styles['counter--over'] : '']
                .filter(Boolean)
                .join(' ')}
            >
              {text.length} / {MAX_LENGTH}
            </span>
          </label>

          {item.media.length > 0 ? (
            <p className={styles.note}>
              媒体内容（{item.media.length} 项）不支持在此修改，如需更换请删除后重新发布。
            </p>
          ) : null}
        </div>
      </Modal>

      <VisibilityPicker
        open={pickerOpen}
        value={visibility}
        visibleTo={visibleTo}
        onChange={(next, ids) => {
          setVisibility(next);
          setVisibleTo(ids);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}
