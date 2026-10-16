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
    <BrowserRouter basename="/admin">
      <AdminApp />
    </BrowserRouter>
  </StrictMode>,
);
