# Architecture

AI OS is a modular NestJS monolith with two processes (`api` and `worker`) packaged with Docker Compose services named `api`, `worker`, `postgres`, and `redis`.

The frozen V1 specification is the source of truth:

- [AI OS V1 architecture specification](superpowers/specs/2026-09-03-ai-os-design.md)

Locked decisions:

- [ADR 001 — Refresh tokens intentionally omitted in V1](superpowers/adrs/001-refresh-token-omitted.md)
- [ADR 002 — Admin jobs and product jobs use separate controllers](superpowers/adrs/002-jobs-admin-vs-execution-routes.md)
- [ADR 003 — V1 retention is keep-forever](superpowers/adrs/003-retention-keep-forever.md)
- [ADR 004 — One active prompt version per key](superpowers/adrs/004-prompt-one-active-version.md)
