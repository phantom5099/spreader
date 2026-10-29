# AGENTS.md — web/（前端）工作约定

> 本目录是独立的 Vite 工程，自带 `package.json`、lockfile 与工具链。
> 改动本目录下的文件时，**本文件的规则优先于根 `AGENTS.md`**
> （根文件只保留仓库级规则）。

## 技术栈

| 项 | 选型 | 事实源 |
| --- | --- | --- |
| 框架 | React 19 | `package.json` |
| 构建 | Vite 6 | `package.json` |
| 语言 | TypeScript 5（`strict`、`noUnusedLocals`、`noUnusedParameters`） | `tsconfig.json` |
| 路由 | react-router-dom 7 | `package.json` |
| 状态 | Zustand | `package.json` |
| 图标 | lucide-react | `package.json` |
| Lint | ESLint 10 + typescript-eslint + react-hooks + react-refresh | `eslint.config.js` |
| 测试 | Vitest | `vitest.config.ts` |
| 包管理器 | Bun（`packageManager: bun@1.4.0`，lockfile `bun.lock`） | `package.json` |

## 目录结构

```
web/
├── src/                # 客户端（唯一的客户端源码目录；管理端代码不得放这里）
│   ├── pages/          # 路由页面
│   ├── components/     # 组件，按模块分组（feed / post / comment / message / ...）
│   ├── hooks/          # 自定义 hook（useXxx.ts）
│   ├── mocks/          # 数据层（api.ts 是唯一数据入口）
│   ├── stores/         # Zustand 全局状态
│   ├── styles/         # 设计令牌与全局样式（tokens.css / app.css）
│   ├── types/          # 类型定义
│   └── utils/          # 工具函数
├── admin/              # 管理后台——独立应用（独立进程、独立入口与产物）
│   ├── pages/          # 管理端路由页面
│   ├── components/     # 管理端共享组件
│   ├── stores/         # 管理端会话 / toast
│   ├── mocks/          # adminApi.ts：唯一数据入口（接真实后端时换这里）
│   ├── styles/         # admin.css
│   └── main.tsx App.tsx types.ts labels.ts   # 入口 / 路由 / DTO 类型 / 文案映射
├── admin.html          # 管理端 HTML 入口（vite.admin.config.ts 的构建输入）
├── scripts/            # 校验脚本（check-*.cjs）
├── eslint.config.js
├── vite.config.ts            # 客户端配置（端口 5173，产物 dist/client）
├── vite.admin.config.ts      # 管理端配置（端口 5174，产物 dist/admin）
├── vitest.config.ts
└── package.json
```

## 约定（改前端代码时的强制要求）

- TypeScript `strict` 保持 **0 错误**。
- 组件文件用 `PascalCase.tsx`，样式用同名的 `PascalCase.module.css`（现有组件都遵循这个配对）。
- hook 命名为 `useXxx`，放在 `src/hooks/`。
- 颜色 / 尺寸 / 动效**必须**使用 CSS 变量（设计令牌在 `src/styles/tokens.css`）；**禁止硬编码颜色值**。
- 可交互元素需要 `aria-label`；装饰性图标需要 `aria-hidden`。
- 管理端代码只放 `admin/`，运行时与客户端不共享任何东西；两个应用是独立进程、独立构建产物。
- 图标只用 `lucide-react`；不要引入其它图标库，不要复制第三方品牌图标的形状。
- 注释只解释**为什么**，最多 3 行（根文件 §4.1）。

## 命令

```bash
bun install         # 安装依赖（首次）
bun run dev         # 客户端开发服务器 -> http://localhost:5173
bun run dev:admin   # 管理端开发服务器 -> http://localhost:5174
bun run build       # 类型检查 + 构建两个应用 -> web/dist/client + web/dist/admin
bun run build:admin # 只构建管理端 -> web/dist/admin
bun run preview       # 预览客户端构建 -> http://localhost:4173
bun run preview:admin # 预览管理端构建   -> http://localhost:4174
bun run typecheck   # 只做类型检查
bun run lint        # ESLint
bun run test        # Vitest（单次运行）
bun run test:watch  # Vitest（watch 模式）
```

## 测试

- 测试文件与源码同目录，命名 `*.test.ts(x)`；配置在 `vitest.config.ts`。
- 已有测试：`src/utils/*.test.ts` —— 绝不删除或跳过。
- 为验证临时写的测试**做完必须删除**，不要留在仓库里（根文件 §6.5）。
- 不要做无意义的「验证」（例如 `ls` 确认目录或文件存在、跑没有断言的脚本）：见根文件 §6.4。
