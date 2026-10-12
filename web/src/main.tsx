import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { initAppearance } from '@/stores/appearanceStore';
import '@/styles/tokens.css';
import '@/styles/app.css';

/* 主题/字号：首帧已由 index.html 的内联脚本写入，这里接管后续系统主题变化 */
initAppearance();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
