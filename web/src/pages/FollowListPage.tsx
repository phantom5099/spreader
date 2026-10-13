import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { UserRow } from '@/components/profile/UserRow';
import { UserRowSkeleton } from '@/components/profile/UserRowSkeleton';
import { ProfileEmpty } from '@/components/profile/ProfileStates';
import { fetchUserList } from '@/mocks/api';
import { CURRENT_USER } from '@/mocks/currentUser';
import { findProfileByHandle } from '@/mocks/users';
import { useConversationStore } from '@/stores/conversationStore';
import type { UserSummary } from '@/types/user';
import styles from './FollowListPage.module.css';

type Kind = 'following' | 'followers';

interface FollowListPageProps {
  kind: Kind;
}

const TITLE: Record<Kind, string> = { following: '关注', followers: '粉丝' };
/**
 * 关注 / 粉丝列表
 * 双 Tab，URL 可直达（/u/:handle/following|followers）。
 */
function FollowListPage({ kind }: FollowListPageProps) {
  const { handle = '' } = useParams();
  const navigate = useNavigate();
  const startDirect = useConversationStore((s) => s.startDirect);

  const [list, setList] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const profile = findProfileByHandle(handle);
  const isSelf = !profile || profile.user_id === CURRENT_USER.user_id;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setQuery('');

    void fetchUserList(kind, handle).then((data) => {
      if (!alive) return;
      setList(data);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [kind, handle]);

  /**
   * 行右侧的聊天按钮
   */
  const openChat = (user: UserSummary) => {
    const id = startDirect(user);
    navigate(`/messages/${id}`);
  };

  const filtered = query.trim()
    ? list.filter((u) => {
        const q = query.trim().toLowerCase();
        return u.nickname.toLowerCase().includes(q) || u.handle.toLowerCase().includes(q);
      })
    : list;

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.page__main}>
          {/* 双 Tab */}
          <div className={styles.tabs} role="tablist" aria-label="关注与粉丝">
            <button
              type="button"
              role="tab"
              aria-selected={kind === 'following'}
              className={[styles.tab, kind === 'following' ? styles['tab--active'] : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => navigate(`/u/${handle}/following`)}
            >
              关注
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={kind === 'followers'}
              className={[styles.tab, kind === 'followers' ? styles['tab--active'] : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => navigate(`/u/${handle}/followers`)}
            >
              粉丝
            </button>
          </div>

          {/* 搜索框（列表内过滤） */}
          <div className={styles.searchWrap}>
            <span className={styles.searchWrap__icon}>
              <Search size={17} strokeWidth={2} aria-hidden />
            </span>
            <input
              className={styles.searchWrap__input}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`在${TITLE[kind]}中搜索`}
              aria-label={`在${TITLE[kind]}列表搜索`}
            />
            {query ? (
              <button
                type="button"
                className={styles.searchWrap__clear}
                aria-label="清空搜索"
                onClick={() => setQuery('')}
              >
                <X size={16} strokeWidth={2.2} aria-hidden />
              </button>
            ) : null}
          </div>

          {/* 列表 */}
          {loading ? (
            <UserRowSkeleton count={8} />
          ) : filtered.length === 0 ? (
            <ProfileEmpty
              kind="posts"
              action={
                query
                  ? { text: '清空搜索', onClick: () => setQuery('') }
                  : isSelf && kind === 'following'
                    ? { text: '去搜索更多人', onClick: () => navigate('/search') }
                    : undefined
              }
            />
          ) : (
            <div className={styles.list}>
              {filtered.map((u) => (
                <UserRow
                  key={u.user_id}
                  user={u}
                  showMutual
                  onOpen={() => navigate(`/u/${u.handle}`)}
                  onMessage={() => openChat(u)}
                />
              ))}
            </div>
          )}

          <div className={styles.tail} />
        </div>
      </div>
    </AppShell>
  );
}

export function FollowingListPage() {
  return <FollowListPage kind="following" />;
}

export function FollowersListPage() {
  return <FollowListPage kind="followers" />;
}
