import { Link, useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { RAIL_ITEMS, isActivePath } from './navItems';
import { AccountMenu } from './AccountMenu';
import styles from './Rail.module.css';

function navClass(active: boolean): string {
  return [styles.rail__item, active ? styles['rail__item--active'] : ''].filter(Boolean).join(' ');
}

export function Rail() {
  const location = useLocation();
  const { pathname } = location;

  return (
    <nav className={styles.rail}>
      <Link to="/" className={styles.rail__logo} aria-label="spreader 首页">
        <span className={styles.rail__logoMark}>S</span>
      </Link>

      <ul className={styles.rail__nav}>
        {RAIL_ITEMS.map((item) => {
          const active = isActivePath(item.to, pathname);
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                className={navClass(active)}
                aria-current={active ? 'page' : undefined}
              >
                <span className={styles.rail__icon}>
                  <item.icon size={26} strokeWidth={2} aria-hidden />
                </span>
                <span className={styles.rail__label}>{item.label}</span>
                {item.badge ? <span className={styles.rail__badge}>{item.badge}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className={styles.rail__foot}>
        <Link
          to="/compose"
          state={{ background: location }}
          className={styles.rail__compose}
          aria-label="发帖"
          title="发帖"
        >
          <Plus size={24} strokeWidth={2.4} aria-hidden />
        </Link>

        <AccountMenu />
      </div>
    </nav>
  );
}
