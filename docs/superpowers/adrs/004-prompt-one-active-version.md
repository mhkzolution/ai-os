# ADR 004 — One active prompt version per key

**Status:** Accepted  
**Date:** 2026-09-03

## Context

Workers resolve prompts by `key` + `isActive = true`. Two active versions would make “latest active” undefined.

## Decision

Enforce with both:

1. PostgreSQL partial unique index:

```sql
CREATE UNIQUE INDEX "Prompt_key_one_active"
ON "Prompt" ("key")
WHERE "isActive" = true;
```

2. A Prisma transaction in `PromptsService.activate()` that deactivates siblings then activates the target.

`PromptsService.activate()` MUST be a single `prisma.$transaction`:

```text
Deactivate current active for the same key
↓
Activate target version
↓
Commit
```

Never two standalone `update` calls. Two admins activating different versions concurrently can otherwise collide on `Prompt_key_one_active` (partial unique index).

## Consequences

- Race between two admins activating different versions fails at the database, not as silent dual-active.
- Prisma schema cannot express the partial index; it lives in a SQL migration alongside `schema.prisma`.
