import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import styles from './PageHeader.module.css';

interface PageHeaderProps {
  title?: string;
  /** 标题下方的次要信息（如"1,234 条动态"） */
  subtitle?: string;
  /** 是否显示返回箭头（默认显示） */
  showBack?: boolean;
  /** 右侧动作区（图标按钮） */
  actions?: ReactNode;
  /** 自定义返回行为，默认 history.back() */
  onBack?: () => void;
}

/**
 * 次级页面吸顶头部
 * 详情页 / 个人主页 / 设置页等统一使用，保证次级页返回路径一致。
 */
export function PageHeader({
  title,
  subtitle,
  showBack = true,
  actions,
  onBack,
}: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className={styles.header}>
      {showBack ? (
        <button
          type="button"
          className={styles.header__back}
          aria-label="返回"
          onClick={() => (onBack ? onBack() : navigate(-1))}
        >
          <ArrowLeft size={20} strokeWidth={2} aria-hidden />
        </button>
      ) : null}

      <div className={styles.header__titleWrap}>
        {title ? <h1 className={styles.header__title}>{title}</h1> : null}
        {subtitle ? <span className={styles.header__sub}>{subtitle}</span> : null}
      </div>

      {actions ? <div className={styles.header__actions}>{actions}</div> : null}
    </header>
  );
}

export { styles as headerStyles };
