import styles from './UserRow.module.css';

/** 用户行骨架（列表加载中） */
export function UserRowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.row} aria-hidden>
          <span
            className={styles.row__avatar}
            style={{ background: 'var(--skeleton)' }}
          />
          <div className={styles.row__body} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span
              className="skeleton-shimmer"
              style={{ width: '34%', height: 13, borderRadius: 4 }}
            />
            <span
              className="skeleton-shimmer"
              style={{ width: '24%', height: 12, borderRadius: 4 }}
            />
            <span
              className="skeleton-shimmer"
              style={{ width: '68%', height: 12, borderRadius: 4 }}
            />
          </div>
          <span
            className="skeleton-shimmer"
            style={{ width: 72, height: 30, borderRadius: 9999, flex: '0 0 auto', marginTop: 4 }}
          />
        </div>
      ))}
    </>
  );
}
