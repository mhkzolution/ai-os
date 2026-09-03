# ADR 003 — V1 retention is keep-forever

**Status:** Accepted  
**Date:** 2026-09-03

## Context

Job, Execution, UsageLog, CostLog, and PlaygroundRun are the audit trail for tokens and money. Production volume is unknown.

## Decision

V1 keeps these rows forever. No TTL, no partition drop, no archival worker, no “delete completed jobs after 30 days”.

## Consequences

- Cost dashboards remain historically correct.
- Disk growth must be monitored in operations (out of V1 app scope).
- Archival is a future ADR after volume is measured. Snapshot prices on Execution remain the source for any future rebuild of CostLog.
