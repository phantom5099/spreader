import { useState } from 'react';
import { toast } from '@/stores/toastStore';
import { toggleFollowApi } from '@/mocks/api';
import type { FollowRelation } from '@/types/user';
import styles from './FollowButton.module.css';

interface FollowButtonProps {
  /** 进入页面时的初始关系 */
  relation: FollowRelation;
  /** 受控的当前关注状态 */
  following: boolean;
  isSelf: boolean;
  onChange?: (next: boolean) => void;
  onEditProfile?: () => void;
  /** 列表场景用小号按钮 */
  size?: 'md' | 'sm';
}

/**
 * 关注按钮状态机
 *
 *   未关注 → 实心主色胶囊、白字「关注」
 *   已关注 → 描边胶囊、深字「取消关注」；hover 转红字加重点出这是取消操作
 *   自己   → 主色描边「编辑资料」
 *
 * 文案在常态就写明取消关注，不藏在 hover 里——触屏没有 hover 这一步。
 */
export function FollowButton({
  relation,
  following,
  isSelf,
  onChange,
  onEditProfile,
  size = 'md',
}: FollowButtonProps) {
  const [hovering, setHovering] = useState(false);
  const [busy, setBusy] = useState(false);
  /** 本次会话内主动关注过 = 取消时用确认弹窗（防误触） */
  const [justFollowed, setJustFollowed] = useState(relation === 'following');

  const sizeClass = size === 'sm' ? styles['follow--sm'] : '';

  if (isSelf) {
    return (
      <button
        type="button"
        className={[styles.follow, styles['follow--self'], sizeClass].filter(Boolean).join(' ')}
        onClick={onEditProfile}
      >
        编辑资料
      </button>
    );
  }

  const handleClick = () => {
    if (busy) return;
    setBusy(true);
    const next = !following;

    void toggleFollowApi(following ? relation : 'other', next)
      .then(() => {
        onChange?.(next);
        if (next) setJustFollowed(true);
        toast.success(next ? '已关注，TA 的最新动态会出现在你的关注流' : '已取消关注');
      })
      .catch(() => toast.error('操作失败，请稍后重试'))
      .finally(() => setBusy(false));
  };

  const label = following ? '取消关注' : '关注';

  const cls = [
    styles.follow,
    following ? styles['follow--following'] : styles['follow--none'],
    following && hovering ? styles['follow--canceling'] : '',
    busy ? styles['follow--busy'] : '',
    sizeClass,
  ]
    .filter(Boolean)
    .join(' ');

  void justFollowed;

  return (
    <button
      type="button"
      className={cls}
      aria-pressed={following}
      aria-label={following ? '取消关注' : '关注'}
      disabled={busy}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
      onClick={handleClick}
    >
      {label}
    </button>
  );
}
