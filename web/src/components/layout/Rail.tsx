import { NavLink } from 'react-router-dom';
import {
  Home,
  Search,
  Bell,
  Mail,
  Bookmark,
  Users,
  CircleUserRound,
  Plus,
} from 'lucide-react';
import { AccountMenu } from './AccountMenu';
import styles from './Rail.module.css';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: '首页', icon: Home },
  { to: '/explore', label: '发现', icon: Search },
  { to: '/notifications', label: '通知', icon: Bell, badge: 3 },
  { to: '/messages', label: '消息', icon: Mail, badge: 2 },
  { to: '/bookmarks', label: '收藏', icon: Bookmark },
  { to: '/people', label: '联系人', icon: Users },
  { to: '/me', label: '我', icon: CircleUserRound },
];

function navClass(isActive: boolean): string {
  const active = isActive ? styles['rail__item--active'] : '';
  return [styles.rail__item, active].filter(Boolean).join(' ');
}

export function Rail() {
  return (
    <nav className={styles.rail}>
      <NavLink to="/" className={styles.rail__logo} aria-label="spreader 首页">
        <span className={styles.rail__logoMark}>S</span>
      </NavLink>

      <ul className={styles.rail__nav}>
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => navClass(isActive)}
            >
              <span className={styles.rail__icon}>
                <item.icon size={26} strokeWidth={2} aria-hidden />
              </span>
              <span className={styles.rail__label}>{item.label}</span>
              {item.badge ? <span className={styles.rail__badge}>{item.badge}</span> : null}
            </NavLink>
          </li>
        ))}
      </ul>

      <NavLink to="/compose" className={styles.rail__compose} aria-label="发帖" title="发帖">
        <Plus size={24} strokeWidth={2.4} aria-hidden />
      </NavLink>

      <AccountMenu />
    </nav>
  );
}
