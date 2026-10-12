import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CalendarDays,
  Link2,
  MapPin,
  MoreHorizontal,
  UserX,
  Ban,
  Share,
  BellOff,
  Copy,
  Trash2,
  LogOut,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Aside } from '@/components/layout/Aside';
import { PageHeader, headerStyles } from '@/components/layout/PageHeader';
import { PostCard } from '@/components/post/PostCard';
import { PostCardSkeleton } from '@/components/post/PostCardSkeleton';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Modal } from '@/components/common/Modal';
import { EditProfileModal } from '@/components/profile/EditProfileModal';
import { FollowButton } from '@/components/profile/FollowButton';
import { ProfileTabs } from '@/components/profile/ProfileTabs';
import { ProfileEmpty } from '@/components/profile/ProfileStates';
import { toast } from '@/stores/toastStore';
import { useFeedStore } from '@/stores/feedStore';
import { useAuthStore } from '@/stores/authStore';
import { fetchProfile, type ProfileBundle } from '@/mocks/api';
import { formatCount } from '@/utils/format';
import type { FeedItem } from '@/types/feed';
import type { ProfileTab } from '@/types/user';
import styles from './ProfilePage.module.css';

const JoinedText = ({ iso }: { iso: string }) => {
  const d = new Date(iso);
  return <>{`${d.getFullYear()}年${d.getMonth() + 1}月加入`}</>;
};

export function ProfilePage() {
  const { handle = '' } = useParams();
  const navigate = useNavigate();
  const signOut = useAuthStore((s) => s.signOut);

  const [bundle, setBundle] = useState<ProfileBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<ProfileTab>('posts');
  const [following, setFollowing] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const topRef = useRef<HTMLDivElement | null>(null);

  /* -------------------- 加载资料 -------------------- */
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setNotFound(false);
    setTab('posts');

    void fetchProfile(handle).then((data) => {
      if (!alive) return;
      if (!data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setBundle(data);
      setFollowing(data.profile.relation === 'following');
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [handle]);

  /* -------------------- 关注状态机 -------------------- */
  const onFollowChange = useCallback((next: boolean) => {
    setFollowing(next);
  }, []);

  /* -------------------- 本地互动（复用 feedStore 的乐观更新语义）-------------------- */
  const toggleLike = useFeedStore((s) => s.toggleLike);
  const toggleRepost = useFeedStore((s) => s.toggleRepost);
  const toggleBookmark = useFeedStore((s) => s.toggleBookmark);

  /** 个人主页的列表是快照，互动需就地改本地数组 */
  const patchLocal = useCallback(
    (contentId: string, fn: (item: FeedItem) => FeedItem) => {
      setBundle((prev) => {
        if (!prev) return prev;
        const apply = (list: FeedItem[]) =>
          list.map((it) => (it.content_id === contentId ? fn(it) : it));
        return {
          ...prev,
          posts: apply(prev.posts),
          media: apply(prev.media),
          likes: apply(prev.likes),
        };
      });
    },
    [],
  );

  const likeItem = useCallback(
    (item: FeedItem) => {
      toggleLike(item.content_id);
      patchLocal(item.content_id, (it) => ({
        ...it,
        viewer: { ...it.viewer, liked: !it.viewer.liked },
        counters: {
          ...it.counters,
          like: it.counters.like + (it.viewer.liked ? -1 : 1),
        },
      }));
    },
    [patchLocal, toggleLike],
  );

  const repostItem = useCallback(
    (item: FeedItem) => {
      toggleRepost(item.content_id);
      patchLocal(item.content_id, (it) => ({
        ...it,
        viewer: { ...it.viewer, reposted: !it.viewer.reposted },
        counters: {
          ...it.counters,
          repost: it.counters.repost + (it.viewer.reposted ? -1 : 1),
        },
      }));
      toast.show(item.viewer.reposted ? '已取消转推' : '已转推');
    },
    [patchLocal, toggleRepost],
  );

  const bookmarkItem = useCallback(
    (item: FeedItem) => {
      toggleBookmark(item.content_id);
      patchLocal(item.content_id, (it) => ({
        ...it,
        viewer: { ...it.viewer, bookmarked: !it.viewer.bookmarked },
      }));
      toast.success(item.viewer.bookmarked ? '已取消收藏' : '已加入收藏');
    },
    [patchLocal, toggleBookmark],
  );

  const shareProfile = useCallback(() => {
    void navigator.clipboard
      ?.writeText(`${location.origin}/u/${handle}`)
      .then(() => toast.success('主页链接已复制'))
      .catch(() => toast.error('复制失败，请手动复制地址栏链接'));
  }, [handle]);

  /* -------------------- 渲染分支 -------------------- */
  if (notFound) {
    return (
      <AppShell>
        <div className={styles.page}>
          <div className={styles.page__main}>
            <PageHeader title="主页" />
            <ProfileEmpty
              kind="notFound"
              action={{ text: '回到信息流', onClick: () => navigate('/') }}
            />
          </div>
        </div>
      </AppShell>
    );
  }

  if (loading || !bundle) {
    return (
      <AppShell aside={<Aside />}>
        <div className={styles.page}>
          <div className={styles.page__main}>
            <PageHeader title="主页" showBack={false} />
            <div className={styles.skeletonCover} />
            <PostCardSkeleton count={4} withMedia={false} />
          </div>
        </div>
      </AppShell>
    );
  }

  const { profile, state, isSelf } = bundle;

  /* 已注销 / 被拉黑：整页替换 */
  if (state === 'deactivated') {
    return (
      <AppShell>
        <div className={styles.page}>
          <div className={styles.page__main}>
            <PageHeader title="主页" />
            <div className={styles.deactivated}>
              <span className={styles.deactivated__icon} aria-hidden>
                <UserX size={28} strokeWidth={1.7} />
              </span>
              <h2 className={styles.deactivated__title}>该账号已注销</h2>
              <p className={styles.deactivated__desc}>
                @{profile.handle} 已注销账号，其发布的内容与互动记录不再公开。
              </p>
              <button
                type="button"
                className={styles.deactivated__btn}
                onClick={() => navigate('/')}
              >
                回到信息流
              </button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (state === 'blocked_me') {
    return (
      <AppShell>
        <div className={styles.page}>
          <div className={styles.page__main}>
            <PageHeader title="主页" />
            <div className={styles.deactivated}>
              <span className={styles.deactivated__icon} aria-hidden>
                <Ban size={28} strokeWidth={1.7} />
              </span>
              <h2 className={styles.deactivated__title}>你无法查看此主页</h2>
              <p className={styles.deactivated__desc}>
                对方已将你加入黑名单，或对你的账号做了访问限制。
              </p>
              <button
                type="button"
                className={styles.deactivated__btn}
                onClick={() => navigate('/')}
              >
                回到信息流
              </button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const currentList =
    tab === 'posts' ? bundle.posts : tab === 'media' ? bundle.media : bundle.likes;

  const tabCounts: Record<ProfileTab, number> = {
    posts: bundle.posts.length,
    media: bundle.media.length,
    likes: bundle.likes.length,
  };

  return (
    <AppShell aside={<Aside />}>
      <div className={styles.page} ref={topRef}>
        <div className={styles.page__main}>
          <PageHeader
            title={profile.nickname}
            subtitle={`${formatCount(tabCounts.posts)} 条动态`}
            actions={
              <>
                <button
                  type="button"
                  className={headerStyles.iconBtn}
                  aria-label="分享主页"
                  onClick={shareProfile}
                >
                  <Share size={19} strokeWidth={2} aria-hidden />
                </button>
                <button
                  type="button"
                  className={headerStyles.iconBtn}
                  aria-label="更多操作"
                  onClick={() => setMoreOpen(true)}
                >
                  <MoreHorizontal size={20} strokeWidth={2} aria-hidden />
                </button>
              </>
            }
          />

          {/* ---------- 封面 ---------- */}
          <div className={styles.cover}>
            <img className={styles.cover__img} src={profile.cover_url} alt="" aria-hidden />
          </div>

          {/* ---------- 资料区 ---------- */}
          <section className={styles.head}>
            <div className={styles.head__avatarRow}>
              <button
                type="button"
                className={styles.head__avatar}
                aria-label="更换头像"
                onClick={() => {
                  if (isSelf) setEditOpen(true);
                }}
              >
                <img src={profile.avatar_url} alt="" />
              </button>

              <div className={styles.head__action}>
                {!isSelf ? (
                  <button
                    type="button"
                    className={headerStyles.iconBtn}
                    aria-label="更多用户操作"
                    onClick={() => setMoreOpen(true)}
                  >
                    <MoreHorizontal size={20} strokeWidth={2} aria-hidden />
                  </button>
                ) : null}

                <FollowButton
                  relation={profile.relation}
                  following={following}
                  isSelf={isSelf}
                  onChange={onFollowChange}
                  onEditProfile={() => setEditOpen(true)}
                />
              </div>
            </div>

            <div className={styles.head__names}>
              <h1 className={styles.head__name}>
                {profile.nickname}
              </h1>
              <span className={styles.head__handle}>@{profile.handle}</span>
            </div>

            {profile.follows_me && !isSelf ? (
              <span className={styles.head__followsYou}>关注了你</span>
            ) : null}

            {profile.bio ? <p className={styles.head__bio}>{profile.bio}</p> : null}

            <div className={styles.head__meta}>
              {profile.location ? (
                <span className={styles.head__metaItem}>
                  <MapPin size={15} strokeWidth={1.9} aria-hidden />
                  {profile.location}
                </span>
              ) : null}
              {profile.website ? (
                <a
                  className={styles.head__metaLink}
                  href={`https://${profile.website}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <Link2 size={15} strokeWidth={1.9} aria-hidden />
                  {profile.website}
                </a>
              ) : null}
              <span className={styles.head__metaItem}>
                <CalendarDays size={15} strokeWidth={1.9} aria-hidden />
                <JoinedText iso={profile.joined_at} />
              </span>
            </div>

            <div className={styles.head__stats}>
              <button
                type="button"
                className={styles.head__stat}
                onClick={() => navigate(`/u/${profile.handle}/following`)}
              >
                <span className={styles.head__statNum}>{formatCount(profile.following)}</span>
                <span className={styles.head__statLabel}>关注</span>
              </button>
              <button
                type="button"
                className={styles.head__stat}
                onClick={() => navigate(`/u/${profile.handle}/followers`)}
              >
                <span className={styles.head__statNum}>{formatCount(profile.followers)}</span>
                <span className={styles.head__statLabel}>粉丝</span>
              </button>
            </div>
          </section>

          {/* ---------- 三 Tab（吸顶）---------- */}
          <ProfileTabs value={tab} counts={tabCounts} onChange={setTab} />

          {/* ---------- 列表 ---------- */}
          <div className={styles.list}>
            {blocked ? (
              <ProfileEmpty
                kind="blocked"
                action={{ text: '解除拉黑', onClick: () => setBlocked(false) }}
              />
            ) : currentList.length === 0 ? (
              <ProfileEmpty
                kind={tab}
                action={
                  isSelf && tab === 'posts'
                    ? { text: '发一条动态', onClick: () => navigate('/compose') }
                    : undefined
                }
              />
            ) : (
              currentList.map((item) => (
                <PostCard
                  key={`${tab}_${item.content_id}`}
                  item={item}
                  viewerIsAuthor={isSelf}
                  onLike={likeItem}
                  onRepost={repostItem}
                  onBookmark={bookmarkItem}
                  onReply={() => navigate(`/post/${item.content_id}`)}
                  onMore={() => setMoreOpen(true)}
                />
              ))
            )}
            <div className={styles.list__tail} />
          </div>
        </div>
      </div>

      {/* ---------- 编辑资料 ---------- */}
      <EditProfileModal
        open={editOpen}
        profile={profile}
        onClose={() => setEditOpen(false)}
        onSaved={(patch) => {
          setBundle((prev) => (prev ? { ...prev, profile: { ...prev.profile, ...patch } } : prev));
        }}
      />

      {/* ---------- 更多操作 ---------- */}
      <Modal
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        size="sm"
        title="更多操作"
        showClose={false}
      >
        <div className={styles.menuList}>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              void navigator.clipboard
                ?.writeText(`${location.origin}/u/${profile.handle}`)
                .then(() => toast.success('主页链接已复制'))
                .catch(() => toast.error('复制失败'));
              setMoreOpen(false);
            }}
          >
            <Copy size={18} strokeWidth={1.9} aria-hidden />
            复制主页链接
          </button>

          {!isSelf ? (
            <>
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => {
                  toast.show(`已静音 @${profile.handle}，你将不再看到 TA 的动态`);
                  setMoreOpen(false);
                }}
              >
                <BellOff size={18} strokeWidth={1.9} aria-hidden />
                静音 @{profile.handle}
              </button>

              <button
                type="button"
                className={`${styles.menuItem} ${styles['menuItem--danger']}`}
                onClick={() => {
                  setMoreOpen(false);
                  setBlockOpen(true);
                }}
              >
                <Ban size={18} strokeWidth={1.9} aria-hidden />
                拉黑 @{profile.handle}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => {
                  setMoreOpen(false);
                  navigate('/settings/account');
                }}
              >
                <Trash2 size={18} strokeWidth={1.9} aria-hidden />
                管理我的账号
              </button>

              {/* 移动端左导航收起时，这里是退出登录唯一稳定的入口 */}
              <button
                type="button"
                className={`${styles.menuItem} ${styles['menuItem--danger']}`}
                onClick={() => {
                  setMoreOpen(false);
                  setLogoutOpen(true);
                }}
              >
                <LogOut size={18} strokeWidth={1.9} aria-hidden />
                退出登录
              </button>
            </>
          )}
        </div>
      </Modal>

      {/* ---------- 拉黑二次确认 ---------- */}
      <ConfirmDialog
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        danger
        title={`拉黑 @${profile.handle}？`}
        confirmText="拉黑"
        description={
          <>
            TA 将无法关注你、查看你的动态或给你发消息，你们之间的关注关系会被解除。
            TA 不会收到任何通知。你可以随时在「设置 → 隐私 → 黑名单」中解除。
          </>
        }
        onConfirm={() => {
          setBlockOpen(false);
          setBlocked(true);
          toast.success(`已拉黑 @${profile.handle}`);
        }}
      />

      {/* ---------- 退出登录二次确认 ---------- */}
      <ConfirmDialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        danger
        title="退出当前账号？"
        confirmText="退出登录"
        description="退出后需要重新登录才能发帖和查看消息。你的草稿会保留在本机。"
        onConfirm={() => {
          setLogoutOpen(false);
          signOut();
          toast.success('已退出登录');
          navigate('/login', { replace: true });
        }}
      />
    </AppShell>
  );
}
