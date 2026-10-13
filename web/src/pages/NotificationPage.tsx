import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AtSign,
  Bell,
  Check,
  CheckCheck,
  Heart,
  ListChecks,
  MessageCircle,
  Repeat2,
  UserPlus,
  Quote,
  X,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { toast } from '@/stores/toastStore';
import {
  deleteNotificationsApi,
  fetchNotifications,
  markNotificationsReadApi,
} from '@/mocks/api';
import { formatRelativeTime } from '@/utils/format';
import type { NotificationCategory, NotificationItem, NotificationVerb } from '@/types/message';
import styles from './NotificationPage.module.css';

const TABS: Array<{ key: NotificationCategory; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'mention', label: '提及' },
  { key: 'like', label: '点赞' },
  { key: 'follow', label: '关注' },
  { key: 'reply', label: '回复' },
];

const VERB_ICON: Record<NotificationVerb, typeof Heart> = {
  like: Heart,
  repost: Repeat2,
  follow: UserPlus,
  reply: MessageCircle,
  mention: AtSign,
  quote: Quote,
};

/** 动词对应的语气色（点赞=like 色、分享=repost 色、其余用主色） */
const VERB_TONE: Record<NotificationVerb, string> = {
  like: 'var(--like)',
  repost: 'var(--repost)',
  follow: 'var(--accent)',
  reply: 'var(--accent)',
  mention: 'var(--accent)',
  quote: 'var(--accent)',
};

function verbText(n: NotificationItem): string {
  const name = n.actor.nickname;
  const more = n.others_count ?? 0;
  switch (n.verb) {
    case 'like':
      return more > 0 ? `${name} 等 ${more + 1} 人赞了你的动态` : `${name} 赞了你的动态`;
    case 'repost':
      return `${name} 分享了你的动态`;
    case 'follow':
      return more > 0 ? `${name} 等 ${more + 1} 人关注了你` : `${name} 关注了你`;
    case 'reply':
      return `${name} 回复了你的动态`;
    case 'mention':
      return `${name} 在动态中提到了你`;
    case 'quote':
      return `${name} 引用了你的动态`;
    default:
      return `${name} 与你互动`;
  }
}

/**
 * 通知中心
 * 分类 Tab（全部/提及/点赞/关注/回复）+ 未读项左侧圆点 + 管理（多选删除）
 */
export function NotificationPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<NotificationCategory>('all');
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  /** 管理模式：多选 + 批量删除 */
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchNotifications().then((list) => {
      if (!alive) return;
      setItems(list);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(
    () => (tab === 'all' ? items : items.filter((i) => i.category === tab)),
    [items, tab],
  );

  const unreadOf = (key: NotificationCategory) =>
    key === 'all'
      ? items.filter((i) => !i.read).length
      : items.filter((i) => i.category === key && !i.read).length;

  const totalUnread = unreadOf('all');
  /** 全选只作用于当前分类下可见的通知 */
  const allSelected = filtered.length > 0 && filtered.every((n) => selected.has(n.notification_id));

  /* -------------------- 单选 / 全选 -------------------- */
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectAll = () =>
    setSelected(() => (allSelected ? new Set() : new Set(filtered.map((n) => n.notification_id))));

  const exitManaging = () => {
    setManaging(false);
    setSelected(new Set());
  };

  /* -------------------- 打开通知 -------------------- */
  const openNotification = (n: NotificationItem) => {
    if (managing) {
      toggleSelect(n.notification_id);
      return;
    }
    setItems((prev) =>
      prev.map((x) => (x.notification_id === n.notification_id ? { ...x, read: true } : x)),
    );
    if (!n.read) void markNotificationsReadApi([n.notification_id]).catch(() => undefined);
    if (n.content_id) navigate(`/post/${n.content_id}`);
    else navigate(`/u/${n.actor.handle}`);
  };

  const markAllRead = () => {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    void markNotificationsReadApi()
      .then(() => toast.success('已全部标为已读'))
      .catch(() => toast.error('操作失败，请重试'));
  };

  const deleteSelected = () => {
    const ids = [...selected];
    setConfirmOpen(false);
    if (ids.length === 0) return;
    setItems((prev) => prev.filter((n) => !selected.has(n.notification_id)));
    exitManaging();
    void deleteNotificationsApi(ids)
      .then(() => toast.success(`已删除 ${ids.length} 条通知`))
      .catch(() => toast.error('删除失败，请重试'));
  };

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.page__main}>
          <header className={styles.head}>
            <h1 className={styles.head__title}>
              通知
              {totalUnread > 0 ? <span className={styles.head__badge}>{totalUnread}</span> : null}
            </h1>

            <div className={styles.head__actions}>
              {managing ? (
                <>
                  <button
                    type="button"
                    className={styles.head__text}
                    onClick={toggleSelectAll}
                    disabled={filtered.length === 0}
                  >
                    {allSelected ? '取消全选' : '全选'}
                  </button>
                  <button
                    type="button"
                    className={[styles.head__text, styles['head__text--danger']]
                      .filter(Boolean)
                      .join(' ')}
                    disabled={selected.size === 0}
                    onClick={() => setConfirmOpen(true)}
                  >
                    删除{selected.size > 0 ? ` ${selected.size}` : ''}
                  </button>
                  <button
                    type="button"
                    className={styles.head__icon}
                    aria-label="退出管理"
                    title="退出管理"
                    onClick={exitManaging}
                  >
                    <X size={19} strokeWidth={2} aria-hidden />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={styles.head__icon}
                    aria-label="全部标为已读"
                    title="全部标为已读"
                    disabled={totalUnread === 0}
                    onClick={markAllRead}
                  >
                    <CheckCheck size={19} strokeWidth={2} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className={styles.head__icon}
                    aria-label="管理通知"
                    title="管理"
                    disabled={items.length === 0}
                    onClick={() => setManaging(true)}
                  >
                    <ListChecks size={19} strokeWidth={2} aria-hidden />
                  </button>
                </>
              )}
            </div>
          </header>

          {/* 分类 Tab */}
          <div className={styles.tabs} role="tablist" aria-label="通知分类">
            {TABS.map((t) => {
              const active = t.key === tab;
              const unread = unreadOf(t.key);
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={[styles.tab, active ? styles['tab--active'] : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                  {unread > 0 ? <span className={styles.tab__dot} aria-hidden /> : null}
                </button>
              );
            })}
          </div>

          {/* 列表 */}
          {loading ? (
            <div className={styles.list}>
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className={styles.itemSkeleton}>
                  <span className="skeleton-shimmer" style={{ width: 40, height: 40, borderRadius: 9999 }} />
                  <span className="skeleton-shimmer" style={{ flex: 1, height: 15, borderRadius: 6 }} />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>
              <Bell size={26} strokeWidth={1.6} aria-hidden />
              <h2 className={styles.empty__title}>这里还没有通知</h2>
              <p className={styles.empty__desc}>
                {tab === 'all'
                  ? '当你收到点赞、回复或新粉丝时，会显示在这里。'
                  : '这个分类下暂时没有新通知。'}
              </p>
            </div>
          ) : (
            <div className={styles.list}>
              {filtered.map((n) => {
                const Icon = VERB_ICON[n.verb];
                const tone = VERB_TONE[n.verb];
                const picked = selected.has(n.notification_id);
                return (
                  <button
                    key={n.notification_id}
                    type="button"
                    className={[
                      styles.item,
                      !n.read ? styles['item--unread'] : '',
                      managing ? styles['item--managing'] : '',
                      picked ? styles['item--picked'] : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-pressed={managing ? picked : undefined}
                    onClick={() => openNotification(n)}
                  >
                    {managing ? (
                      <span
                        className={[styles.item__check, picked ? styles['item__check--on'] : '']
                          .filter(Boolean)
                          .join(' ')}
                        aria-hidden
                      >
                        {picked ? <Check size={13} strokeWidth={3} /> : null}
                      </span>
                    ) : !n.read ? (
                      <span className={styles.item__dot} aria-hidden />
                    ) : null}

                    <span className={styles.item__verb} style={{ color: tone }} aria-hidden>
                      <Icon
                        size={17}
                        strokeWidth={2}
                        fill={n.verb === 'like' ? 'currentColor' : 'none'}
                      />
                    </span>

                    <span className={styles.item__avatar}>
                      <img src={n.actor.avatar_url} alt="" loading="lazy" />
                    </span>

                    <span className={styles.item__body}>
                      <span className={styles.item__text}>{verbText(n)}</span>
                      {n.target_text ? (
                        <span className={styles.item__target}>{n.target_text}</span>
                      ) : null}
                      <time className={styles.item__time} dateTime={n.published_at}>
                        {formatRelativeTime(n.published_at)}
                      </time>
                    </span>

                    {n.target_media ? (
                      <span className={styles.item__thumb}>
                        <img src={n.target_media} alt="" loading="lazy" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}

          <div className={styles.tail} />
        </div>
      </div>

      {/* ---------- 批量删除二次确认 ---------- */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        danger
        title={`删除 ${selected.size} 条通知？`}
        confirmText="删除"
        description="删除后这些通知会从列表中消失，且无法恢复。其他通知不受影响。"
        onConfirm={deleteSelected}
      />
    </AppShell>
  );
}
