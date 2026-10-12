import { useState } from 'react';
import { FollowButton } from './FollowButton';
import { toast } from '@/stores/toastStore';
import type { UserSummary } from '@/types/user';
import styles from './UserRow.module.css';

interface UserRowProps {
  user: UserSummary;
  /** 是否显示"关注了你"标记（粉丝列表用） */
  showMutual?: boolean;
  /** 是否显示关注按钮 */
  showFollow?: boolean;
  /** 额外操作（拉黑 / 解除，由名单管理页注入） */
  trailing?: React.ReactNode;
  onOpen?: () => void;
}

/**
 * 用户行（关注/粉丝列表、名单管理、搜索用户结果共用）
 * 派生组件：头像 44 + 昵称 + @handle + 简介 + 关注按钮
 */
export function UserRow({ user, showMutual = false, showFollow = true, trailing, onOpen }: UserRowProps) {
  const [following, setFollowing] = useState(false);

  return (
    <div
      className={styles.row}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (onOpen && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <span className={styles.row__avatar}>
        <img src={user.avatar_url} alt="" loading="lazy" />
      </span>

      <div className={styles.row__body}>
        <div className={styles.row__top}>
          <span className={styles.row__name}>{user.nickname}</span>
        </div>

        <div className={styles.row__handleRow}>
          <span className={styles.row__handle}>@{user.handle}</span>
          {showMutual && user.follows_me ? (
            <span className={styles.row__mutual}>关注了你</span>
          ) : null}
        </div>

        {user.bio ? <p className={styles.row__bio}>{user.bio}</p> : null}
      </div>

      <div className={styles.row__action} onClick={(e) => e.stopPropagation()}>
        {trailing ??
          (showFollow ? (
            <FollowButton
              size="sm"
              relation={following ? 'following' : 'none'}
              following={following}
              isSelf={false}
              onChange={(next) => {
                setFollowing(next);
                if (!next) {
                  /* 仅在取消时给一次"已移除"的确认感 */
                  toast.show(`已取消关注 @${user.handle}`);
                }
              }}
            />
          ) : null)}
      </div>
    </div>
  );
}
