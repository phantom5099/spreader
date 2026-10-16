import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath, URL } from 'node:url';

/*
 * 管理后台是独立入口：客户端走 index.html，管理后台走 admin.html。
 * 两者同一套工程约定（tokens / 组件 / 数据层风格），但构建产物相互独立，
 * 部署时可分别发布 —— 对应 PRD「管理后台独立于客户端、单独部署、独立访问」。
 *
 * /admin、/admin/login 这类路径在 dev / preview 下需要命中 admin.html，
 * 这里加一个极薄的重写中间件。关键约束：只重写「页面导航」请求，
 * 绝不能把 /admin/main.tsx 这类真实模块请求也改写掉（否则 Vite 会把
 * HTML 当 JS 解析，报 import-analysis 错误）。
 */
function adminEntry(): Plugin {
  const rewrite = (req: IncomingMessage, _res: ServerResponse, next: () => void) => {
    const url = req.url ?? '';
    const path = url.split('?')[0];
    if (path !== '/admin' && !path.startsWith('/admin/')) {
      next();
      return;
    }

    /* 页面导航判定：浏览器导航会带 Accept: text/html；
     * 无 Accept 头的直连（curl / 健康检查）仅当路径末段不含扩展名时才改写，
     * 这样 /admin/main.tsx、/admin/assets/*.js 等模块与资源请求不受影响。 */
    const accept = req.headers.accept ?? '';
    const lastSegment = path.slice(path.lastIndexOf('/') + 1);
    const isPageNavigation = accept.includes('text/html') || !lastSegment.includes('.');
    if (!isPageNavigation) {
      next();
      return;
    }

    const queryIndex = url.indexOf('?');
    req.url = queryIndex >= 0 ? `/admin.html${url.slice(queryIndex)}` : '/admin.html';
    next();
  };

  return {
    name: 'spreader-admin-entry',
    configureServer(server) {
      /* configureServer 默认在内部中间件之前执行，页面导航在到达
       * Vite 内置 SPA fallback（会把 /admin 劫持到 index.html）之前
       * 就被改写到 admin.html。 */
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

export default defineConfig({
  plugins: [react(), adminEntry()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@admin': fileURLToPath(new URL('./admin', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin.html', import.meta.url)),
      },
    },
  },
});
