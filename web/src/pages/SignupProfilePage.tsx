import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, MapPin, RefreshCw } from 'lucide-react';
import { avatarDataUri } from '@/mocks/placeholders';
import { coverDataUri } from '@/mocks/users';
import { fetchSuggestedUsers } from '@/mocks/api';
import { toast } from '@/stores/toastStore';
import type { UserSummary } from '@/types/user';
import styles from './SignupProfilePage.module.css';

const NICKNAME_MAX = 20;
const BIO_MAX = 160;

/**
 * 注册后补充信息页
 * 昵称 + 头像 + 简介 + 推荐关注，完成后进入信息流。
 * 与「编辑资料」共用字段定义，但这里是首次填写，故不给「跳过资料」之外的中途退出。
 */
export function SignupProfilePage() {
  const navigate = useNavigate();

  const [nickname, setNickname] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [avatarSeed, setAvatarSeed] = useState(() => `new_${Date.now()}`);
  const [coverSeed, setCoverSeed] = useState(() => `cover_${Date.now()}`);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [suggested, setSuggested] = useState<UserSummary[]>([]);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const nicknameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    nicknameRef.current?.focus();
  }, []);

  /* 推荐关注由服务端下发，与右栏推荐同源 */
  useEffect(() => {
    let alive = true;
    void fetchSuggestedUsers(6).then((list) => {
      if (alive) setSuggested(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  const nicknameError = useMemo(() => {
    const v = nickname.trim();
    if (!v) return '请填写昵称';
    if (v.length > NICKNAME_MAX) return `昵称不能超过 ${NICKNAME_MAX} 个字符`;
    return null;
  }, [nickname]);

  const canSubmit = !nicknameError && !busy;
  const avatarUrl = useMemo(() => avatarDataUri(avatarSeed, nickname.trim() || '新'), [avatarSeed, nickname]);
  const coverUrl = useMemo(() => coverDataUri(coverSeed), [coverSeed]);

  const toggleFollow = useCallback((handle: string) => {
    setFollowed((prev) => {
      const next = new Set(prev);
      if (next.has(handle)) next.delete(handle);
      else next.add(handle);
      return next;
    });
  }, []);

  const finish = useCallback(
    (skip = false) => {
      if (!skip) {
        setTouched(true);
        if (nicknameError) {
          nicknameRef.current?.focus();
          return;
        }
      }

      setBusy(true);
      window.setTimeout(() => {
        setBusy(false);
        if (skip) {
          toast.show('已跳过，资料可以随时在设置里补充');
        } else {
          toast.success(
            followed.size > 0 ? `资料已保存，已关注 ${followed.size} 人` : '资料已保存',
          );
        }
        navigate('/');
      }, 720);
    },
    [nicknameError, followed.size, navigate],
  );

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        {/* ---------- 顶栏 ---------- */}
        <header className={styles.bar}>
          <button
            type="button"
            className={styles.bar__icon}
            aria-label="返回登录"
            onClick={() => navigate('/login')}
          >
            <ArrowLeft size={20} strokeWidth={2} aria-hidden />
          </button>
          <span className={styles.bar__title}>完善资料</span>
          <button
            type="button"
            className={styles.bar__skip}
            disabled={busy}
            onClick={() => finish(true)}
          >
            跳过
          </button>
        </header>

        {/* ---------- 封面 + 头像 ---------- */}
        <div className={styles.coverWrap}>
          <div className={styles.cover}>
            <img src={coverUrl} alt="" aria-hidden />
          </div>
          <button
            type="button"
            className={styles.avatar}
            aria-label="换一个头像"
            onClick={() => setAvatarSeed(`new_${Date.now()}`)}
          >
            <img src={avatarUrl} alt="" />
            <span className={styles.avatar__badge} aria-hidden>
              <Camera size={13} strokeWidth={2.4} />
            </span>
          </button>
          <button
            type="button"
            className={styles.coverRefresh}
            aria-label="换一张封面"
            onClick={() => setCoverSeed(`cover_${Date.now()}`)}
          >
            <RefreshCw size={14} strokeWidth={2.2} aria-hidden />
            换一张
          </button>
        </div>

        {/* ---------- 表单 ---------- */}
        <div className={styles.form}>
          <label className={styles.field}>
            <span className={styles.field__label}>
              昵称
              <span className={styles.field__count}>
                {nickname.trim().length}/{NICKNAME_MAX}
              </span>
            </span>
            <input
              ref={nicknameRef}
              className={[
                styles.field__input,
                touched && nicknameError ? styles['field__input--error'] : '',
              ]
                .filter(Boolean)
                .join(' ')}
              value={nickname}
              maxLength={NICKNAME_MAX + 6}
              placeholder="别人会这样称呼你"
              onChange={(e) => setNickname(e.target.value)}
              onBlur={() => {
                if (nickname.trim().length > 0) setTouched(true);
              }}
            />
            {touched && nicknameError ? (
              <span className={styles.field__err}>{nicknameError}</span>
            ) : null}
          </label>

          <label className={styles.field}>
            <span className={styles.field__label}>
              简介
              <span className={styles.field__count}>
                {bio.length}/{BIO_MAX}
              </span>
            </span>
            <textarea
              className={styles.field__textarea}
              value={bio}
              maxLength={BIO_MAX}
              rows={3}
              placeholder="一句话介绍自己，比如在做什么、喜欢什么。"
              onChange={(e) => setBio(e.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.field__label}>所在地（选填）</span>
            <span className={styles.field__wrapInline}>
              <MapPin size={16} strokeWidth={1.9} aria-hidden />
              <input
                className={styles.field__input}
                value={location}
                placeholder="例如：杭州"
                onChange={(e) => setLocation(e.target.value)}
              />
            </span>
          </label>
        </div>

        {/* ---------- 推荐关注 ---------- */}
        <section className={styles.rec} aria-label="推荐关注">
          <div className={styles.rec__head}>
            <h2 className={styles.rec__title}>先关注几个人</h2>
            <span className={styles.rec__count}>
              {followed.size > 0 ? `已选 ${followed.size} 人` : '可跳过'}
            </span>
          </div>

          <ul className={styles.rec__list}>
            {suggested.length === 0 ? (
              <li className={styles.rec__hint}>正在为你挑选…</li>
            ) : null}
            {suggested.map((u) => {
              const on = followed.has(u.handle);
              return (
                <li key={u.handle} className={styles.recRow}>
                  <span className={styles.recRow__avatar}>
                    <img src={u.avatar_url} alt="" />
                  </span>
                  <span className={styles.recRow__body}>
                    <span className={styles.recRow__name}>
                      {u.nickname}
                    </span>
                    <span className={styles.recRow__bio}>{u.bio}</span>
                  </span>
                  <button
                    type="button"
                    className={[styles.recRow__btn, on ? styles['recRow__btn--on'] : '']
                      .filter(Boolean)
                      .join(' ')}
                    aria-pressed={on}
                    onClick={() => toggleFollow(u.handle)}
                  >
                    {on ? '取消关注' : '关注'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ---------- 提交 ---------- */}
        <div className={styles.foot}>
          <button
            type="button"
            className={styles.submit}
            disabled={!canSubmit}
            onClick={() => finish(false)}
          >
            {busy ? '保存中…' : '完成，进入信息流'}
          </button>
          <p className={styles.foot__hint}>
            昵称、头像与简介随时可以在「设置 → 账号」里修改。
          </p>
        </div>
      </div>
    </div>
  );
}
