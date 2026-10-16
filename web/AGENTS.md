# AGENTS.md — web/ (frontend) working agreement

> This directory is a standalone Vite project with its own `package.json`, lockfile and toolchain.
> When working on files inside it, **this file's rules take precedence over the root `AGENTS.md`**
> (the root file keeps repository-level rules only).

## Stack

| Item | Choice | Source of truth |
| --- | --- | --- |
| Framework | React 19 | `package.json` |
| Build | Vite 6 | `package.json` |
| Language | TypeScript 5 (`strict`, `noUnusedLocals`, `noUnusedParameters`) | `tsconfig.json` |
| Routing | react-router-dom 7 | `package.json` |
| State | Zustand | `package.json` |
| Icons | lucide-react | `package.json` |
| Lint | ESLint 10 + typescript-eslint + react-hooks + react-refresh | `eslint.config.js` |
| Tests | Vitest | `vitest.config.ts` |
| Package manager | Bun (`packageManager: bun@1.4.0`, lockfile `bun.lock`) | `package.json` |

## Directory structure

```
web/
├── src/                # client (the only client source dir; admin code must not live here)
│   ├── pages/          # route pages
│   ├── components/     # components, grouped by module (feed / post / comment / message / ...)
│   ├── hooks/          # custom hooks (useXxx.ts)
│   ├── mocks/          # data layer (api.ts is the only data entry point)
│   ├── stores/         # Zustand global state
│   ├── styles/         # design tokens and global styles (tokens.css / app.css)
│   ├── types/          # type definitions
│   └── utils/          # utility functions
├── admin/              # admin console — an independent app (own process, entry and output)
│   ├── pages/          # admin route pages
│   ├── components/     # shared admin components
│   ├── stores/         # admin session / toast
│   ├── mocks/          # adminApi.ts: the only data entry point (swap point for the real backend)
│   ├── styles/         # admin.css
│   └── main.tsx App.tsx types.ts labels.ts   # entry / routes / DTO types / label maps
├── admin.html          # admin HTML entry (build input of vite.admin.config.ts)
├── scripts/            # validation scripts (check-*.cjs)
├── eslint.config.js
├── vite.config.ts            # client config (port 5173, output dist/client)
├── vite.admin.config.ts      # admin config (port 5174, output dist/admin)
├── vitest.config.ts
└── package.json
```

## Conventions (mandatory when changing frontend code)

- Keep TypeScript `strict` at **0 errors**.
- Component files use `PascalCase.tsx`, styles use the same-named `PascalCase.module.css` (all existing components here follow this pairing).
- Hooks are named `useXxx` and live in `src/hooks/`.
- Colours / sizes / motion **must** use CSS variables (design tokens in `src/styles/tokens.css`); **hard-coded colour values are forbidden**.
- Interactive elements need an `aria-label`; decorative icons need `aria-hidden`.
- Admin code lives in `admin/` only and shares nothing at runtime with the client; the two apps are separate processes with separate build outputs.
- Icons use `lucide-react` only; do not add another icon library and do not copy third-party brand icon shapes.
- Comments explain **why** only, at most 3 lines (root file §4.1).

## Commands

```bash
bun install         # install dependencies (first time)
bun run dev         # client dev server -> http://localhost:5173
bun run dev:admin   # admin dev server  -> http://localhost:5174
bun run build       # type check + build both apps -> web/dist/client + web/dist/admin
bun run build:admin # build the admin console only -> web/dist/admin
bun run preview       # preview the client build -> http://localhost:4173
bun run preview:admin # preview the admin build   -> http://localhost:4174
bun run typecheck   # type check only
bun run lint        # ESLint
bun run test        # Vitest (single run)
bun run test:watch  # Vitest (watch)
```

## Testing

- Test files live next to the source, named `*.test.ts(x)`; config in `vitest.config.ts`.
- Existing tests: `src/utils/*.test.ts` — never delete or skip them.
- Tests written temporarily for verification **must be deleted when done**; do not leave them in the repository (root file §6.5).
- Do not perform meaningless "verification" (e.g. `ls` to confirm a directory or file exists, running an assertion-free script): see root file §6.4.
