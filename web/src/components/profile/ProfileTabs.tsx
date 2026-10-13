import type { ProfileTab } from '@/types/user';
import styles from './ProfileTabs.module.css';

interface ProfileTabsProps {
  value: ProfileTab;
  counts: Record<ProfileTab, number>;
  onChange: (tab: ProfileTab) => void;
}

const TABS: Array<{ key: ProfileTab; label: string }> = [
  { key: 'posts', label: '动态' },
  { key: 'media', label: '媒体' },
  { key: 'likes', label: '喜欢' },
];

/**
 * 个人主页三 Tab（吸顶）
 * 动态 | 媒体 | 喜欢
 * 采用下划线指示器（与信息流的胶囊 Tab 区分，避免两个吸顶栏视觉打架）。
 */
export function ProfileTabs({ value, counts, onChange }: ProfileTabsProps) {
  return (
    <div className={styles.tabs} role="tablist" aria-label="主页内容分类">
      {TABS.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            className={[styles.tab, active ? styles['tab--active'] : ''].filter(Boolean).join(' ')}
            onClick={() => onChange(t.key)}
          >
            <span className={styles.tab__label}>{t.label}</span>
            {counts[t.key] > 0 ? <span className={styles.tab__count}>{counts[t.key]}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
