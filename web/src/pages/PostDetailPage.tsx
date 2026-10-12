import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Ban,
  BellOff,
  MessageCircle,
  Repeat2,
  Heart,
  Bookmark,
  Share,
  MoreHorizontal,
  Eye,
  FileWarning,
  ChevronUp,
  Info,
  Flag,
  Quote,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Aside } from '@/components/layout/Aside';
import { PageHeader, headerStyles } from '@/components/layout/PageHeader';
import { Modal } from '@/components/common/Modal';
import { ReportModal } from '@/components/report/ReportModal';
import { MediaGrid } from '@/components/post/MediaGrid';
import { PostCardSkeleton } from '@/components/post/PostCardSkeleton';
import { CommentItem, type CommentView } from '@/components/comment/CommentItem';
import { CommentComposer } from '@/components/comment/CommentComposer';
import { formatAbsoluteTime, formatCount } from '@/utils/format';
import { fetchComments, fetchItem, postComment } from '@/mocks/api';
import type { FeedItem } from '@/types/feed';
import styles from './PostDetailPage.module.css';

type SortMode = 'relevant' | 'latest';

export function PostDetailPage() {
  const { contentId = '' } = useParams();
  const navigate = useNavigate();

  const [item, setItem] = useState<FeedItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [comments, setComments] = useState<CommentView[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [sort, setSort] = useState<SortMode>('relevant');

  const [liked, setLiked] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [repostCount, setRepostCount] = useState(0);

  const [following, setFollowing] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ handle: string; name: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  /** 「更多操作」菜单与举报流程 */
  const [moreOpen, setMoreOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  /* -------------------- 加载父帖 -------------------- */
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setNotFound(false);

    void fetchItem(contentId).then((data) => {
      if (!alive) return;
      if (!data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setItem(data);
      setLiked(data.viewer.liked);
      setReposted(data.viewer.reposted);
      setBookmarked(data.viewer.bookmarked);
      setLikeCount(data.counters.like);
      setRepostCount(data.counters.repost);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [contentId]);

  /* -------------------- 加载评论 -------------------- */
  useEffect(() => {
    let alive = true;
    setCommentsLoading(true);

    void fetchComments(contentId).then((list) => {
      if (!alive) return;
      setComments(list);
      setCommentsLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [contentId]);

  /* -------------------- toast 自动消失 -------------------- */
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2000);
    return () => window.clearTimeout(t);
  }, [toast]);

  /* -------------------- 互动 -------------------- */
  const toggleLike = useCallback(() => {
    setLiked((prev) => {
      setLikeCount((c) => c + (prev ? -1 : 1));
      return !prev;
    });
  }, []);

  const toggleRepost = useCallback(() => {
    setReposted((prev) => {
      setRepostCount((c) => c + (prev ? -1 : 1));
      setToast(prev ? '已取消转推' : '已转推');
      return !prev;
    });
  }, []);

  const toggleBookmark = useCallback(() => {
    setBookmarked((prev) => {
      setToast(prev ? '已取消收藏' : '已加入收藏');
      return !prev;
    });
  }, []);

  const likeComment = useCallback((target: CommentView) => {
    const patch = (list: CommentView[]): CommentView[] =>
      list.map((c) => {
        if (c.comment_id === target.comment_id) {
          return {
            ...c,
            viewer: { ...c.viewer, liked: !c.viewer.liked },
            counters: {
              ...c.counters,
              like: c.counters.like + (c.viewer.liked ? -1 : 1),
            },
          };
        }
        if (c.replies?.length) return { ...c, replies: patch(c.replies) };
        return c;
      });
    setComments(patch);
  }, []);

  const submitComment = useCallback(
    (text: string) => {
      void postComment(contentId, text, replyingTo?.handle).then((created) => {
        setComments((prev) => [created, ...prev]);
        setToast('回复已发布');
      });
    },
    [contentId, replyingTo],
  );

  /* -------------------- 渲染分支 -------------------- */
  if (notFound) {
    return (
      <AppShell>
        <div className={styles.page}>
          <div className={styles.page__main}>
            <PageHeader title="动态" />
            <div className={styles.notice}>
              <span className={styles.notice__icon} aria-hidden>
                <FileWarning size={26} strokeWidth={1.75} />
              </span>
              <div className={styles.notice__title}>内容不可用</div>
              <p className={styles.notice__desc}>
                这条动态可能已被删除，或者你所在的地区无法查看。
              </p>
              <button
                type="button"
                className={styles.notice__btn}
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

  if (loading || !item) {
    return (
      <AppShell aside={<Aside />}>
        <div className={styles.page}>
          <div className={styles.page__main}>
            <PageHeader title="动态" />
            <PostCardSkeleton count={1} withMedia />
            <PostCardSkeleton count={3} withMedia={false} />
          </div>
        </div>
      </AppShell>
    );
  }

  /* 排序：最相关 = 按点赞数；最新 = 按时间 */
  const sortedComments = [...comments].sort((a, b) =>
    sort === 'latest'
      ? Date.parse(b.published_at) - Date.parse(a.published_at)
      : b.counters.like - a.counters.like,
  );

  return (
    <AppShell aside={<Aside />}>
      <div className={styles.page}>
        <div className={styles.page__main}>
          <PageHeader
            title="动态"
            actions={
              <button
                type="button"
                className={headerStyles.iconBtn}
                aria-label="更多操作"
                onClick={() => setMoreOpen(true)}
              >
                <MoreHorizontal size={20} strokeWidth={2} aria-hidden />
              </button>
            }
          />

          {/* ---------- 父帖 ---------- */}
          <article className={styles.parent}>
            <div className={styles.parent__avatarCol}>
              <button
                type="button"
                className={styles.parent__avatar}
                aria-label={`查看 ${item.author.nickname} 的主页`}
                onClick={() => navigate(`/u/${item.author.handle}`)}
              >
                {item.author.avatar_url ? <img src={item.author.avatar_url} alt="" /> : null}
              </button>
            </div>

            <div className={styles.parent__body}>
              <div className={styles.parent__nameRow}>
                <button
                  type="button"
                  className={styles.parent__name}
                  onClick={() => navigate(`/u/${item.author.handle}`)}
                >
                  {item.author.nickname}
                </button>

                <button
                  type="button"
                  className={[
                    styles.parent__follow,
                    following ? '' : styles['parent__follow--notFollowing'],
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setFollowing((v) => !v)}
                >
                  {following ? '已关注' : '关注'}
                </button>
              </div>
              <span className={styles.parent__handle}>@{item.author.handle}</span>

              {/* 正文（不折叠） */}
              {item.text ? <div className={styles.parent__text}>{item.text}</div> : null}

              {/* 媒体：敏感内容在详情页仍保持遮罩 */}
              {item.media.length > 0 ? (
                item.flags.sensitive && !revealed ? (
                  <div className={styles.sensitive}>
                    <img
                      className={styles.sensitive__preview}
                      src={item.media[0]!.cover_url}
                      alt=""
                      aria-hidden
                    />
                    <div className={styles.sensitive__dialog}>
                      <Info size={24} strokeWidth={1.9} aria-hidden />
                      <span className={styles.sensitive__title}>此内容可能包含敏感信息</span>
                      <span className={styles.sensitive__desc}>
                        发布者已将其标记为敏感内容，点击下方按钮后才会显示。
                      </span>
                      <button
                        type="button"
                        className={styles.sensitive__btn}
                        onClick={() => setRevealed(true)}
                      >
                        点击查看
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.parent__media}>
                    <MediaGrid
                      media={item.media}
                      kind={item.layout === 'video' ? 'video' : 'photo'}
                      playing={false}
                    />
                  </div>
                )
              ) : null}
            </div>
          </article>

          {/* ---------- 精确时间 / 浏览量 ---------- */}
          <div className={styles.meta}>
            <time className={styles.meta__time} dateTime={item.published_at}>
              {formatAbsoluteTime(item.published_at)}
            </time>
            <div className={styles.meta__row}>
              <span className={styles.meta__num}>{formatCount(item.counters.view)}</span>
              <span>次查看</span>
              <Eye size={14} strokeWidth={2} aria-hidden />
            </div>
            <button
              type="button"
              className={styles.meta__copy}
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(`${location.origin}/post/${item.content_id}`)
                  .then(() => setToast('链接已复制'))
                  .catch(() => setToast('复制失败'));
              }}
            >
              复制动态链接
            </button>
          </div>

          {/* ---------- 数据摘要行 ---------- */}
          <div className={styles.summary}>
            <span className={styles.summary__item}>
              <span className={styles.summary__num}>{formatCount(item.counters.reply)}</span> 回复
            </span>
            <span className={styles.summary__item}>
              <span className={styles.summary__num}>{formatCount(repostCount)}</span> 转推
            </span>
            <span className={styles.summary__item}>
              <span className={styles.summary__num}>{formatCount(likeCount)}</span> 赞
            </span>
          </div>

          {/* ---------- 完整操作行 ---------- */}
          <div className={styles.actions}>
            <DetailActions
              liked={liked}
              reposted={reposted}
              bookmarked={bookmarked}
              counts={{ reply: item.counters.reply, repost: repostCount, like: likeCount }}
              onReply={() => setReplyingTo({ handle: item.author.handle, name: item.author.nickname })}
              onRepost={toggleRepost}
              onLike={toggleLike}
              onBookmark={toggleBookmark}
              onShare={() => setToast('分享面板（Demo 未实现）')}
            />
          </div>

          {/* ---------- 评论排序 ---------- */}
          <div className={styles.sortRow}>
            <span className={styles.sortRow__label}>
              {comments.length > 0 ? `${comments.length} 条回复` : '回复'}
            </span>
            <button
              type="button"
              className={[styles.sortBtn, sort === 'relevant' ? styles['sortBtn--active'] : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => setSort('relevant')}
            >
              最相关
            </button>
            <button
              type="button"
              className={[styles.sortBtn, sort === 'latest' ? styles['sortBtn--active'] : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => setSort('latest')}
            >
              最新
            </button>
          </div>

          {/* ---------- 评论列表 ---------- */}
          {commentsLoading ? (
            <PostCardSkeleton count={3} withMedia={false} />
          ) : sortedComments.length === 0 ? (
            <div className={styles.empty}>
              <MessageCircle size={26} strokeWidth={1.5} aria-hidden />
              <div className={styles.empty__title}>还没有回复</div>
              <p className={styles.empty__desc}>成为第一个回复的人，说点什么吧。</p>
            </div>
          ) : (
            sortedComments.map((c) => (
              <CommentItem
                key={c.comment_id}
                comment={c}
                onLike={likeComment}
                onReply={(target) =>
                  setReplyingTo({ handle: target.author.handle, name: target.author.nickname })
                }
              />
            ))
          )}

          <div style={{ height: 12 }} />
        </div>
      </div>

      {/* 评论区吸底输入框 */}
      <CommentComposer
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onSubmit={submitComment}
      />

      {/* 轻提示 */}
      {toast ? (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 88,
            transform: 'translateX(-50%)',
            zIndex: 50,
            padding: '9px 18px',
            borderRadius: 9999,
            background: 'var(--accent)',
            color: '#fff',
            fontSize: 'var(--font-sm)',
            fontWeight: 600,
            boxShadow: '0 4px 16px rgba(0,0,0,.2)',
          }}
          role="status"
        >
          {toast}
        </div>
      ) : null}

      <button
        type="button"
        aria-label="回到顶部"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        style={{
          position: 'fixed',
          right: 20,
          bottom: 88,
          zIndex: 40,
          width: 40,
          height: 40,
          borderRadius: 9999,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <ChevronUp size={20} strokeWidth={2} aria-hidden />
      </button>

      {/* ---------- 更多操作菜单 ---------- */}
      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} size="sm" title="更多操作">
        <div className={styles.more}>
          <MoreItem
            icon={Share}
            label="复制动态链接"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(`${location.origin}/post/${item.content_id}`)
                .then(() => setToast('链接已复制'))
                .catch(() => setToast('复制失败'));
              setMoreOpen(false);
            }}
          />
          <MoreItem
            icon={Quote}
            label="引用转发"
            onClick={() => {
              setMoreOpen(false);
              navigate(`/compose/quote/${item.content_id}`);
            }}
          />
          <MoreItem
            icon={BellOff}
            label={`静音 @${item.author.handle}`}
            onClick={() => {
              setMoreOpen(false);
              setToast(`已静音 @${item.author.handle}`);
            }}
          />
          <MoreItem
            icon={Ban}
            label={`拉黑 @${item.author.handle}`}
            danger
            onClick={() => {
              setMoreOpen(false);
              setToast(`已拉黑 @${item.author.handle}`);
            }}
          />
          <MoreItem
            icon={Flag}
            label="举报这条动态"
            danger
            onClick={() => {
              setMoreOpen(false);
              setReportOpen(true);
            }}
          />
        </div>
      </Modal>

      {/* ---------- 举报流程 ---------- */}
      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetLabel={`@${item.author.handle} 的动态`}
      />
    </AppShell>
  );
}

/** 「更多操作」菜单项 */
function MoreItem({
  icon: Icon,
  label,
  onClick,
  danger = false,
}: {
  icon: typeof Share;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={[styles.more__item, danger ? styles['more__item--danger'] : '']
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
    >
      <Icon size={18} strokeWidth={1.9} aria-hidden />
      <span>{label}</span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  详情页完整操作行（比列表多一个「分享」）                                       */
/* -------------------------------------------------------------------------- */

function DetailActions({
  liked,
  reposted,
  bookmarked,
  counts,
  onReply,
  onRepost,
  onLike,
  onBookmark,
  onShare,
}: {
  liked: boolean;
  reposted: boolean;
  bookmarked: boolean;
  counts: { reply: number; repost: number; like: number };
  onReply: () => void;
  onRepost: () => void;
  onLike: () => void;
  onBookmark: () => void;
  onShare: () => void;
}) {
  const items = [
    {
      key: 'reply',
      icon: <MessageCircle size={19} strokeWidth={1.75} aria-hidden />,
      label: '回复',
      count: counts.reply,
      active: false,
      onClick: onReply,
    },
    {
      key: 'repost',
      icon: <Repeat2 size={19} strokeWidth={1.75} aria-hidden />,
      label: '转推',
      count: counts.repost,
      active: reposted,
      onClick: onRepost,
    },
    {
      key: 'like',
      icon: <Heart size={19} strokeWidth={1.75} fill={liked ? 'currentColor' : 'none'} aria-hidden />,
      label: '喜欢',
      count: counts.like,
      active: liked,
      onClick: onLike,
    },
    {
      key: 'bookmark',
      icon: (
        <Bookmark size={19} strokeWidth={1.75} fill={bookmarked ? 'currentColor' : 'none'} aria-hidden />
      ),
      label: '收藏',
      count: 0,
      active: bookmarked,
      onClick: onBookmark,
    },
    {
      key: 'share',
      icon: <Share size={19} strokeWidth={1.75} aria-hidden />,
      label: '分享',
      count: 0,
      active: false,
      onClick: onShare,
    },
  ];

  return (
    <div style={{ display: 'flex', gap: 4, width: '100%', justifyContent: 'space-around' }}>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          aria-label={it.label}
          onClick={it.onClick}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 10px',
            borderRadius: 9999,
            color: it.active
              ? it.key === 'like'
                ? 'var(--like)'
                : it.key === 'repost'
                  ? 'var(--repost)'
                  : 'var(--accent)'
              : 'var(--text-secondary)',
            fontSize: 'var(--font-sm)',
            transition: 'color 120ms',
          }}
        >
          {it.icon}
          {it.count > 0 ? formatCount(it.count) : null}
        </button>
      ))}
    </div>
  );
}
