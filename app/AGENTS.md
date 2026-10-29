# AGENTS.md — app/ (Go backend) working agreement

> This directory holds the backend modules. They all run in **one process** (`app/cmd/server`).
> When working on files inside it,
> **this file's rules take precedence over the root `AGENTS.md`**.
> The HTTP surface is the contract: routes are registered in `app/<module>/<module>.go`.

## Per-module structure

```
app/<module>/
├── cmd/<module>/        # process entry point: wiring and lifecycle only
├── configs/             # runtime config for this process (no secrets)
└── internal/
    ├── <domain>/        # one package per business resource
    └── platform/        # cross-domain facilities: config loading, DB, cache, MQ, and repository implementations
```

## Modules

Only `identity` exists today. The rest are **planned domains, not directories**: create
`app/<module>/` when the first line of its code is written, never as an empty placeholder.

| Directory | Responsibility |
| --- | --- |
| `app/identity` | Identity and accounts: login (login is registration), verification codes, session tokens, binding/merging, deactivation |
| `content` (planned) | Content: creating, editing, publishing, unpublishing and deleting posts, plus their publish state |
| `media` (planned) | Media: upload, chunking, transcoding scheduling, metadata |
| `feed` (planned) | Feed / recommendations: pagination, de-duplication, refresh and continuation |
| `interaction` (planned) | Interactions: likes, comments, reposts, bookmarks, reports |
| `relation` (planned) | Relations: follows, followers, blocks, mutes, visibility scope |
| `message` (planned) | Messages: direct-message conversations and delivery |
| `realtime` (planned) | Realtime: long-lived connections (WebSocket) |
| `search` (planned) | Search and topics: full-text search, topic normalisation |
| `moderation` (planned) | Moderation and enforcement: automated/manual review, decisions and write-back |

## Domain packages

One package per business resource (`post/`, `comment/`, `follow/`, ...); the four concerns of that resource all stay inside the package:

| File | Responsibility |
| --- | --- |
| `model.go` | Domain objects and invariants; no transport or storage tags |
| `service.go` | Use cases: the business capabilities exposed to callers |
| `repository.go` | **Declares only** the storage read/write interface; the implementation is not here (see below) |
| `handler.go` | HTTP adapter: transport DTO ↔ domain objects, kept thin |

- Calls inside the package go one way: `handler → service → repository`.
- If a single file is enough, do not split it; split per the table above once it grows.

## Dependency inversion: abstractions belong to the caller

Core principle: **an interface belongs to the side that uses it, not to the side that implements it.** The domain package needs storage, so the domain package declares the storage interface; `platform/` only implements it.

```
cmd/<module>/main.go                       <- wiring point: the only place importing both sides
   ├──────────► internal/<domain>/         declares the XxxRepository interface (the user)
   └──────────► internal/platform/<store>/ implements XxxRepository
                        │
                        └── import ──────► internal/<domain>/ (to satisfy the interface, to return domain types)
```

- **Interfaces are declared by the caller**: `XxxRepository` lives in `repository.go` (inside the domain package). It is **forbidden** to define an interface in `platform/` for the upper layer to adapt to, and **forbidden** to define interfaces on the implementation side "for easy mocking" — a test double should fake the interface the caller declared.
- **The domain package never imports `platform/`**: it knows only its own interface and therefore nothing about any concrete storage. The direction is inverted.
- **`platform/` imports the domain package** (to satisfy the interface and return domain types) — this is the **only permitted reverse import** in the whole design; it is the seam of dependency inversion. Any other reversed import is a layering bug: fix the design, do not add the import.
- **Wiring happens only in `cmd/`**: `main.go` constructs the concrete implementation and injects it into the domain package (manual constructor injection). Swapping storage touches only `platform/` and `cmd/`; business code is untouched.
- **Constructors return concrete types**, not interfaces; positions that need an interface are satisfied by assignment.
- **Do not extract an interface early**: write the concrete implementation first; only when a second implementation really appears or a test double is genuinely needed, extract the interface at the caller. With a single implementation, use the concrete type directly.
- A repository implementation must not propagate driver errors: map them to domain errors inside the implementation, so upper layers never branch on the driver.

## Cross-package sharing: no shared layer

**Single ownership**: every piece of data or concept has exactly one owning package; other packages do not redefine it. When you need something from another package there are only three ways to get it, and **none of them adds a package**:

| What you need | How to get it |
| --- | --- |
| An identifier / value / enum | Use the owning package's type directly (e.g. `post.ID`) |
| A piece of its data, but with a different shape | **The consumer defines its own projection type and its own conversion**, placed in the consumer's package (an anti-corruption layer) |
| Its behaviour | **The consumer declares a narrow interface** and `cmd/` injects the implementation |

- **Go packages must not be named `shared` / `common` / `util`** (the pre-existing frontend `web/src/utils/` is not covered by this rule): they have no ownership, become a "dependency sink" everyone relies on, and turn into a source of import cycles as the project grows.
- **When a two-way dependency appears there are only two options**: (1) **redraw the package boundary** (merge the two, or assign ownership clearly to one side); (2) **make it one-way with interface injection**. **There is no third option of "extract a shared package".**
- A little deliberate duplication is acceptable: the same data may have a projection defined in several places. When an upstream field changes, each place **fails to compile** — nothing drifts silently. If the duplication grows hard to maintain, the signal is that **the package boundary is wrong** (merge or reassign ownership), not that a shared package is needed.
- **Across modules the same three ways apply**, minus the shared-package escape: import the other module's **public package** only, never its `internal/`. `pkg/` is a reusable **infrastructure library** (config / log / error / ID), not a domain shared layer.

## Module isolation

- The parent directory of `internal/` is the module, so **`app/<module>/internal/...` may only be imported from that module's own subtree**;
  a cross-module reference will not compile. This is the module boundary — enforced by the compiler, not by review.
- To call another module: **the consumer declares a narrow interface** (e.g. `feed` declares `PostReader`), and `cmd/` injects the
  other module's implementation. When a module is later split into its own process, only the wiring changes — an adapter that
  implements the same interface over RPC replaces the local call. Business code is untouched.

## Where things live (backend changes)

| What you want to do | Go here |
| --- | --- |
| Model / use case / **repository interface** of a business capability | `app/<module>/internal/<domain>/` |
| Implementation of an external endpoint (DTO ↔ domain object) | `app/<module>/internal/<domain>/handler.go` |
| **Concrete implementations** of storage / cache / MQ / external calls, and facility wiring | `app/<module>/internal/platform/<subpackage>/` |
| Injecting implementations into a domain package (dependency wiring) | `app/<module>/cmd/<module>/main.go` |
| Config fields or config files | `app/<module>/configs/` |
| Process startup logic | `app/<module>/cmd/<module>/main.go` |
| Adding or changing an external endpoint | route in `app/<module>/<module>.go` + method in `handler.go` |

## Go code conventions

- Format with `make fmt` (`gofmt` + `goimports`); the internal import group prefix is `github.com/phantom5099/spreader`.
- Must pass `golangci-lint` (config in the root `.golangci.yml`, including `errcheck` / `errorlint` /
  `govet(enable-all)` / `revive` / `staticcheck` / `gocritic` and others).
- Error handling: `errcheck` has type assertions and blank assignments enabled; wrap with `%w`, test with `errors.Is/As`.
- Error names start with the `Err` prefix (`errname`).
- Loop variables, `context` propagation and resource closing (`bodyclose`) follow the lint requirements.
- Package comments and exported-identifier comments as `revive` requires, each at most 3 lines (root file §4.1).

## Commands

```bash
# repository-wide (root Makefile)
make build         # build the binary
make test          # go test ./...
make test-race     # go test -race ./...   (this is what CI runs)
make lint
make fmt

# build and start the process
go build -o bin/server ./app/cmd/server
./bin/server -conf app/configs/server.yaml
curl http://127.0.0.1:8000/healthz   # => {"status":"ok"}
```

## Boundaries

- Modules talk through Go interfaces declared by the consumer, never by importing each other's `internal/`.
- **Single writer per state**: only the owning module may write a given kind of state; other modules read it or submit change requests.
- Local dependencies (PostgreSQL / Redis / Prometheus / Grafana) are started with `make compose-up` at the repository root.
