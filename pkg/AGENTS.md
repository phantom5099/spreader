# AGENTS.md — pkg/ (cross-service shared libraries) working agreement

> This directory holds code reused by several services (config, logging, errors, IDs, ...).
> When working on files inside it, **this file's rules take precedence over the root `AGENTS.md`**.

## Go code conventions

Shared with `app/`; see the "Go code conventions" section of `app/AGENTS.md`.
Not copied here, so the two cannot drift apart.

## Constraints specific to this directory

- **Widest blast radius**: any change here affects every service that imports it; confirm the reference scope before changing anything.
- **Keep the API stable**: be careful with changes to exported APIs; for a genuinely breaking change, state the blast radius and the migration path first.
- **No business logic**: only business-agnostic capabilities; business logic belongs in each service's `internal/`.
- **No heavy dependencies**: every service imports this directory, so confirm a new dependency does not significantly widen the dependency surface.
- **No reverse dependency**: shared libraries must not import anything under `app/`; the dependency direction is one-way.
- **Export concrete types, not interfaces**: the abstractions a caller needs are **declared by the caller** (interfaces belong to the user; see "Dependency inversion" in `app/AGENTS.md`). Define an interface here only when this directory genuinely has multiple implementations internally.
