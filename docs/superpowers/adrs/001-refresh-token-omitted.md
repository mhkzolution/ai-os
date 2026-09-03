# ADR 001 — Refresh tokens intentionally omitted in V1

**Status:** Accepted  
**Date:** 2026-09-03

## Context

AI OS management APIs are used by internal admins, not consumer apps. Session length can match a working day.

## Decision

Issue a single JWT access token. TTL is `JWT_TTL_HOURS=8`. Do not add `/auth/refresh`, refresh cookies, or refresh-token tables in V1.

## Consequences

- Admin re-logs in after ~8 hours (`09:00` → `17:00`).
- Attack surface is smaller (no long-lived refresh tokens).
- Adding refresh later is a new ADR, not a drive-by feature.

## Rejected

Refresh tokens “for completeness” in V1 — unused complexity for an internal admin platform.
