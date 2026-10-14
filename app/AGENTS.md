# AGENTS.md — app/ (Go microservices) working agreement

> This directory holds the implementations of the microservices. When working on files inside it,
> **this file's rules take precedence over the root `AGENTS.md`**.
> External contracts (proto) live in the root `api/`; libraries shared across services live in the root `pkg/`.

## Per-service structure

```
app/<service>/
├── cmd/<service>/       # process entry point: wiring and lifecycle only
├── configs/             # runtime config for this service (no secrets)
└── internal/
    ├── <domain>/        # one package per business resource
    └── platform/        # cross-domain facilities: config loading, DB, cache, MQ, and repository implementations
```

## Services

| Directory | Responsibility |
| --- | --- |
| `app/gateway` | Business gateway / BFF; the single REST entry point for clients |
| `app/identity` | Identity and accounts: login (login is registration), verification codes, session tokens, binding/merging, deactivation |
| `app/content` | Content: creating, editing, publishing, unpublishing and deleting posts, plus their publish state |
| `app/media` | Media: upload, chunking, transcoding scheduling, metadata |
| `app/feed` | Feed / recommendations: pagination, de-duplication, refresh and continuation |
| `app/interaction` | Interactions: likes, comments, reposts, bookmarks, reports |
| `app/relation` | Relations: follows, followers, blocks, mutes, visibility scope |
| `app/message` | Messages: direct-message conversations and delivery |
| `app/realtime` | Realtime: long-lived connection gateway (WebSocket) |
| `app/search` | Search and topics: full-text search, topic normalisation |
| `app/moderation` | Moderation and enforcement: automated/manual review, decisions and write-back |

## Domain packages

One package per business resource (`post/`, `comment/`, `follow/`, ...); the four concerns of that resource all stay inside the package:

| File | Responsibility |
| --- | --- |
| `model.go` | Domain objects and invariants; no proto dependency, no storage tags |
| `service.go` | Use cases: the business capabilities exposed to callers |
| `repository.go` | **Declares only** the storage read/write interface; the implementation is not here (see below) |
| `handler.go` | HTTP/gRPC adapter: proto ↔ domain objects, kept thin |

- Calls inside the package go one way: `handler → service → repository`.
- If a single file is enough, do not split it; split per the table above once it grows.

## Dependency inversion: abstractions belong to the caller

Core principle: **an interface belongs to the side that uses it, not to the side that implements it.** The domain package needs storage, so the domain package declares the storage interface; `platform/` only implements it.

```
cmd/<service>/main.go                      <- wiring point: the only place importing both sides
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
- **This section does not apply across services**: cross-service communication goes only through the proto under `api/`. `pkg/` is a reusable **infrastructure library** (config / log / error / ID), not a domain shared layer.

## Service isolation

- The parent directory of `internal/` is the service, so **`app/<service>/internal/...` may only be imported from that service's own subtree**;
  a cross-service reference will not compile — to go cross-service, change the proto under `api/` and call over RPC.

## Where things live (backend changes)

| What you want to do | Go here |
| --- | --- |
| Model / use case / **repository interface** of a business capability | `app/<service>/internal/<domain>/` |
| Implementation of an external endpoint (proto ↔ domain object) | `app/<service>/internal/<domain>/handler.go` |
| **Concrete implementations** of storage / cache / MQ / external calls, and facility wiring | `app/<service>/internal/platform/<subpackage>/` |
| Injecting implementations into a domain package (dependency wiring) | `app/<service>/cmd/<service>/main.go` |
| Config fields or config files | `app/<service>/configs/` |
| Process startup logic | `app/<service>/cmd/<service>/main.go` |
| Adding or changing an external endpoint / internal RPC | root `api/<domain>/v1/*.proto` (must run `make gen` afterwards) |

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
make build         # build all services
make test          # go test ./...
make test-race     # go test -race ./...   (this is what CI runs)
make lint
make fmt

# build and start a single service (example: identity)
go build -o bin/identity ./app/identity/cmd/identity
./bin/identity -http 127.0.0.1:8000 -grpc 127.0.0.1:9000
curl http://127.0.0.1:8000/v1/identity/ping   # => {"service":"identity"}
```

## Boundaries

- Services talk only through gRPC contracts, never through Go package-level interfaces (root file §5.3).
- **Single writer per state**: only the owning service may write a given kind of state; other services read it or submit change requests.
- Local dependencies (PostgreSQL / Redis / Kafka / MinIO / Elasticsearch) are started with `make compose-up` at the repository root.
