import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/*
 * 客户端入口（index.html）。
 *
 * 管理后台是独立进程、独立配置（vite.admin.config.ts，端口 5174，
 * 产物 dist/admin），两者互不感知：客户端不知道 /admin 的存在，
 * 后台也不依赖客户端 dev server。共用同一套工程约定（tokens / 组件风格 /
 * 数据层模式），但运行与部署完全分开。
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: false,
  },
  build: {
    outDir: 'dist/client',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
      },
    },
  },
});
