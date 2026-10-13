import type { FeedTab } from '@/types/feed';
import styles from './FeedTabs.module.css';

interface FeedTabsProps {
  value: FeedTab;
  onChange: (tab: FeedTab) => void;
}

const TABS: Array<{ key: FeedTab; label: string }> = [
  { key: 'for_you', label: '推荐' },
  { key: 'following', label: '关注' },
];

/**
 * 吸顶 Tab 栏
 * 只有两个来源，所以不滚动；若要扩展成多 Tab，再引入横向滚动 + 自动居中。
 */
export function FeedTabs({ value, onChange }: FeedTabsProps) {
  return (
    <div className={styles.ftabs} role="tablist" aria-label="信息流来源">
      {TABS.map(({ key, label }) => {
        const active = key === value;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            className={[styles.ftabs__tab, active ? styles['ftabs__tab--active'] : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => onChange(key)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
