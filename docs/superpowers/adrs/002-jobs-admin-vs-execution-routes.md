# ADR 002 — Admin jobs and product jobs use separate controllers

**Status:** Accepted  
**Date:** 2026-09-03

## Context

Admins list/filter all jobs. Product systems poll their own job by id. These are different actors, auth schemes, and response shapes.

## Decision

- JWT: `GET /api/v1/admin/jobs`, `GET /api/v1/admin/jobs/:id` — `AdminJobsController`
- API key: `POST /api/v1/jobs`, `GET /api/v1/jobs/:id` — `JobsController`

Do not implement one `GET /jobs` that inspects whether the caller sent JWT or an API key.

## Consequences

- Auth guards stay single-purpose.
- Product 404-for-other-client logic cannot leak into admin list.
- Future admin fields (`vendorError`, executions) can be added to admin routes only.
