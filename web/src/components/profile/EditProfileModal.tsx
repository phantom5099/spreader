import { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import { Modal, modalStyles } from '@/components/common/Modal';
import { toast } from '@/stores/toastStore';
import { coverDataUri } from '@/mocks/users';
import { updateProfileApi } from '@/mocks/api';
import type { UserProfile } from '@/types/user';
import styles from './EditProfileModal.module.css';

interface EditProfileModalProps {
  open: boolean;
  profile: UserProfile;
  onClose: () => void;
  onSaved: (patch: Partial<UserProfile>) => void;
}

const MAX_NAME = 20;
const MAX_BIO = 160;

/**
 * 编辑资料（子流程）
 * 自己主页的关注按钮位置换成「编辑资料」。
 * 字段：封面 / 头像 / 昵称 / 简介 / 地区 / 链接。头像与封面在 Demo 中
 * 用「换一张」的重生成代替上传（保持不依赖外部资源）。
 */
export function EditProfileModal({ open, profile, onClose, onSaved }: EditProfileModalProps) {
  const [nickname, setNickname] = useState(profile.nickname);
  const [bio, setBio] = useState(profile.bio);
  const [location, setLocation] = useState(profile.location ?? '');
  const [website, setWebsite] = useState(profile.website ?? '');
  const [cover, setCover] = useState(profile.cover_url);
  const [avatar, setAvatar] = useState(profile.avatar_url);
  const [saving, setSaving] = useState(false);

  /* 每次打开重置为当前资料，避免上次的脏值残留 */
  useEffect(() => {
    if (!open) return;
    setNickname(profile.nickname);
    setBio(profile.bio);
    setLocation(profile.location ?? '');
    setWebsite(profile.website ?? '');
    setCover(profile.cover_url);
    setAvatar(profile.avatar_url);
  }, [open, profile]);

  const dirty =
    nickname !== profile.nickname ||
    bio !== profile.bio ||
    location !== (profile.location ?? '') ||
    website !== (profile.website ?? '') ||
    cover !== profile.cover_url ||
    avatar !== profile.avatar_url;

  const nameOver = nickname.length > MAX_NAME;
  const bioOver = bio.length > MAX_BIO;
  const canSave = dirty && nickname.trim().length > 0 && !nameOver && !bioOver && !saving;

  const save = () => {
    if (!canSave) return;
    setSaving(true);
    const patch: Partial<UserProfile> = {
      nickname: nickname.trim(),
      bio,
      location: location.trim() || undefined,
      website: website.trim().replace(/^https?:\/\//, '') || undefined,
      cover_url: cover,
      avatar_url: avatar,
    };

    void updateProfileApi(patch)
      .then(() => {
        onSaved(patch);
        toast.success('资料已更新');
        onClose();
      })
      .catch(() => toast.error('保存失败，请稍后重试'))
      .finally(() => setSaving(false));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="编辑资料"
      closeOnOverlay={false}
      headActions={
        <button
          type="button"
          className={`${modalStyles.btn} ${modalStyles['btn--primary']}`}
          disabled={!canSave}
          onClick={save}
        >
          {saving ? '保存中…' : '保存'}
        </button>
      }
    >
      <div className={styles.form}>
        {/* 封面 */}
        <div className={styles.cover}>
          <img src={cover} alt="" aria-hidden />
          <button
            type="button"
            className={styles.cover__btn}
            onClick={() => setCover(coverDataUri(`${profile.user_id}_${Date.now()}`))}
          >
            <Camera size={15} strokeWidth={2} aria-hidden />
            换一张
          </button>
        </div>

        {/* 头像 */}
        <div className={styles.avatarRow}>
          <span className={styles.avatarRow__avatar}>
            <img src={avatar} alt="" />
          </span>
          <button
            type="button"
            className={styles.avatarRow__btn}
            onClick={() => {
              /* Demo 无上传能力：用确定性 data-URI 模拟换头像 */
              toast.show('Demo 环境不支持上传，已为你随机生成一张');
              setAvatar(avatarDataUriFallback(profile.user_id));
            }}
          >
            更换头像
          </button>
        </div>

        {/* 昵称 */}
        <label className={styles.field}>
          <span className={styles.field__label}>
            昵称
            <span
              className={[styles.field__count, nameOver ? styles['field__count--over'] : '']
                .filter(Boolean)
                .join(' ')}
            >
              {nickname.length}/{MAX_NAME}
            </span>
          </span>
          <input
            className={[styles.input, nameOver ? styles['input--invalid'] : '']
              .filter(Boolean)
              .join(' ')}
            value={nickname}
            maxLength={MAX_NAME + 5}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="你的昵称"
          />
        </label>

        {/* 简介 */}
        <label className={styles.field}>
          <span className={styles.field__label}>
            简介
            <span
              className={[styles.field__count, bioOver ? styles['field__count--over'] : '']
                .filter(Boolean)
                .join(' ')}
            >
              {bio.length}/{MAX_BIO}
            </span>
          </span>
          <textarea
            className={[styles.textarea, bioOver ? styles['input--invalid'] : '']
              .filter(Boolean)
              .join(' ')}
            value={bio}
            rows={3}
            onChange={(e) => setBio(e.target.value)}
            placeholder="介绍一下你自己"
          />
        </label>

        {/* 地区 */}
        <label className={styles.field}>
          <span className={styles.field__label}>地区</span>
          <input
            className={styles.input}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="例如：杭州"
          />
        </label>

        {/* 网站 */}
        <label className={styles.field}>
          <span className={styles.field__label}>网站</span>
          <input
            className={styles.input}
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="example.com"
          />
        </label>
      </div>
    </Modal>
  );
}

/** 简易头像再生成（避免 import 过多占位工具） */
function avatarDataUriFallback(seed: string): string {
  const palette = [
    ['#ffd6cc', '#8a3b22'],
    ['#cfe3ff', '#1f4a86'],
    ['#d6f5e3', '#1c6b4a'],
    ['#ffe8b8', '#7a5410'],
    ['#e3d9ff', '#4a327f'],
    ['#ffd9e8', '#8a2a55'],
  ];
  let h = 2166136261;
  const key = `${seed}_${Date.now()}`;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = Math.abs(h) % palette.length;
  const [bg, fg] = palette[idx]!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="${bg}"/><circle cx="40" cy="31" r="14" fill="${fg}" opacity="0.85"/><path d="M12 78c0-16 12.5-26 28-26s28 10 28 26z" fill="${fg}" opacity="0.85"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
