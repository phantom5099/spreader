import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath, URL } from 'node:url';

/*
 * 管理后台独立进程配置（与客户端 vite.config.ts 完全分离）
 *
 * - dev:      bun run dev:admin   → http://127.0.0.1:5174
 * - build:    bun run build:admin → dist/admin/（独立产物，可单独部署到
 *             独立域名 / 独立静态托管，不与客户端 dist/client 混布）
 * - preview:  bun run preview:admin → http://127.0.0.1:4174
 *
 */
function adminFallback(): Plugin {
  const handler = (req: IncomingMessage, _res: ServerResponse, next: () => void) => {
    const url = req.url ?? '';
    const path = url.split('?')[0];

    /* Vite 内部路径（/@vite/client、/@fs/...、/@id/...）与 node_modules 直接放行 */
    if (path.startsWith('/@') || path.startsWith('/node_modules')) {
      next();
      return;
    }

    /* 带扩展名的请求是模块或资源（.tsx/.ts/.css/.js/.png/...），一律放行 */
    const lastSegment = path.slice(path.lastIndexOf('/') + 1);
    if (lastSegment.includes('.')) {
      next();
      return;
    }

    /* 其余（/、/login、/review、/review/t_1001 ...）都是页面导航 → admin.html */
    req.url = '/admin.html';
    next();
  };

  return {
    name: 'spreader-admin-fallback',
    /* configureServer 默认在内部中间件之前执行，页面导航会先于
     * Vite 内置 fallback 被改写，不会落回客户端 index.html */
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  plugins: [react(), adminFallback()],
  /* 客户端入口地址：管理后台是独立进程，“返回客户端”需要一个真实可达的
   * 客户端地址（默认本地 dev 端口）；生产部署用环境变量覆盖，例如
   * CLIENT_URL=https://spreader.app bun run build:admin */
  define: {
    'import.meta.env.VITE_CLIENT_URL': JSON.stringify(
      process.env.CLIENT_URL ?? 'http://127.0.0.1:5173',
    ),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@admin': fileURLToPath(new URL('./admin', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: false,
  },
  preview: {
    host: '127.0.0.1',
    port: 4174,
    strictPort: false,
  },
  build: {
    outDir: 'dist/admin',
    rollupOptions: {
      input: {
        admin: fileURLToPath(new URL('./admin.html', import.meta.url)),
      },
    },
  },
});
