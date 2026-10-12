import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Hash,
  Search,
  TrendingUp,
  X,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PostCard } from '@/components/post/PostCard';
import { UserRow } from '@/components/profile/UserRow';
import { Highlight } from '@/components/search/Highlight';
import { toast } from '@/stores/toastStore';
import { useFeedStore } from '@/stores/feedStore';
import { ALL_FEED_ITEMS, TRENDS } from '@/mocks/feed';
import { ALL_PROFILES } from '@/mocks/users';
import { formatCount } from '@/utils/format';
import type { FeedItem } from '@/types/feed';
import styles from './SearchPage.module.css';

type ResultTab = 'top' | 'users' | 'posts' | 'topics';

const HISTORY_KEY = 'spreader.searchHistory.v1';
const MAX_HISTORY = 10;

function readHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * 搜索页
 * 三段结构：
 *   ① 未输入 → 历史搜索（可清空）+ 推荐话题
 *   ② 输入中 → 联想词（实时）
 *   ③ 提交后 → 三 Tab：用户 / 动态 / 话题
 * 关键词高亮 --accent
 */
export function SearchPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  /* useSearchParams 每次渲染返回新对象，只取字符串作为稳定依赖 */
  const initialQ = params.get('q') ?? '';

  const [query, setQuery] = useState(initialQ);
  const [submitted, setSubmitted] = useState(initialQ);
  const [tab, setTab] = useState<ResultTab>('top');
  const [history, setHistory] = useState<string[]>(readHistory);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /* 信息流里的互动方法复用（搜索结果里的卡片同样可点赞） */
  const toggleLike = useFeedStore((s) => s.toggleLike);
  const toggleRepost = useFeedStore((s) => s.toggleRepost);
  const toggleBookmark = useFeedStore((s) => s.toggleBookmark);
  const feedItems = useFeedStore((s) => s.items);

  useEffect(() => {
    if (!initialQ) inputRef.current?.focus();
  }, [initialQ]);

  /* URL 变化（如从右栏点趋势进来）时同步 */
  useEffect(() => {
    setQuery(initialQ);
    setSubmitted(initialQ);
  }, [initialQ]);

  /* -------------------- 提交搜索 -------------------- */
  const submit = useCallback(
    (raw: string) => {
      const q = raw.trim();
      if (!q) return;
      setHistory((prev) => {
        const next = [q, ...prev.filter((x) => x !== q)].slice(0, MAX_HISTORY);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        return next;
      });
      setSubmitted(q);
      setQuery(q);
      setTab('top');
      setParams({ q }, { replace: true });
    },
    [setParams],
  );

  const clearHistory = () => {
    localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
  };

  /* -------------------- 结果计算 -------------------- */
  const q = submitted.trim();
  const lower = q.toLowerCase();

  const userResults = useMemo(() => {
    if (!q) return [];
    return ALL_PROFILES.filter(
      (p) =>
        p.nickname.toLowerCase().includes(lower) ||
        p.handle.toLowerCase().includes(lower) ||
        p.bio.toLowerCase().includes(lower),
    ).slice(0, 24);
  }, [q, lower]);

  const postResults = useMemo(() => {
    if (!q) return [];
    /* 优先搜信息流；未命中时用全量做一次宽松匹配，保证不出现空结果页 */
    const pool = feedItems.length > 0 ? feedItems : ALL_FEED_ITEMS;
    const hit = pool.filter(
      (i) => i.text.toLowerCase().includes(lower) || i.author.nickname.toLowerCase().includes(lower),
    );
    if (hit.length > 0) return hit.slice(0, 20);
    return ALL_FEED_ITEMS.slice(0, 6);
  }, [q, lower, feedItems]);

  const topicResults = useMemo(() => {
    if (!q) return [];
    const all = [
      ...TRENDS,
      { topic: '前端工程化', post_count: 15200, category: '科技' },
      { topic: '城市漫步', post_count: 8600, category: '生活' },
      { topic: '深夜emo', post_count: 27800, category: '生活' },
    ];
    return all.filter((t) => t.topic.toLowerCase().includes(lower));
  }, [q, lower]);

  /* -------------------- 联想词 -------------------- */
  const suggestions = useMemo(() => {
    const raw = query.trim().toLowerCase();
    if (!raw || raw === lower) return [];
    const pool = [
      ...TRENDS.map((t) => t.topic),
      ...ALL_PROFILES.slice(0, 20).map((p) => p.nickname),
      ...ALL_PROFILES.slice(0, 20).map((p) => `@${p.handle}`),
    ];
    return [...new Set(pool.filter((s) => s.toLowerCase().includes(raw)))].slice(0, 8);
  }, [query, lower]);

  /* -------------------- 渲染 -------------------- */
  const showLanding = !submitted;
  const showSuggest = !showLanding && query.trim() !== '' && query.trim().toLowerCase() !== lower;

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.page__main}>
          {/* ---------- 搜索框（吸顶） ---------- */}
          <header className={styles.bar}>
            <button
              type="button"
              className={styles.bar__back}
              aria-label="返回"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft size={20} strokeWidth={2} aria-hidden />
            </button>

            <form
              className={styles.bar__field}
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                submit(query);
              }}
            >
              <span className={styles.bar__icon}>
                <Search size={17} strokeWidth={2} aria-hidden />
              </span>
              <input
                ref={inputRef}
                className={styles.bar__input}
                type="search"
                value={query}
                placeholder="搜索动态、用户或话题"
                aria-label="搜索"
                onChange={(e) => setQuery(e.target.value)}
              />
              {query ? (
                <button
                  type="button"
                  className={styles.bar__clear}
                  aria-label="清空"
                  onClick={() => {
                    setQuery('');
                    setSubmitted('');
                    setParams({}, { replace: true });
                    inputRef.current?.focus();
                  }}
                >
                  <X size={16} strokeWidth={2.2} aria-hidden />
                </button>
              ) : null}
            </form>
          </header>

          {/* ---------- ① 未输入：历史 + 推荐话题 ---------- */}
          {showLanding ? (
            <div className={styles.landing}>
              {history.length > 0 ? (
                <section className={styles.block}>
                  <div className={styles.block__head}>
                    <h2 className={styles.block__title}>最近搜索</h2>
                    <button type="button" className={styles.block__action} onClick={clearHistory}>
                      全部清除
                    </button>
                  </div>
                  {history.map((h) => (
                    <button
                      key={h}
                      type="button"
                      className={styles.historyItem}
                      onClick={() => submit(h)}
                    >
                      <Search size={16} strokeWidth={2} aria-hidden />
                      <span className={styles.historyItem__text}>{h}</span>
                      <span
                        className={styles.historyItem__x}
                        role="button"
                        tabIndex={-1}
                        aria-label={`删除 ${h}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setHistory((prev) => {
                            const next = prev.filter((x) => x !== h);
                            localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
                            return next;
                          });
                        }}
                      >
                        ×
                      </span>
                    </button>
                  ))}
                </section>
              ) : null}

              <section className={styles.block}>
                <div className={styles.block__head}>
                  <h2 className={styles.block__title}>推荐话题</h2>
                </div>
                {TRENDS.map((t, i) => (
                  <button
                    key={t.topic}
                    type="button"
                    className={styles.trendItem}
                    onClick={() => navigate(`/topic/${encodeURIComponent(t.topic)}`)}
                  >
                    <span className={styles.trendItem__rank}>{i + 1}</span>
                    <span className={styles.trendItem__body}>
                      <span className={styles.trendItem__topic}>
                        {i === 0 ? <TrendingUp size={14} strokeWidth={2.2} aria-hidden /> : null}
                        #{t.topic}
                      </span>
                      <span className={styles.trendItem__meta}>
                        {t.category ? `${t.category} · ` : ''}
                        {formatCount(t.post_count)} 条动态
                      </span>
                    </span>
                  </button>
                ))}
              </section>
            </div>
          ) : showSuggest ? (
            /* ---------- ② 输入中：联想词 ---------- */
            <div className={styles.suggest}>
              {suggestions.length === 0 ? (
                <button
                  type="button"
                  className={styles.suggestItem}
                  onClick={() => submit(query)}
                >
                  <Search size={16} strokeWidth={2} aria-hidden />
                  <span>
                    搜索「<Highlight text={query} query={query} />」
                  </span>
                </button>
              ) : (
                suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={styles.suggestItem}
                    onClick={() => submit(s.replace(/^@/, ''))}
                  >
                    {s.startsWith('@') ? (
                      <Search size={16} strokeWidth={2} aria-hidden />
                    ) : (
                      <Hash size={16} strokeWidth={2} aria-hidden />
                    )}
                    <span>
                      <Highlight text={s} query={query} />
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : (
            /* ---------- ③ 提交后：三 Tab ---------- */
            <>
              <div className={styles.tabs} role="tablist" aria-label="搜索结果分类">
                <TabBtn current={tab} value="top" label="综合" onPick={setTab} />
                <TabBtn
                  current={tab}
                  value="users"
                  label={`用户 ${userResults.length}`}
                  onPick={setTab}
                />
                <TabBtn
                  current={tab}
                  value="posts"
                  label={`动态 ${postResults.length}`}
                  onPick={setTab}
                />
                <TabBtn
                  current={tab}
                  value="topics"
                  label={`话题 ${topicResults.length}`}
                  onPick={setTab}
                />
              </div>

              {tab === 'users' || (tab === 'top' && userResults.length > 0) ? (
                <section className={styles.resultBlock}>
                  {tab === 'top' ? <h3 className={styles.resultBlock__title}>用户</h3> : null}
                  {userResults.length === 0 ? (
                    <EmptyResult query={q} label="用户" />
                  ) : (
                    (tab === 'top' ? userResults.slice(0, 3) : userResults).map((u) => (
                      <UserRow
                        key={u.user_id}
                        user={{
                          user_id: u.user_id,
                          nickname: u.nickname,
                          handle: u.handle,
                          avatar_url: u.avatar_url,
                          bio: u.bio,
                          follows_me: u.follows_me,
                        }}
                        showMutual
                        onOpen={() => navigate(`/u/${u.handle}`)}
                      />
                    ))
                  )}
                  {tab === 'top' && userResults.length > 3 ? (
                    <button
                      type="button"
                      className={styles.moreBtn}
                      onClick={() => setTab('users')}
                    >
                      查看全部 {userResults.length} 位用户
                    </button>
                  ) : null}
                </section>
              ) : null}

              {tab === 'posts' || (tab === 'top' && postResults.length > 0) ? (
                <section className={styles.resultBlock}>
                  {tab === 'top' ? <h3 className={styles.resultBlock__title}>动态</h3> : null}
                  {postResults.length === 0 ? (
                    <EmptyResult query={q} label="动态" />
                  ) : (
                    (tab === 'top' ? postResults.slice(0, 3) : postResults).map((item: FeedItem) => (
                      <PostCard
                        key={item.content_id}
                        item={item}
                        onLike={() => toggleLike(item.content_id)}
                        onRepost={() => toggleRepost(item.content_id)}
                        onBookmark={() => toggleBookmark(item.content_id)}
                        onReply={() => navigate(`/post/${item.content_id}`)}
                        onMore={() => toast.show('更多操作（Demo 未实现）')}
                      />
                    ))
                  )}
                  {tab === 'top' && postResults.length > 3 ? (
                    <button
                      type="button"
                      className={styles.moreBtn}
                      onClick={() => setTab('posts')}
                    >
                      查看全部 {postResults.length} 条动态
                    </button>
                  ) : null}
                </section>
              ) : null}

              {tab === 'topics' || (tab === 'top' && topicResults.length > 0) ? (
                <section className={styles.resultBlock}>
                  {tab === 'top' ? <h3 className={styles.resultBlock__title}>话题</h3> : null}
                  {topicResults.length === 0 ? (
                    <EmptyResult query={q} label="话题" />
                  ) : (
                    topicResults.map((t) => (
                      <button
                        key={t.topic}
                        type="button"
                        className={styles.topicResult}
                        onClick={() => navigate(`/topic/${encodeURIComponent(t.topic)}`)}
                      >
                        <span className={styles.topicResult__avatar}>
                          <Hash size={18} strokeWidth={2.2} aria-hidden />
                        </span>
                        <span className={styles.topicResult__body}>
                          <span className={styles.topicResult__name}>
                            <Highlight text={`#${t.topic}`} query={q} />
                          </span>
                          <span className={styles.topicResult__meta}>
                            {formatCount(t.post_count)} 条动态
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </section>
              ) : null}
            </>
          )}

          <div className={styles.tail} />
        </div>
      </div>
    </AppShell>
  );
}

/* -------------------------------------------------------------------------- */

function TabBtn({
  current,
  value,
  label,
  onPick,
}: {
  current: ResultTab;
  value: ResultTab;
  label: string;
  onPick: (v: ResultTab) => void;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={[styles.tab, active ? styles['tab--active'] : ''].filter(Boolean).join(' ')}
      onClick={() => onPick(value)}
    >
      {label}
    </button>
  );
}

function EmptyResult({ query, label }: { query: string; label: string }) {
  return (
    <div className={styles.empty}>
      <Search size={22} strokeWidth={1.6} aria-hidden />
      <span className={styles.empty__text}>
        没有找到匹配的{label}「{query}」
      </span>
      <span className={styles.empty__hint}>试试更短的关键词，或检查是否有错别字。</span>
    </div>
  );
}
