import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

/**
 * 登录守卫
 * Demo 默认已登录；一旦在账号菜单里"退出登录"，
 * 应用页就应当被挡回登录页 —— 否则退出只是换了个 URL，没有实际语义。
 *
 * 放行的路径（无需登录）：
 *   /login /signup /signup/profile /welcome
 */
const PUBLIC_PREFIXES = ['/login', '/signup', '/welcome'];

export function RequireAuth({ children }: { children: ReactNode }) {
  const authed = useAuthStore((s) => s.authed);
  const location = useLocation();

  const isPublic = PUBLIC_PREFIXES.some(
    (p) => location.pathname === p || location.pathname.startsWith(`${p}/`),
  );

  if (!authed && !isPublic) {
    /* 带上 from，登录成功后可以回到原处 */
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}
