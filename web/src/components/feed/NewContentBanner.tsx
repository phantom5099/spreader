import { ArrowUp } from 'lucide-react';
import styles from './NewContentBanner.module.css';

interface NewContentBannerProps {
  count: number;
  /** 新内容作者头像（最多展示 3 个），增强"确有其事"的可信感 */
  avatars?: string[];
  onClick: () => void;
}

export function NewContentBanner({ count, avatars = [], onClick }: NewContentBannerProps) {
  if (count <= 0) return null;

  const shown = avatars.filter(Boolean).slice(0, 3);

  return (
    <div className={styles.banner}>
      <button type="button" className={styles.banner__btn} onClick={onClick}>
        {shown.length > 0 ? (
          <span className={styles.banner__avatarStack} aria-hidden>
            {shown.map((src, i) => (
              <img key={i} src={src} alt="" />
            ))}
          </span>
        ) : (
          <ArrowUp size={16} strokeWidth={2.4} aria-hidden />
        )}
        {count} 条新内容
      </button>
    </div>
  );
}
