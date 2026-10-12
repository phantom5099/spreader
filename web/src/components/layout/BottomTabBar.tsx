import { NavLink } from 'react-router-dom';
import { Home, Search, Bell, Mail, CircleUserRound } from 'lucide-react';
import { shellStyles } from './AppShell';
import styles from './BottomTabBar.module.css';

/** 窄屏底部 Tab：5 个一级入口（导航不超 5 项） */
const TABS = [
  { to: '/', label: '首页', icon: Home, badge: 0 },
  { to: '/explore', label: '发现', icon: Search, badge: 0 },
  { to: '/notifications', label: '通知', icon: Bell, badge: 3 },
  { to: '/messages', label: '消息', icon: Mail, badge: 2 },
  { to: '/me', label: '我', icon: CircleUserRound, badge: 0 },
];

function tabClass(isActive: boolean): string {
  const active = isActive ? styles['tabbar__item--active'] : '';
  return [styles.tabbar__item, active].filter(Boolean).join(' ');
}

export function BottomTabBar() {
  return (
    <nav className={shellStyles.shell__tabbar} aria-label="底部导航">
      <div className={styles.tabbar__inner}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) => tabClass(isActive)}
          >
            <span className={styles.tabbar__icon}>
              <tab.icon size={24} strokeWidth={1.9} aria-hidden />
              {tab.badge ? <span className={styles.tabbar__badge}>{tab.badge}</span> : null}
            </span>
            <span className={styles.tabbar__label}>{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
