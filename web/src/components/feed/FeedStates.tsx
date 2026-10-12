import { CheckCircle2, Inbox, UserPlus } from 'lucide-react';
import styles from './FeedStates.module.css';

/** 列表底部：加载更多 */
export function FeedLoadingMore() {
  return (
    <div className={styles.tail} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden />
      正在加载更多
    </div>
  );
}

/** 列表底部：已到底 */
export function FeedEnd({ tab }: { tab: 'for_you' | 'following' }) {
  return (
    <div className={styles.end} role="status">
      <span className={styles.end__mark} aria-hidden>
        <CheckCircle2 size={22} strokeWidth={2} />
      </span>
      {tab === 'following' ? '关注的人最近的内容都看完啦' : '已经到底了，去发现更多有趣的人吧'}
    </div>
  );
}

/** 加载失败 */
export function FeedError({
  message,
  onRetry,
}: {
  message?: string | null;
  onRetry: () => void;
}) {
  return (
    <div className={styles.error} role="alert">
      <div className={styles.error__title}>内容加载失败</div>
      <p className={styles.error__desc}>{message || '网络似乎不太稳定，请稍后重试。'}</p>
      <div className={styles.error__actions}>
        <button type="button" className={`${styles.btn} ${styles['btn--primary']}`} onClick={onRetry}>
          重新加载
        </button>
      </div>
    </div>
  );
}

/** 空列表 */
export function FeedEmpty({ tab }: { tab: 'for_you' | 'following' }) {
  const following = tab === 'following';
  return (
    <div className={styles.empty}>
      <span className={styles.empty__icon} aria-hidden>
        {following ? <UserPlus size={26} strokeWidth={1.75} /> : <Inbox size={26} strokeWidth={1.75} />}
      </span>
      <div className={styles.empty__title}>{following ? '还没有关注任何人' : '暂时没有内容'}</div>
      <p className={styles.empty__desc}>
        {following
          ? '关注一些感兴趣的人，他们的新动态会出现在这里。'
          : '换个时间再来看看，或者去发现页逛逛。'}
      </p>
      <button type="button" className={`${styles.btn} ${styles['btn--primary']}`}>
        {following ? '发现值得关注的人' : '刷新试试'}
      </button>
    </div>
  );
}
