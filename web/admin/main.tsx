import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import AdminApp from './App';
import { useAdminSessionStore } from './stores/adminSessionStore';
import '../src/styles/tokens.css';
import './styles/admin.css';

/* 主题：首帧已由 admin.html 的内联脚本写入 data-theme，这里只恢复登录态 */
useAdminSessionStore.getState().restore();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* basename 取 Vite 的 base：独立进程部署在根路径；
     * 若将来要挂在某域名 /admin 子路径下，只需给 vite.admin.config.ts
     * 加 base: '/admin/'，此处无需改动 */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AdminApp />
    </BrowserRouter>
  </StrictMode>,
);
