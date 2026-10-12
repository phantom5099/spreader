import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, TrendingUp } from 'lucide-react';
import { TRENDS, SUGGESTED_USERS } from '@/mocks/feed';
import { formatCount } from '@/utils/format';
import styles from './Aside.module.css';

/**
 * 右栏
 * 仅在宽屏（三列布局）下显示，由 AppShell 统一控制显隐。
 * 卡片顺序：搜索 → 趋势 → 推荐关注 → 页脚。
 */
export function Aside() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [followed, setFollowed] = useState<Set<string>>(new Set());

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  const toggleFollow = (userId: string) => {
    setFollowed((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  return (
    <div className={styles.aside}>
      {/* ① 搜索 */}
      <form className={styles.search} role="search" onSubmit={submitSearch}>
        <span className={styles.search__icon}>
          <Search size={18} strokeWidth={2} aria-hidden />
        </span>
        <input
          className={styles.search__input}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索"
          aria-label="搜索"
        />
        {query ? (
          <button
            type="button"
            className={styles.search__clear}
            aria-label="清空搜索"
            onClick={() => setQuery('')}
          >
            <X size={17} strokeWidth={2.2} aria-hidden />
          </button>
        ) : null}
      </form>

      {/* ② 趋势 */}
      <section className={styles.card}>
        <h2 className={styles.card__title}>正在发生</h2>
        {TRENDS.map((t, i) => (
          <button
            key={t.topic}
            type="button"
            className={styles.trend}
            onClick={() => navigate(`/search?q=${encodeURIComponent(t.topic)}`)}
          >
            <span className={styles.trend__meta}>
              {i === 0 ? <TrendingUp size={13} strokeWidth={2.2} aria-hidden /> : null}
              {t.category || '趋势'} · 趋势
            </span>
            <span className={styles.trend__topic}>{t.topic}</span>
            <span className={styles.trend__count}>{formatCount(t.post_count)} 条动态</span>
          </button>
        ))}
        <button type="button" className={styles.card__more} onClick={() => navigate('/topics')}>
          显示更多
        </button>
      </section>

      {/* ③ 推荐关注 */}
      <section className={styles.card}>
        <h2 className={styles.card__title}>推荐关注</h2>
        {SUGGESTED_USERS.map((u) => {
          const isFollowed = followed.has(u.user_id);
          return (
            <div
              key={u.user_id}
              className={styles.suggest}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/u/${u.handle}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') navigate(`/u/${u.handle}`);
              }}
            >
              <span className={styles.suggest__avatar}>
                <img src={u.avatar_url} alt="" loading="lazy" />
              </span>
              <span className={styles.suggest__meta}>
                <span className={styles.suggest__name}>
                  <span>{u.nickname}</span>
                </span>
                <span className={styles.suggest__handle}>@{u.handle}</span>
              </span>
              <button
                type="button"
                className={styles.suggest__follow}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFollow(u.user_id);
                }}
              >
                {isFollowed ? '取消关注' : '关注'}
              </button>
            </div>
          );
        })}
        <button type="button" className={styles.card__more}>
          显示更多
        </button>
      </section>

      {/* ④ 页脚 */}
      <footer className={styles.footer}>
        <a href="#service">服务条款</a>
        <a href="#privacy">隐私政策</a>
        <a href="#cookie">Cookie 政策</a>
        <a href="#about">关于我们</a>
        <a href="#help">帮助中心</a>
        <span>© 2026 spreader</span>
      </footer>
    </div>
  );
}
