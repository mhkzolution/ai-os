# AI OS

Shared AI platform for Punpunkun products. Modular NestJS monolith: HTTP API process + BullMQ worker process, PostgreSQL, and Redis.

## Requirements

- Node.js 22+
- Docker and Docker Compose

## Setup

```bash
cp .env.example .env
docker compose up --build
```

Local development (Postgres and Redis via Compose, API/worker on the host):

```bash
docker compose up postgres redis
npm install
npm run start:dev
npm run start:worker:dev
```

## Endpoints

| Path | Purpose |
|---|---|
| `GET /api/v1/health` | Liveness. No auth. `{ "status": "ok" }` |
| `GET /api/v1/health/ready` | Readiness. Pings PostgreSQL and Redis. HTTP 503 if either is down |
| `/api/docs` | Swagger UI |

## Scripts

| Script | Description |
|---|---|
| `npm run start:dev` | API in watch mode |
| `npm run start:prod` | API from `dist/` |
| `npm run start:worker` | Worker from `dist/` |
| `npm run start:worker:dev` | Worker via `ts-node` |
| `npm test` | Unit tests |
| `npm run build` | Compile TypeScript |

## Architecture

See [docs/architecture.md](docs/architecture.md).
