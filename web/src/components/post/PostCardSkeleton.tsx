import styles from './PostCardSkeleton.module.css';

interface PostCardSkeletonProps {
  /** 骨架屏条数（首屏 6 条足够铺满一屏以上） */
  count?: number;
  /** 是否显示媒体占位块（首屏展示，加载更多时可省略更轻） */
  withMedia?: boolean;
}

/**
 * 骨架屏
 * 首屏必须给骨架屏而非空白 loading，避免布局跳动。
 * 形状刻意贴近 PostCard 的真实骨架（头像 40 / 两行头部 / 两行正文 / 媒体块）
 */
export function PostCardSkeleton({ count = 6, withMedia = true }: PostCardSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div className={styles.card} key={i} aria-hidden>
          <div className={styles.card__avatar} />
          <div className={styles.card__body}>
            <div className={styles.card__head}>
              <span className={styles.line} style={{ width: '24%' }} />
              <span className={styles.line} style={{ width: '18%' }} />
            </div>
            <span className={styles.line} style={{ width: '92%' }} />
            <span className={styles.line} style={{ width: '68%' }} />
            {withMedia && i % 3 === 1 ? <div className={styles.card__media} /> : null}
            <div className={styles.card__actions}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
          </div>
        </div>
      ))}
      <span className="visually-hidden" role="status" aria-live="polite">
        正在加载内容
      </span>
    </>
  );
}
