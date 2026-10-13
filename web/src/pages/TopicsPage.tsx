import { useNavigate } from 'react-router-dom';
import { ChevronRight, Flame, Hash, TrendingDown, TrendingUp } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Aside } from '@/components/layout/Aside';
import { HOT_TOPICS, TOPIC_GROUPS } from '@/mocks/topics';
import { formatCount } from '@/utils/format';
import styles from './TopicsPage.module.css';

/**
 * 话题广场
 */
export function TopicsPage() {
  const navigate = useNavigate();

  const open = (topic: string) => navigate(`/topic/${encodeURIComponent(topic)}`);

  return (
    <AppShell aside={<Aside />}>
      <div className={styles.page}>
        <div className={styles.page__main}>
          {/* ---------- 头部 ---------- */}
          <header className={styles.head}>
            <h1 className={styles.head__title}>话题</h1>
            <span className={styles.head__sub}>发现值得聊的话题</span>
          </header>

          {/* ---------- 当前热门 ---------- */}
          <section className={styles.section} aria-labelledby="hot-topics">
            <div className={styles.section__head}>
              <span className={styles.section__icon} aria-hidden>
                <Flame size={15} strokeWidth={2.2} />
              </span>
              <h2 id="hot-topics" className={styles.section__title}>
                当前热门
              </h2>
              <span className={styles.section__hint}>按近 24 小时热度排序</span>
            </div>

            <div className={styles.hotList}>
              {HOT_TOPICS.map((t, i) => {
                const down = t.delta < 0;
                return (
                  <button
                    key={t.topic}
                    type="button"
                    className={styles.hot}
                    onClick={() => open(t.topic)}
                  >
                    <span
                      className={[styles.hot__rank, i < 3 ? styles['hot__rank--top'] : '']
                        .filter(Boolean)
                        .join(' ')}
                      aria-hidden
                    >
                      {i + 1}
                    </span>

                    <span className={styles.hot__body}>
                      <span className={styles.hot__topic}>#{t.topic}</span>
                      <span className={styles.hot__meta}>
                        {t.category} · {formatCount(t.post_count)} 条动态
                      </span>
                    </span>

                    <span
                      className={[styles.hot__delta, down ? styles['hot__delta--down'] : '']
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {down ? (
                        <TrendingDown size={13} strokeWidth={2.2} aria-hidden />
                      ) : (
                        <TrendingUp size={13} strokeWidth={2.2} aria-hidden />
                      )}
                      {down ? '' : '+'}
                      {t.delta}%
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ---------- 分类推荐 ---------- */}
          {TOPIC_GROUPS.map((group) => (
            <section
              key={group.category}
              className={styles.section}
              aria-labelledby={`cat-${group.category}`}
            >
              <div className={styles.section__head}>
                <h2 id={`cat-${group.category}`} className={styles.section__title}>
                  {group.category}
                </h2>
                <span className={styles.section__hint}>{group.blurb}</span>
              </div>

              <div className={styles.topicList}>
                {group.topics.map((t) => (
                  <button
                    key={t.topic}
                    type="button"
                    className={styles.topic}
                    onClick={() => open(t.topic)}
                  >
                    <span className={styles.topic__avatar} aria-hidden>
                      <Hash size={20} strokeWidth={2.2} />
                    </span>
                    <span className={styles.topic__body}>
                      <span className={styles.topic__name}>#{t.topic}</span>
                      <span className={styles.topic__meta}>
                        {formatCount(t.post_count)} 条动态
                      </span>
                    </span>
                    <span className={styles.topic__chev} aria-hidden>
                      <ChevronRight size={18} strokeWidth={2} />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}

          <div className={styles.tail} />
        </div>
      </div>
    </AppShell>
  );
}
