# AGENTS.md — Working agreement for the spreader project (for AI coding agents)

> This file is the **first entry point** for AI coding agents working in this repository.
> Read it before touching code and use it to locate the target code directly —
> do **not** fall back on repo-wide fuzzy search or on reading comments line by line.
>
> **This file is the single source of truth for AI instructions.** Do not scatter these rules
> into tool-specific files such as `CLAUDE.md` or `.cursorrules`; change them here.
>
> **Precedence**: explicit user instruction in the conversation > the `AGENTS.md` nearest to the
> file being changed > this file. Division of labour with `README.md`: `README.md` is for humans,
> this file is for agents.
>
> **Trust configuration over copied lists**: commands, lint rules, versions and CI steps are
> authoritative in `Makefile`, `.golangci.yml`, `buf.yaml`, `.github/workflows/` and `package.json`.
> This file does not duplicate those lists — copies go stale. Read the authoritative files when you
> need details; do not rely on this file's memory of them.
>
> **Multiple AGENTS.md files apply by proximity**: the per-directory files are `web/AGENTS.md`
> (frontend), `app/AGENTS.md` (Go services) and `pkg/AGENTS.md` (Go shared libraries). When working
> on a file inside one of those directories, **the nearest file wins**; this file covers
> repository-level rules only and does not repeat language-level details.

---

## 0. Project at a glance

| Item | Detail |
| --- | --- |
| Project | **spreader** — open-source social media platform (publishing / feed / interactions / DMs / relations / search) |
| Shape | Server-side microservices plus a web frontend |
| Backend | Go 1.26.1 + Kratos v3, **one set of proto generating both HTTP and gRPC** |
| Frontend | React 19 + Vite + TypeScript + Zustand + React Router (`web/`) |
| Data and middleware | PostgreSQL / Redis / Kafka (KRaft) / S3-compatible object storage / Elasticsearch |
| License | MIT (see `LICENSE`) |

---

## 1. Overview

spreader is a social media platform covering the full chain: publishing posts, consuming a feed,
likes/comments/reposts, follows and blocks, direct messages and notifications, search and topics,
content moderation and enforcement. The design goal is a horizontally scalable microservice
architecture: only REST and WebSocket are exposed externally, services talk to each other over gRPC
contracts only, and cross-service state advances through domain events.

Product requirements live in the PRD; architecture and technology choices live in the architecture
design document (location and scope of validity: §9).

---

## 2. Repository structure (navigation map)

Single-module repository (one `go.mod`, module path `github.com/phantom5099/spreader`). Each service
is a directory under `app/` — it is **not** a separate module.

```
.
├── api/                        # the only source of external contracts (proto); generated output sits beside the proto
│   └── <domain>/v1/*.proto     # naming: api/<domain>/<version>, e.g. api/content/v1
├── app/                        # the microservices
│   └── <service>/
│       ├── cmd/<service>/      # process entry point: wiring and lifecycle only
│       ├── configs/            # runtime config for this service (no secrets)
│       └── internal/
│           ├── <domain>/       # one package per business resource
│           └── platform/       # cross-domain facilities: config loading, DB, cache, MQ, and repository implementations
├── pkg/                        # libraries shared across services (config, logging, errors, IDs)
├── deploy/
│   ├── compose/                # local dependency orchestration (dev)
│   └── k8s/                    # Kubernetes manifests (prod)
├── build/docker/Dockerfile     # image build template
├── web/                        # frontend (standalone Vite project with its own package.json)
├── .github/workflows/          # CI: ci.yml (backend) / web-ci.yml (frontend)
├── Makefile                    # backend development command entry point
└── buf.yaml / buf.gen.yaml     # proto lint and generation config
```

Per-service structure, domain package rules and the responsibility of each service: see `app/AGENTS.md`.

---

## 3. Fast lookup (I want to change X — where does it go?)

| What you want to do | Go here |
| --- | --- |
| Change/add an external endpoint or an internal RPC | `api/<domain>/v1/*.proto` (must run `make gen` afterwards) |
| Change a business capability (model / use case / repository interface) | `app/<service>/internal/<domain>/` |
| Change the implementation of an external endpoint (proto ↔ domain object) | `app/<service>/internal/<domain>/handler.go` |
| Change storage / cache / MQ / external-call implementations | `app/<service>/internal/platform/<subpackage>/` |
| Change config fields or config files | `app/<service>/configs/` |
| Change process startup logic | `app/<service>/cmd/<service>/main.go` |
| Change a cross-service shared library | `pkg/` |
| Change a frontend page | `web/src/pages/` |
| Change a frontend component | `web/src/components/<module>/` (directory name matches the module) |
| Change frontend data access | `web/src/mocks/api.ts` (the only data entry point; details in `web/AGENTS.md`) |
| Change frontend type definitions | `web/src/types/` |
| Change frontend global state | `web/src/stores/` (Zustand) |
| Change frontend design tokens / theme | `web/src/styles/` |
| Change the build, images or CI | `Makefile`, `build/docker/Dockerfile`, `deploy/`, `.github/workflows/` |

---

## 4. Development principles (hard requirements)

### 4.1 Comments: as few as possible

- **A comment block is at most 3 lines.** Anything longer must be split or cut down.
- Comments explain **why** (non-obvious trade-offs, traps, constraints) and **never restate what the code does**.
- No large block comments, no comments used as design documents, no line-by-line commentary.
- Exported identifiers keep the doc comments `revive` requires — also within 3 lines.

### 4.2 Scope of work: do only what was asked

- **Execute strictly what the user asked for in this turn.** Do not expand, do not extrapolate, do not optimise on the side.
- **If the user did not explicitly ask for source changes this turn, do not modify any source file** (reading, analysing, proposing and answering are all fine).
- Do not refactor, reformat, upgrade dependencies, change configuration, touch CI or edit docs on the side — unless explicitly asked.
- Do not add dependencies (Go modules / npm packages / assets) on your own initiative.
- When requirements are unclear, run the minimal read-only investigation first (this file, the target file); if still unclear, **ask** — do not guess and change.
- Changes must be the **smallest necessary change**: one place beats two.
- **Answer first, act second**: when the user asks a question, answer in prose before considering any change.
- **Confirm before deleting**: code or behaviour that looks intentional must not be deleted on your own; ask first and act after confirmation.
- **Never degrade code to satisfy a check**: when types or lint complain, fix the root cause (upgrade the dependency, correct the code). Do **not** reach for `any`, `@ts-ignore`, an unjustified `//nolint`, or deleted logic to work around it.
- If a user instruction conflicts with this file, state the conflict and ask for confirmation before overriding the rule.

### 4.3 Behaviour boundaries (prohibitions)

- Never treat "looks correct" as "done" — if it was not verified, say so plainly.
- **Never delete or skip existing test cases, or loosen lint rules, to make checks pass.** Report failing existing tests; do not hide them.
- Never invent interfaces, fields, commands or file paths; when unsure, check this file or read the source.
- **Never hand-edit generated files** (`*.pb.go` under `api/`): change the source (proto) and regenerate.
- Never commit build output (`bin/`, `dist/`, `node_modules/`, ...), secrets or `.env`.
- Replies: no pleasantries, no "you're right" agreement padding, no emoji. Give results and facts;
  when you disagree, **state clearly that you agree or disagree**.

---

## 5. Code conventions

### 5.1 General

- Indentation, line endings and encoding are governed by `.editorconfig` (tabs for Go, 2 spaces elsewhere, UTF-8 + LF).
- Run the full check set **only when actually committing or delivering** (commands: §7, `app/AGENTS.md`, `web/AGENTS.md`).
  For everyday changes run only the narrowest checks per §6.3.

### 5.2 Per-language conventions (applied by directory proximity)

- Go (`app/`, `pkg/`) → `app/AGENTS.md`; shared libraries have further constraints in `pkg/AGENTS.md`.
- TypeScript / React (`web/`) → `web/AGENTS.md`.

### 5.3 Contract and interface conventions (`api/`)

- **Contract first**: external endpoints and internal RPC are both defined by the proto under `api/`; services never talk through Go package-level interfaces.
- Proto package path `api/<domain>/<version>`; service names are `<domain>Service` (`buf.yaml` sets `service_suffix: Service`).
- **One service per file**: `google.api.http` route annotations go directly on the RPCs inside the service; no separate `*Http` service.
- `<domain>_error_reason.proto` holds a bare `enum ErrorReason` only and **imports no proto**; business code builds errors with
  `kratos errors.NotFound(ErrorReason_X.String(), ...)`.
- **Generated output is committed with the source**: `*.pb.go` under `api/` (including `_grpc` / `_http` / `_error_reason`) is tracked;
  CI re-runs `buf generate` and checks for drift (see `ci.yml`), so always run `make gen` locally after changing a proto.
- External error bodies are uniformly `application/problem+json` (RFC 9457) with a machine-readable business code.
- **Single writer per state**: only the owning service may write a given kind of state; other services read it or submit change requests.
- **Config and secrets**: images contain no config or secrets; everything is injected from the environment. Never commit secrets, certificates or `.env` (see also §10).
- **Private docs**: `docs-hide/` and `docs-ignore/` are in `.gitignore` and are not committed (usage: §9).

---

## 6. Testing principles

### 6.1 Test layers

Pick what is needed; do not pile up tests for show:

| Type | Purpose | Typical approach |
| --- | --- | --- |
| Unit (white box) | Verify the internal logic and branches of a function/method | Go `go test`; Vitest on the frontend, test files next to the source (`*.test.ts`) |
| Integration | Verify collaboration between components (service + real dependencies) | Bring up the `deploy/compose` dependencies, then run |
| Contract | Verify proto/REST contracts are not broken | `buf breaking`, interface alignment checks |
| Smoke | Quickly confirm "it starts and the main path runs" | Build + start + ping probe |
| End-to-end / black box | Verify from outside, by inputs and outputs only | Exercise the external HTTP/WebSocket interfaces |
| Regression | After a bug fix, confirm existing behaviour still holds | Re-run the relevant cases |
| Race detection | Concurrency correctness | `go test -race` |

Regression re-runs **only the relevant** cases (see §6.3); note also that the "meaningless verification" listed in §6.4 is not testing.

### 6.2 Commands for this project

- Backend: `make test` (`go test ./...`), `make test-race` (used by CI), `make cover`.
- Frontend: see `web/AGENTS.md`.

### 6.3 Running the right amount

- **Run the narrowest relevant check**: prefer the cases for the package or file you touched, then that module's checks.
  Do **not** start by re-running the full suite over and over.
- **Exhaustive coverage is CI's job**: do not repeat locally what has already passed. Run the full set locally only when the
  user asks, when diagnosing a CI failure, or when the change genuinely affects the whole repository.
- After a change, by default run only the tests related to the changed code; passing is enough — there is no need to "run every command".
- Unless asked, do **not** start time-consuming full builds such as `bun run build`.

### 6.4 No meaningless "verification" (a common mistake)

Do not run checks that carry no information just to "prove that work happened". None of the following, ever:

- **Confirming that a directory or file exists** (`ls`, `test -d`, `find` to see whether a directory was created) —
  the filesystem is self-evident; that is **not a test**.
- Printing a config file to confirm "it can be read / opened".
- Empty runs with no assertion and no hypothesis to falsify (e.g. compiling a program that contains only `package main`).
- Re-running an already-passing command to "confirm the environment is fine".
- Restating checks already covered by lint / typecheck / CI that produce no new information.

The single criterion: **which concrete hypothesis would this run falsify?** If you cannot answer, do not run it.
Tests target code behaviour (input → output / side effects), not filesystem state that one command already reveals.

### 6.5 Hard requirement: no test artefacts left behind

- **Leave no test artefacts in the repository.** Test files, scripts and sample data written temporarily for
  verification **must be deleted** once verification is done and the conclusion is reached, restoring the workspace
  to a state consistent with "only the requested changes".
- **Existing** test files (e.g. `web/src/utils/*.test.ts`) are unaffected; never delete or skip them.
- Never change assertions, skip cases or delete cases to make tests pass; report failures honestly.
- Put throwaway scripts in `tmp/` (already in `.gitignore`) and **delete them when done**. Do not cram a multi-line
  script into a single command, and do not write temporary test files into source directories.
- Test assets must comply with the compliance red lines in §10; no third-party screenshots, real user data, etc.

---

## 7. Common commands (repository root)

```bash
# ---- backend ----
make help          # list all targets
make proto-tools   # install buf and the three protoc plugins (versions pinned to buf.gen.yaml)
make gen           # buf dep update + lint + generate (proto -> api/)
make build         # build all services
make lint          # golangci-lint
make fmt           # format
make test          # run tests
make init          # one-shot setup: .env + dependencies + proto generation + tidy

make compose-up    # start local dependencies (PG/Redis/Kafka/MinIO/ES)
make compose-down  # stop local dependencies (keep data volumes)
make compose-clean # stop and drop data volumes
```

Local dependency ports (`deploy/compose`): PostgreSQL `15432`, Redis `16379`, Kafka `19092`,
MinIO `19000` (console `19001`), Elasticsearch `19200`.

Environment variable template: `.env.example`. Images contain no config or secrets; everything is injected from the environment.

> Building and starting a single service: `app/AGENTS.md`. Frontend commands and the demo account: `web/AGENTS.md`.

---

## 8. Commits and CI

- **Commit only when explicitly asked.** Do not run `git commit` / `git push` / `git add` on your own.
- **Never run Git commands that destroy other people's work**: `git reset --hard`, `git checkout .`,
  `git clean -fd`, `git stash`, `git commit --no-verify`, force push.
- Commit messages in the imperative mood; Conventional Commits recommended: `feat(feed): show "↑ N new posts" hint`.
- CI gates (`.github/workflows/`, the files are authoritative):
  - `ci.yml`: `buf lint` / `buf breaking` (PR) / generated-output drift check / `golangci-lint` / `go build` / `go vet` / `go test -race`.
  - `web-ci.yml`: `bun install --frozen-lockfile` / `lint` / `typecheck` / `test` / `build`.
- **After changing a proto you must run `make gen` locally and commit the generated output**, otherwise the CI drift check fails.
- Do not bypass hooks or skip checks; fix the root cause instead of using skip flags.

---

## 9. Information precedence

When sources conflict: **source code and configuration > this file > README > docs-hide**. `docs-ignore` does not participate.

---

## 10. Security and compliance red lines (mandatory)

This project is distributed publicly as source, so anything that enters the repository is redistributed.

- **Absolutely forbidden** to commit: third-party product screenshots/recordings/designs, third-party logos and brand
  assets, unauthorised images/fonts/audio, code of unknown origin or with incompatible licensing, and **real user data**
  (names, phone numbers, ID numbers, avatars, ...).
- **Do not pixel-copy** third-party product interfaces, do not copy their icon shapes or copy text, and do not claim any association with a product.
- Check licences before adding a dependency: **no** GPL/AGPL/LGPL/SSPL/BSL; MIT/ISC/Apache-2.0/BSD are acceptable;
  anything requiring attribution (e.g. CC-BY) must be recorded.
- Never commit secrets, certificates or `.env`; configuration and secrets are always injected from the environment.

---

## 11. Changing this file

- This file is a **living document**. When project structure, commands or conventions change, update it — but **only when the user explicitly asks**.
- Language-level details belong in the per-directory files (`web/AGENTS.md` / `app/AGENTS.md` / `pkg/AGENTS.md`); do not let them flow back here.
