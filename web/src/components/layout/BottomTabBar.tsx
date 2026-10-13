import { Link, useLocation } from 'react-router-dom';
import { TABBAR_ITEMS, isActivePath } from './navItems';
import { shellStyles } from './AppShell';
import styles from './BottomTabBar.module.css';

function tabClass(active: boolean): string {
  const on = active ? styles['tabbar__item--active'] : '';
  return [styles.tabbar__item, on].filter(Boolean).join(' ');
}

export function BottomTabBar() {
  const { pathname } = useLocation();

  return (
    <nav className={shellStyles.shell__tabbar} aria-label="底部导航">
      <div className={styles.tabbar__inner}>
        {TABBAR_ITEMS.map((tab) => {
          const active = isActivePath(tab.to, pathname);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={tabClass(active)}
              aria-current={active ? 'page' : undefined}
            >
              <span className={styles.tabbar__icon}>
                <tab.icon size={24} strokeWidth={1.9} aria-hidden />
                {tab.badge ? <span className={styles.tabbar__badge}>{tab.badge}</span> : null}
              </span>
              <span className={styles.tabbar__label}>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
