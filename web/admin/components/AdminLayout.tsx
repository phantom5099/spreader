import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ClipboardCheck,
  Flag,
  LayoutDashboard,
  LogOut,
  ScrollText,
  ShieldAlert,
  UserCog,
} from 'lucide-react';
import { useAdminSessionStore } from '@admin/stores/adminSessionStore';
import { fetchDashboardStats } from '@admin/mocks/adminApi';
import { toast } from '@admin/stores/toastStore';
import { Button } from './Button';
import { cx } from '@admin/cx';
import s from './AdminLayout.module.css';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  /** 顶栏待办角标取数来源 */
  badge?: 'review' | 'reports';
}

const NAV: NavItem[] = [
  { to: '/', label: '工作台', icon: LayoutDashboard, end: true },
  { to: '/review', label: '内容审核', icon: ClipboardCheck, badge: 'review' },  { to: '/content', label: '内容处置', icon: ShieldAlert },
  { to: '/users', label: '用户处置', icon: UserCog },
  { to: '/reports', label: '举报与申诉', icon: Flag, badge: 'reports' },
  { to: '/logs', label: '处置日志', icon: ScrollText },
];

/** 应用外壳：侧边导航 + 顶栏 + 内容区（登录页不套此外壳） */
export function AdminLayout() {
  const admin = useAdminSessionStore((st) => st.admin);
  const signOut = useAdminSessionStore((st) => st.signOut);
  const location = useLocation();
  const navigate = useNavigate();
  const [badges, setBadges] = useState<{ review: number; reports: number }>({
    review: 0,
    reports: 0,
  });

  /* 待办角标：进入后台与每次路由切换时刷新（真实环境改为轮询 / WebSocket） */
  useEffect(() => {
    let alive = true;
    void fetchDashboardStats().then((stats) => {
      if (!alive) return;
      setBadges({ review: stats.pending_review, reports: stats.pending_reports + stats.pending_appeals });
    });
    return () => {
      alive = false;
    };
  }, [location.pathname]);

  const current =
    NAV.find((n) => (n.end ? location.pathname === '/' : location.pathname.startsWith(n.to))) ??
    NAV[0];

  const onSignOut = async () => {
    await signOut();
    toast('已退出管理后台', 'info');
    navigate('/login', { replace: true });
  };

  return (
    <div className={s.shell}>
      <aside className={s.sidebar}>
        <div className={s.brand}>
          <span className={s.brandDot} aria-hidden="true" />
          <span className={s.brandText}>spreader 管理后台</span>
        </div>
        <nav className={s.nav}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cx(s.navItem, isActive && s.navItemActive)}
              title={item.label}
            >
              <item.icon size={17} aria-hidden="true" />
              <span className={s.navLabel}>{item.label}</span>
              {item.badge && badges[item.badge] > 0 ? (
                <span className={s.badge}>{badges[item.badge]}</span>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <div className={s.sidebarFoot}>
          <span className={s.demoTag}>演示环境</span>
          <span className={s.demoHint}>数据为本地 Mock</span>
        </div>
      </aside>

      <div className={s.main}>
        <header className={s.topbar}>
          <div className={s.crumb}>
            <span className={s.crumbRoot}>管理后台</span>
            <span className={s.crumbSep}>/</span>
            <span className={s.crumbCurrent}>{current.label}</span>
          </div>
          <div className={s.topActions}>
            <a
              className={s.backToClient}
              href={import.meta.env.VITE_CLIENT_URL ?? 'http://127.0.0.1:5173'}
              title="返回 spreader 客户端"
            >
              返回客户端
            </a>
            <span className={s.adminName}>{admin?.name ?? admin?.account}</span>
            <Button size="sm" variant="ghost" icon={<LogOut size={14} />} onClick={onSignOut}>
              退出
            </Button>
          </div>
        </header>

        <main className={s.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
