import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AdminLayout } from '@admin/components/AdminLayout';
import { RouteFallback } from '@admin/components/RouteFallback';
import { Toaster } from '@admin/components/Toaster';
import { useAdminSessionStore } from '@admin/stores/adminSessionStore';
import { AdminLoginPage } from '@admin/pages/AdminLoginPage';

/* --------------------------------------------------------------------------
 * 管理后台路由（basename = /admin，由 main.tsx 的 BrowserRouter 注入）
 *
 * 与客户端一样按路由分包：登录页静态引入（首屏直达），
 * 其余页面懒加载。页面只从 mocks/adminApi.ts 取数。
 * -------------------------------------------------------------------------- */

const WorkbenchPage = lazy(() =>
  import('@admin/pages/WorkbenchPage').then((m) => ({ default: m.WorkbenchPage })),
);
const ReviewQueuePage = lazy(() =>
  import('@admin/pages/ReviewQueuePage').then((m) => ({ default: m.ReviewQueuePage })),
);
const ReviewDetailPage = lazy(() =>
  import('@admin/pages/ReviewDetailPage').then((m) => ({ default: m.ReviewDetailPage })),
);
const ContentDisposalPage = lazy(() =>
  import('@admin/pages/ContentDisposalPage').then((m) => ({ default: m.ContentDisposalPage })),
);
const UserDisposalPage = lazy(() =>
  import('@admin/pages/UserDisposalPage').then((m) => ({ default: m.UserDisposalPage })),
);
const ReportsAppealsPage = lazy(() =>
  import('@admin/pages/ReportsAppealsPage').then((m) => ({ default: m.ReportsAppealsPage })),
);
const ModerationLogPage = lazy(() =>
  import('@admin/pages/ModerationLogPage').then((m) => ({ default: m.ModerationLogPage })),
);

/** 未认证时不渲染任何后台页面，跳转独立登录入口（PRD 8.11.1） */
function RequireAdminSession({ children }: { children: ReactNode }) {
  const { admin, ready, restore } = useAdminSessionStore();
  const location = useLocation();

  useEffect(() => {
    if (!ready) void restore();
  }, [ready, restore]);

  if (!ready) return <RouteFallback />;
  if (!admin) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

export default function AdminApp() {
  return (
    <>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<AdminLoginPage />} />

          <Route
            element={
              <RequireAdminSession>
                <AdminLayout />
              </RequireAdminSession>
            }
          >
            <Route index element={<WorkbenchPage />} />
            <Route path="/review" element={<ReviewQueuePage />} />
            <Route path="/review/:taskId" element={<ReviewDetailPage />} />
            <Route path="/content" element={<ContentDisposalPage />} />
            <Route path="/users" element={<UserDisposalPage />} />
            <Route path="/reports" element={<ReportsAppealsPage />} />
            <Route path="/logs" element={<ModerationLogPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>

      <Toaster />
    </>
  );
}
