import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AtSign,
  Bell,
  CheckCheck,
  Heart,
  MessageCircle,
  Repeat2,
  UserPlus,
  Quote,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { toast } from '@/stores/toastStore';
import { NOTIFICATIONS } from '@/mocks/messages';
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

/** 动词对应的语气色（点赞=like 色、转推=repost 色、其余用主色） */
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
      return `${name} 转推了你的动态`;
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
 * 分类 Tab（全部/提及/点赞/关注/回复）+ 未读项左侧圆点
 */
export function NotificationPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<NotificationCategory>('all');
  const [items, setItems] = useState<NotificationItem[]>(NOTIFICATIONS);

  const filtered = useMemo(
    () => (tab === 'all' ? items : items.filter((i) => i.category === tab)),
    [items, tab],
  );

  const unreadOf = (key: NotificationCategory) =>
    key === 'all' ? items.filter((i) => !i.read).length : items.filter((i) => i.category === key && !i.read).length;

  const totalUnread = unreadOf('all');

  const openNotification = (n: NotificationItem) => {
    setItems((prev) =>
      prev.map((x) => (x.notification_id === n.notification_id ? { ...x, read: true } : x)),
    );
    if (n.content_id) navigate(`/post/${n.content_id}`);
    else navigate(`/u/${n.actor.handle}`);
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
              <button
                type="button"
                className={styles.head__icon}
                aria-label="全部标为已读"
                title="全部标为已读"
                disabled={totalUnread === 0}
                onClick={() => {
                  setItems((prev) => prev.map((x) => ({ ...x, read: true })));
                  toast.success('已全部标为已读');
                }}
              >
                <CheckCheck size={19} strokeWidth={2} aria-hidden />
              </button>
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
          {filtered.length === 0 ? (
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
                return (
                  <button
                    key={n.notification_id}
                    type="button"
                    className={[styles.item, !n.read ? styles['item--unread'] : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => openNotification(n)}
                  >
                    {!n.read ? <span className={styles.item__dot} aria-hidden /> : null}

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
    </AppShell>
  );
}
