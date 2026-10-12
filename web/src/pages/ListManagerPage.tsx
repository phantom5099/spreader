import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Ban, BellOff, Hash, UserMinus, Plus, ListChecks } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { UserRow } from '@/components/profile/UserRow';
import { UserRowSkeleton } from '@/components/profile/UserRowSkeleton';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { toast } from '@/stores/toastStore';
import { fetchMyLists } from '@/mocks/api';
import { formatCount } from '@/utils/format';
import type { ListTab, TopicSubscription, UserSummary } from '@/types/user';
import styles from './ListManagerPage.module.css';

const TABS: Array<{ key: ListTab; label: string; icon: typeof Ban }> = [
  { key: 'following', label: '关注', icon: ListChecks },
  { key: 'followers', label: '粉丝', icon: UserMinus },
  { key: 'topics', label: '我关注的话题', icon: Hash },
];

interface PendingAction {
  kind: 'unblock' | 'unmute' | 'unfollow' | 'untopic';
  label: string;
  handle?: string;
  topic?: string;
}

/**
 * 名单管理
 * 三 Tab —— 黑名单 / 静音列表 / 我关注的话题。
 */
export function ListManagerPage() {
  const navigate = useNavigate();
  const { tab: routeTab } = useParams();

  const initial: ListTab =
    routeTab === 'muted' ? 'followers' : routeTab === 'topics' ? 'topics' : 'following';

  const [tab, setTab] = useState<ListTab>(initial);
  const [blocked, setBlocked] = useState<UserSummary[]>([]);
  const [muted, setMuted] = useState<UserSummary[]>([]);
  const [topics, setTopics] = useState<TopicSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingAction | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    void fetchMyLists('following').then((data) => {
      if (!alive) return;
      setBlocked(data.blocked);
      setMuted(data.muted);
      setTopics(data.topics);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, []);

  /* 三 Tab 分别对应：黑名单 / 静音 / 话题。*/
  const body = () => {
    if (loading) return <UserRowSkeleton count={6} />;

    if (tab === 'topics') {
      if (topics.length === 0) {
        return (
          <ListEmpty
            icon={Hash}
            title="还没有关注任何话题"
            desc="在动态里点击话题标签即可关注，相关的新内容会出现在推荐流。"
            action={{ text: '去搜索话题', onClick: () => navigate('/search') }}
          />
        );
      }
      return (
        <div className={styles.topicList}>
          {topics.map((t) => (
            <div key={t.topic} className={styles.topic}>
              <span className={styles.topic__avatar}>
                <Hash size={20} strokeWidth={2.2} aria-hidden />
              </span>
              <div className={styles.topic__body}>
                <span className={styles.topic__name}>#{t.topic}</span>
                <span className={styles.topic__meta}>
                  {t.category ? `${t.category} · ` : ''}
                  {formatCount(t.post_count)} 条动态
                </span>
              </div>
              <button
                type="button"
                className={styles.topic__remove}
                onClick={() => setPending({ kind: 'untopic', label: `#${t.topic}`, topic: t.topic })}
              >
                取消关注
              </button>
            </div>
          ))}
        </div>
      );
    }

    const people = tab === 'following' ? blocked : muted;
    const isBlockTab = tab === 'following';

    if (people.length === 0) {
      return isBlockTab ? (
        <ListEmpty
          icon={Ban}
          title="黑名单是空的"
          desc="被你拉黑的人会显示在这里。拉黑后对方无法关注你或查看你的动态。"
        />
      ) : (
        <ListEmpty
          icon={BellOff}
          title="没有静音的用户"
          desc="静音后你仍会保留关注关系，只是不再看到 TA 的动态。"
        />
      );
    }

    return (
      <div className={styles.sectionList}>
        <div className={styles.sectionHead}>
          {isBlockTab ? (
            <>
              <Ban size={15} strokeWidth={2} aria-hidden />
              黑名单 · {people.length} 人
            </>
          ) : (
            <>
              <BellOff size={15} strokeWidth={2} aria-hidden />
              静音 · {people.length} 人
            </>
          )}
        </div>

        {people.map((u) => (
          <UserRow
            key={u.user_id}
            user={u}
            showFollow={false}
            onOpen={() => navigate(`/u/${u.handle}`)}
            trailing={
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() =>
                  setPending({
                    kind: isBlockTab ? 'unblock' : 'unmute',
                    label: `@${u.handle}`,
                    handle: u.handle,
                  })
                }
              >
                {isBlockTab ? '解除拉黑' : '取消静音'}
              </button>
            }
          />
        ))}
      </div>
    );
  };

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.page__main}>
          <PageHeader
            title="名单管理"
            subtitle="拉黑 · 静音 · 话题"
            onBack={() => navigate('/settings')}
          />

          <div className={styles.tabs} role="tablist" aria-label="名单分类">
            {TABS.map((t) => {
              const active = t.key === tab;
              const count =
                t.key === 'topics' ? topics.length : t.key === 'following' ? blocked.length : muted.length;
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
                  <t.icon size={15} strokeWidth={2} aria-hidden />
                  <span className={styles.tab__label}>{t.label}</span>
                  {!loading && count > 0 ? <span className={styles.tab__count}>{count}</span> : null}
                </button>
              );
            })}
          </div>

          {body()}

          <div className={styles.tail} />
        </div>
      </div>

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending ? `确认对 ${pending.label} 执行操作？` : ''}
        confirmText="确认"
        description={
          pending?.kind === 'unblock'
            ? '解除后，对方可以重新关注你、查看你的动态并给你发消息。'
            : pending?.kind === 'unmute'
              ? '取消静音后，你将重新在信息流中看到 TA 的动态。'
              : `取消关注 #${pending?.topic ?? ''} 后，相关的新内容将不再优先推荐给你。`
        }
        onConfirm={() => {
          if (!pending) return;
          if (pending.kind === 'unblock') {
            setBlocked((prev) => prev.filter((u) => u.handle !== pending.handle));
            toast.success(`已解除对 ${pending.label} 的拉黑`);
          } else if (pending.kind === 'unmute') {
            setMuted((prev) => prev.filter((u) => u.handle !== pending.handle));
            toast.success(`已取消静音 ${pending.label}`);
          } else {
            setTopics((prev) => prev.filter((t) => t.topic !== pending.topic));
            toast.success(`已取消关注 ${pending.label}`);
          }
          setPending(null);
        }}
      />
    </AppShell>
  );
}

/* -------------------------------------------------------------------------- */

function ListEmpty({
  icon: Icon,
  title,
  desc,
  action,
}: {
  icon: typeof Plus;
  title: string;
  desc: string;
  action?: { text: string; onClick: () => void };
}) {
  return (
    <div className={styles.empty}>
      <span className={styles.empty__icon} aria-hidden>
        <Icon size={26} strokeWidth={1.6} />
      </span>
      <h2 className={styles.empty__title}>{title}</h2>
      <p className={styles.empty__desc}>{desc}</p>
      {action ? (
        <button type="button" className={styles.empty__btn} onClick={action.onClick}>
          {action.text}
        </button>
      ) : null}
    </div>
  );
}
