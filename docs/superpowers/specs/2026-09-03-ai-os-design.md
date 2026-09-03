# AI OS V1 — Architecture Specification

**Status:** Frozen for implementation  
**Date:** 2026-09-03  
**Product:** AI OS — shared AI platform for Punpunkun products  
**Consumers (examples):** community.punpunkun.com, academy.punpunkun.com, crm.punpunkun.com, future products  

This document is the source of truth for V1. Decisions below are locked. Items marked **Roadmap** are designed for but not implemented in V1.

---

## 1. Vision

AI OS is independent AI infrastructure, not a feature of any one application. It owns:

- AI provider and model management
- Prompt versioning
- API client management
- Generic AI task execution
- Queue processing
- Usage and cost tracking
- Operator playground

It does **not** contain product-specific business modules (no Community module, no CRM module, no Academy module).

---

## 2. Locked runtime

**Shape:** modular NestJS monolith, two processes, one codebase.

```text
Docker Compose
  api        HTTP /api/v1
  worker     BullMQ processors
  postgres
  redis
```

- Same Nest modules in both processes.
- API process: HTTP only.
- Worker process: `NestFactory.createApplicationContext` + BullMQ processors only. No HTTP server.
- Queue name: `ai-jobs`.
- Future extraction path: split `worker-ocr` / `job-service` by moving a handler + queue name, not by rewriting domain tables.

**Rejected**

- Single process (API + worker together) — heavy jobs would block management HTTP.
- Microservices in V1 — one team, one database, one Redis.

---

## 3. Tech stack

| Layer | Choice |
|---|---|
| Runtime | NestJS (latest stable), TypeScript |
| ORM | Prisma (latest stable, PostgreSQL driver adapter) |
| Queue | BullMQ + Redis |
| Validation | class-validator, class-transformer |
| Docs | Swagger/OpenAPI at `/api/docs` |
| Logging | NestJS Logger |
| Config | `@nestjs/config` |
| Auth (humans) | JWT |
| Auth (systems) | `X-API-Key` |
| Packaging | Docker + Docker Compose |
| IDs | `cuid()` strings |
| Time | UTC timestamps |

API prefix: `/api/v1`.

---

## 4. Authentication (split)

### 4.1 Management APIs — humans

```http
Authorization: Bearer <JWT>
```

Roles:

| Role | Access |
|---|---|
| `SUPER_ADMIN` | All management APIs, user administration, system client `PLAYGROUND` |
| `ADMIN` | CRUD on platform resources except users and system clients |
| `VIEWER` | Read-only management APIs |

Only authenticated users access management APIs.

### 4.2 Execution APIs — products

```http
X-API-Key: aos_xxxxxxxxx
```

Do **not** accept API keys in `Authorization: Bearer`. JWT and API keys never share a header. This keeps logs and guards unambiguous.

Product systems (Community, Academy, CRM) never log in as users. Service-to-service only.

### 4.3 Playground — humans, not products

Playground is a human tool. It uses JWT (`ADMIN` or `SUPER_ADMIN`). It does **not** use `X-API-Key`.

Usage and cost for playground runs attach to the seeded system client `PLAYGROUND` (`isSystem = true`, not deletable).

### 4.4 Endpoint map

**JWT (management)**

```text
POST   /api/v1/auth/login
GET    /api/v1/auth/me

CRUD   /api/v1/clients
       /api/v1/clients/:id/keys          rotate, list prefixes, revoke
CRUD   /api/v1/providers
CRUD   /api/v1/models
CRUD   /api/v1/prompts
CRUD   /api/v1/tasks                     catalog only; handlers stay in code
GET    /api/v1/jobs                      admin can list/filter all clients
GET    /api/v1/usage
GET    /api/v1/costs
POST   /api/v1/playground/execute
GET    /api/v1/playground/runs
```

**X-API-Key (execution)**

```text
POST   /api/v1/jobs
GET    /api/v1/jobs/:id                  own client only; other clients → 404
POST   /api/v1/tasks/product-analysis    alias: create job with taskCode PRODUCT_ANALYSIS
```

JWT `GET /api/v1/jobs` is the admin list (all clients). API-key `GET /api/v1/jobs/:id` is the product poll. Products cannot list other clients' jobs.

**No auth**

```text
GET    /api/v1/health
GET    /api/v1/health/ready              Postgres + Redis ping
```

V1 login: email + password. Passwords hashed with bcrypt (cost 12). JWT secret from env. Access token payload: `{ sub, email, role }`. V1 issues a single access token (TTL 8 hours). No refresh-token endpoint.

---

## 5. Domain boundaries

### 5.1 Forbidden

```text
shared → modules              FORBIDDEN
modules → vendor SDK          FORBIDDEN  (shared/ai only)
hardcoded prompts             FORBIDDEN
product-specific modules      FORBIDDEN
jobs writing UsageLog rows    FORBIDDEN  (call UsageService)
costs reading current Model price for historical rows  FORBIDDEN  (use snapshot)
```

### 5.2 Module ownership

| Module | Owns | Does not own |
|---|---|---|
| `auth` | User, JWT, roles | API keys |
| `clients` | Client, ClientKey, rate limit config, `allowedIps` | Job execution |
| `providers` | Vendor credentials, type, priority, active | Chat/HTTP to vendors |
| `models` | Catalog, purpose, **pricing per 1k tokens** | Provider HTTP |
| `prompts` | `key` + version + content + active | Task orchestration |
| `tasks` | Catalog row + **handlers + schemas + TaskRegistry** | Queue / Job rows |
| `jobs` | Job lifecycle, enqueue, status copy | Vendor SDK, prompt text, purpose |
| `usage` | UsageLog writes and aggregates | Cost formula |
| `costs` | CostLog from usage × **execution snapshot** | Token counting |
| `playground` | Sync test-run of a prompt version | Product traffic |
| `health` | Liveness / readiness | Auth |

**shared/ai** — `AIProvider` interface + adapters (`OpenAI`, `Gemini`, `Claude`, `OpenRouter`, `Fake`). No knowledge of Job or Client.  
**shared/queue** — Redis connection, queue names, payload `{ jobId }`. No business logic.  
**shared/storage** — interface only in V1; image inputs are URLs.  
**shared/common** — filters, interceptors, pagination, `requestId`.  
**shared/logger** — NestJS Logger wrapper; redaction rules.

### 5.3 Dependency direction

```text
auth, clients, providers, prompts     (no inbound domain deps)
models        → providers
tasks         → prompts (by key at runtime), shared/ai (handlers)
jobs          → tasks, prompts, models, providers, clients, usage, costs, shared/ai, shared/queue
playground    → prompts, models, providers, usage, costs, shared/ai
usage         → writes only
costs         → usage + snapshot prices
health        → postgres, redis
```

### 5.4 Tasks vs jobs

Jobs do not know what `PRODUCT_ANALYSIS` means. They know `taskCode`, payload, status.

```text
src/modules/tasks/
  catalog/          Prisma Task CRUD
  handlers/         product-analysis.handler.ts
  schemas/          product-analysis.input.ts / .output.ts
  registry/         TaskRegistry
```

`TaskRegistry` maps `code → { handler, inputSchema, outputSchema, promptKey, purpose }`.

The Task **table** stores `code, name, description, promptKey, isActive`. It does **not** store `purpose`. Purpose lives in the registry so a task can evolve (VISION → VISION+OCR) without a schema change.

`promptKey` on the Task row lets an ADMIN rebind which prompt family a task uses without a deploy. The registry still declares the default `promptKey`; at runtime the worker uses the **database** `promptKey` if the Task row exists and is active.

### 5.5 Playground vs jobs

| | Job | PlaygroundRun |
|---|---|---|
| Who | Product backends | Admin users |
| Auth | `X-API-Key` | JWT ADMIN+ |
| Sync | Async `202` + poll | Sync wait |
| Client | calling client | `PLAYGROUND` |
| Provider/model | platform resolves | caller selects |
| Prompt | active version of task promptKey | specific version, including inactive drafts |

---

## 6. Database schema

All IDs: `String @id @default(cuid())`.  
Timestamps: `createdAt @default(now())`, `updatedAt @updatedAt` where the row is mutable.  
Relations: both sides with `@relation`.  
Secrets: ClientKey hashed; Provider key encrypted with `APP_ENCRYPTION_KEY`; never store plaintext keys.

### 6.1 Enums

```text
Role              SUPER_ADMIN | ADMIN | VIEWER
ProviderType      OPENAI | GEMINI | CLAUDE | OPENROUTER | CUSTOM
ModelPurpose      CHAT | VISION | EMBEDDING | MODERATION
JobStatus         PENDING | PROCESSING | COMPLETED | FAILED
ExecutionStatus   PENDING | PROCESSING | COMPLETED | FAILED
ClientKeyKind     PRIMARY | SECONDARY
ErrorCategory     PROVIDER | CONFIG | VALIDATION | SYSTEM
```

`ClientKeyKind` is an enum for V1. Additional kinds (DEPLOYMENT, PARTNER, TEMPORARY) are added later by extending the enum — the child table already supports many keys per client.

### 6.2 User

```text
User
  id, email @unique, passwordHash, name
  role Role
  isActive Boolean @default(true)
  createdAt, updatedAt
```

### 6.3 Client and ClientKey

```text
Client
  id
  code                @unique     // community | academy | crm | PLAYGROUND
  name
  apiSecretHash                   // generated at create; plaintext returned once; HMAC roadmap
  isActive            @default(true)
  isSystem            @default(false)  // PLAYGROUND cannot be deleted
  rateLimitPerMinute  Int @default(60)
  allowedIps          String[]    // stored in V1
  ipAllowlistEnabled  Boolean @default(false)  // enforcement = false in V1
  createdAt, updatedAt
  keys                ClientKey[]
  jobs                Job[]
  usageLogs           UsageLog[]
  playgroundRuns      PlaygroundRun[]

ClientKey
  id
  clientId
  kind                ClientKeyKind
  keyHash             @unique
  keyPrefix           // e.g. aos_live_ab12
  isActive            @default(true)
  lastUsedAt          DateTime?
  createdAt
  revokedAt           DateTime?
```

Plaintext API key is returned only on create and rotate. There is no GET that returns the full key.

Rotate V1 (no downtime):

1. Create a new `ClientKey` with `kind = SECONDARY`.
2. Product deploys the new key.
3. Revoke old PRIMARY (`isActive = false`, `revokedAt = now()`).
4. Optional: promote remaining key to PRIMARY (update `kind`).

Auth accepts any active, non-revoked key for that client (primary or secondary).

### 6.4 Provider and Model

```text
Provider
  id, name, type ProviderType
  apiKeyEncrypted                 // decryptable; not a hash
  baseUrl         String?         // CUSTOM / OpenRouter override
  isActive        @default(true)
  priority        Int             // lower number = higher priority
  createdAt, updatedAt
  models          Model[]

Model
  id, providerId
  name
  purpose         ModelPurpose
  inputPricePer1k Decimal(18, 6)
  outputPricePer1k Decimal(18, 6)
  currency        String @default("USD")
  isActive        @default(true)
  createdAt, updatedAt
  @@unique([providerId, name])
```

Pricing lives on Model, never on Provider.

### 6.5 Prompt

```text
Prompt
  id
  key             // PRODUCT_ANALYZER
  version         Int
  content         String
  description     String?
  isActive        Boolean @default(false)
  createdById     String?  // User.id
  createdAt
  @@unique([key, version])
```

Service invariant: at most one active version per `key`. Activating version N deactivates other versions of the same key. Retrieve-latest-active is `where key, isActive true order by version desc`.

Prompts are never hardcoded in handlers. Handlers reference `promptKey` only.

### 6.6 Task (catalog)

```text
Task
  id
  code            @unique   // PRODUCT_ANALYSIS
  name
  description
  promptKey                 // PRODUCT_ANALYZER
  isActive        @default(true)
  createdAt, updatedAt
```

No `purpose` column. No JSON schema columns.

### 6.7 Job and Execution

```text
Job              = business request from a product
Execution        = one AI attempt
```

```text
Job
  id
  clientId
  taskId
  status          JobStatus @default(PENDING)
  input           Json
  output          Json?          // copy of last successful execution output
  error           Json?          // copy of last execution error { code, category, message, retryable }
  requestId       String
  createdAt, updatedAt
  completedAt     DateTime?
  executions      Execution[]

Execution
  id
  jobId
  providerId      String?
  modelId         String?
  attempt         Int
  status          ExecutionStatus
  input           Json
  output          Json?
  error           Json?          // { code, category, message, retryable }
  vendorError     Json?          // internal; never exposed on public job API
  rawResponse     Json?          // set at least on OUTPUT_INVALID
  providerSnapshot Json?         // { id, name, type }
  modelSnapshot    Json?         // { id, name, purpose, inputPricePer1k, outputPricePer1k, currency }
  promptSnapshot   Json?         // { id, key, version }
  requestId       String
  startedAt       DateTime?
  completedAt     DateTime?
  durationMs      Int?
  createdAt
```

V1: one execution per BullMQ attempt (max 3), same provider and model. No cross-provider fallback.

Public `GET /jobs/:id` returns Job fields. It does **not** expose `executions[]`, `vendorError`, or `rawResponse`. Those stay internal until a V2 admin debug API.

### 6.8 PlaygroundRun

```text
PlaygroundRun
  id
  userId
  clientId                    // always PLAYGROUND
  providerId, modelId, promptId
  input           Json
  output          Json?
  rawResponse     Json?
  tokensInput     Int?
  tokensOutput    Int?
  estimatedCost   Decimal(18, 6)?
  currency        String @default("USD")
  error           Json?
  requestId       String
  durationMs      Int?
  createdAt
```

Playground never creates a Job row.

### 6.9 UsageLog and CostLog

```text
UsageLog
  id
  clientId
  providerId
  modelId
  taskId          String?
  jobId           String?
  executionId     String?
  playgroundRunId String?
  tokensInput     Int
  tokensOutput    Int
  requestCount    Int @default(1)
  requestId       String
  createdAt

CostLog
  id
  usageLogId      @unique
  providerId
  modelId
  amount          Decimal(18, 6)
  currency        String
  createdAt
```

Cost formula always uses **execution/playground snapshot prices**, never `Model.inputPricePer1k` at query time.

```text
amount = (tokensInput/1000 * snapshot.inputPricePer1k)
       + (tokensOutput/1000 * snapshot.outputPricePer1k)
```

Usage is written only when a vendor call happened and returned token counts (or FakeAIProvider returns counts). `NO_PROVIDER` / `NO_MODEL` / `NO_PROMPT` / fail-before-call produce **zero** UsageLog and zero CostLog.

### 6.10 Indexes

```text
Job          @@index([clientId, createdAt])
             @@index([status, createdAt])
             @@index([taskId])
             @@index([requestId])
Execution    @@index([jobId, attempt])
             @@index([requestId])
UsageLog     @@index([clientId, createdAt])
             @@index([providerId, createdAt])
             @@index([requestId])
Prompt       @@index([key, isActive])
ClientKey    @@index([clientId, isActive])
Model        @@index([providerId, isActive])
```

### 6.11 Seed

- User `SUPER_ADMIN` from env `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
- Client `PLAYGROUND` (`isSystem = true`, `code = PLAYGROUND`).
- Task `PRODUCT_ANALYSIS` with `promptKey = PRODUCT_ANALYZER`.
- Prompt `PRODUCT_ANALYZER` version 1, `isActive = true`, content = product-analysis system prompt (loaded from seed file, not from handler source).
- Optional inactive Provider/Model rows for OpenAI/Gemini/Claude/OpenRouter with empty encrypted keys.

### 6.12 Not in V1 schema

Webhook delivery tables, HMAC nonce store, fallback policy matrix, Idempotency-Key store. `allowedIps` exists; enforcement does not.

---

## 7. AI abstraction

```ts
interface AIProvider {
  chat(request: ChatRequest): Promise<AIResponse>
  analyzeImage(request: ImageRequest): Promise<AIResponse>
  embeddings(request: EmbeddingRequest): Promise<AIResponse>
  moderation(request: ModerationRequest): Promise<AIResponse>
}

interface AIResponse {
  content: unknown
  raw: unknown
  tokensInput: number
  tokensOutput: number
}
```

Adapters: `OpenAIProvider`, `GeminiProvider`, `ClaudeProvider`, `OpenRouterProvider`, `FakeAIProvider`.

V1 `moderation()` may throw `NotImplementedException` on real adapters. The method **must exist** on the interface and on FakeAIProvider (Fake may return a stub). Business modules never import vendor SDKs.

Vendor HTTP timeout: **60 seconds** per execution attempt.

---

## 8. Data flow

### 8.1 Create job (API process)

1. `ApiKeyGuard`: hash lookup of `ClientKey` where `isActive` and `revokedAt` is null.
2. Client `isActive` or `403`.
3. Update `ClientKey.lastUsedAt` asynchronously (do not block the response).
4. Redis rate limit per `clientId` using `rateLimitPerMinute`. Exceed → `429`.
5. `TaskRegistry.get(taskCode)` must exist; Task row must exist and `isActive`.
6. Validate `input` against registry input schema. Fail → `422`.
7. Create Job `PENDING` with `requestId`.
8. Enqueue BullMQ `{ jobId }`.
9. Return `202 { id, status: "PENDING" }`.

API does **not** check provider/model/prompt availability. Worker is the source of truth. A model may be disabled between enqueue and start.

`POST /api/v1/tasks/product-analysis` is the same pipeline with `taskCode` fixed to `PRODUCT_ANALYSIS`.

### 8.2 Worker attempt

1. Load Job. Set Job `PROCESSING`.
2. Create Execution `attempt = n`, `PROCESSING`, copy `requestId`, `startedAt = now()`.
3. Resolve TaskRegistry (handler, schemas, purpose, default promptKey) + Task row (`promptKey`).
4. Load Prompt: active version of `promptKey`. Missing → fail Execution+Job `NO_PROMPT`, `retryable: false`.
5. Resolve Provider: `isActive` ordered by `priority ASC`, then `createdAt ASC`. None → `NO_PROVIDER`, no retry. A provider with no matching model is skipped; try the next provider. If none remain → `NO_MODEL`.
6. Resolve Model on the chosen provider: `isActive` and `purpose` equals registry purpose, ordered by `createdAt ASC`. None on that provider → skip to next provider (step 5).
7. Write `providerSnapshot`, `modelSnapshot`, `promptSnapshot`.
8. Call `shared/ai` with 60s timeout.
9. On success: validate output schema.
   - Invalid → `OUTPUT_INVALID`, store `rawResponse`, `retryable: false`.
   - Valid → write UsageLog + CostLog from **snapshot** prices, Execution `COMPLETED`, copy output to Job, Job `COMPLETED`.
10. Set `completedAt`, `durationMs`.
11. Retryable failure: mark Execution `FAILED`, throw to BullMQ. Next attempt creates a **new** Execution row, same provider/model.
12. After 3 attempts exhausted: Job `FAILED`, `error` = last execution error.

BullMQ: `attempts: 3`, exponential backoff. V1 does **not** switch provider.

### 8.3 Playground (sync)

1. JWT `ADMIN`+.
2. Load specified Prompt version (inactive drafts allowed).
3. Load specified Provider + Model.
4. Call `shared/ai`, 60s timeout.
5. Timeout → HTTP `504`. Still persist `PlaygroundRun` with error when possible.
6. Success → persist `PlaygroundRun`, UsageLog + CostLog on client `PLAYGROUND`.
7. HTTP `200 { output, rawResponse, tokensInput, tokensOutput, estimatedCost, currency, durationMs }`.

No Job row. No BullMQ.

### 8.4 Cost

Always:

```text
Job/Playground → UsageLog → CostLog
```

Never Job → CostLog directly. Changing the cost formula later does not rewrite usage.

Historical dashboards use CostLog rows as written. Recalculating from current Model prices is forbidden.

---

## 9. Error handling

### 9.1 HTTP (API process only)

| Status | When |
|---|---|
| 200 / 201 | Management success; playground success |
| 202 | Job accepted |
| 400 | Malformed body/headers |
| 401 | Missing/invalid JWT or API key, or revoked key |
| 403 | Insufficient role; **client disabled** |
| 404 | Missing resource; job belonging to another client |
| 422 | Input fails task JSON schema |
| 429 | Per-client rate limit |
| 504 | Playground upstream timeout |
| 500 | API bug only — not vendor outage |

Vendor failure after `202` is Job `FAILED`, not HTTP 500.

Envelope:

```json
{
  "statusCode": 422,
  "error": "VALIDATION_ERROR",
  "message": "images must be a non-empty array of urls",
  "requestId": "clx..."
}
```

`requestId` is generated per HTTP request (or taken from `X-Request-Id` if present) and stored on Job, Execution, UsageLog, PlaygroundRun, and every log line.

### 9.2 Stored execution error

```json
{
  "code": "PROVIDER_TIMEOUT",
  "category": "PROVIDER",
  "message": "OpenAI did not respond within 60000ms",
  "retryable": true
}
```

`vendorError` is stored on Execution only and is never copied to `Job.error` or the public API.

### 9.3 Worker codes (V1)

| Code | Category | Retry |
|---|---|---|
| `NO_PROVIDER` | CONFIG | no |
| `NO_MODEL` | CONFIG | no |
| `NO_PROMPT` | CONFIG | no |
| `PROVIDER_TIMEOUT` | PROVIDER | yes |
| `PROVIDER_RATE_LIMIT` | PROVIDER | yes |
| `PROVIDER_UNAVAILABLE` | PROVIDER | yes |
| `PROVIDER_AUTH` | PROVIDER | no |
| `OUTPUT_INVALID` | VALIDATION | no |
| `INTERNAL` | SYSTEM | no |

`INTERNAL` is not split into `HANDLER_ERROR` / `SYSTEM_ERROR` in V1.

Do not retry `OUTPUT_INVALID`: the failure is prompt/model/schema, not the network. Do not retry `NO_*`: create a new job after config is fixed.

### 9.4 Logging

- Log `jobId`, `clientId`, `taskCode`, `executionId`, `durationMs`, `status`, `requestId`.
- Warn on retryable vendor errors.
- Error + stack only for `INTERNAL`.
- Never log JWT, `X-API-Key`, provider keys, or `apiSecret`.

---

## 10. PRODUCT_ANALYSIS (first task)

**Code:** `PRODUCT_ANALYSIS`  
**Prompt key:** `PRODUCT_ANALYZER`  
**Purpose (registry):** `VISION`  
**Handler:** `analyzeImage`

**Input schema**

```json
{
  "images": ["url"]
}
```

`images` is a non-empty array of HTTP(S) URLs.

**Output schema**

```json
{
  "productName": "",
  "brand": "",
  "category": "",
  "subcategory": "",
  "tags": [],
  "description": "",
  "confidence": 0
}
```

Structured JSON output is validated before Job COMPLETED. Invalid JSON → `OUTPUT_INVALID`.

V1: one job processes the provided images as a single analysis (not a fan-out of one job per image).

---

## 11. Rate limiting and keys

- Redis sliding window (or fixed window) per `clientId`, using `Client.rateLimitPerMinute`.
- Wrong key → `401`. Revoked key → `401`. Disabled client → `403`.
- IP allowlist is stored and ignored in V1 (`ipAllowlistEnabled = false`).

---

## 12. Testing

### 12.1 Architecture rule

CI **must not** call OpenAI, Gemini, Claude, or OpenRouter.

### 12.2 Pyramid

| Layer | Share | Where |
|---|---|---|
| Unit | ~70% | No DB/Redis |
| Integration | ~25% | Postgres + Redis (compose or testcontainers) |
| E2E smoke | ~5% | `health`, login; no live vendors |

### 12.3 Required unit tests

- TaskRegistry + PRODUCT_ANALYSIS schemas
- Cost from snapshot (changing current Model price must not change a computed historical amount)
- API key hash, prefix, rotate primary/secondary
- Error mapper (timeout → `PROVIDER_TIMEOUT` + retryable)
- Prompt: latest active version
- Provider resolve by priority + purpose

### 12.4 Required integration tests

- `POST /jobs` + valid API key → `202` + Job row
- Worker + FakeAIProvider success → Execution, UsageLog, CostLog
- Fake timeout twice then success → 3 Execution rows, Job COMPLETED
- Fake invalid JSON → Execution #1 FAILED, Job FAILED, BullMQ attempts used = 1, no Execution #2
- All providers disabled → `NO_PROVIDER`, UsageLog = 0, CostLog = 0
- No matching model → `NO_MODEL`, no usage
- No active prompt → `NO_PROMPT`, no usage
- Rate limit → `429`
- Wrong API key → `401`
- Revoked API key → `401`
- Client disabled → `403`
- Job of another client → `404`
- Playground JWT → PlaygroundRun exists, Job count unchanged
- Playground fake timeout → HTTP `504`

### 12.5 Contract tests

`describeProviderContract(factory)` runs against OpenAI, Gemini, Claude, OpenRouter, and Fake adapters. Same assertions on `chat`, `analyzeImage`, `embeddings`, `moderation` (moderation may be NotImplemented on real adapters).

### 12.6 FakeAIProvider

Lives in `shared/ai`. Worker and playground use it when `AI_PROVIDER_DRIVER=fake` or `NODE_ENV=test`. Handlers never branch on vendor.

---

## 13. Configuration

```text
NODE_ENV
PORT=3000
DATABASE_URL
REDIS_URL
JWT_SECRET
JWT_EXPIRES_IN=8h
APP_ENCRYPTION_KEY          # 32-byte key for provider apiKeyEncrypted
SEED_ADMIN_EMAIL
SEED_ADMIN_PASSWORD
BULLMQ_QUEUE=ai-jobs
AI_PROVIDER_DRIVER=live|fake   # fake = FakeAIProvider for every call; live = adapter from Provider.type
PROVIDER_TIMEOUT_MS=60000
```

`.env` is never committed. `.env.example` lists keys without secrets.

---

## 14. Folder structure (target)

```text
ai-os/
  docker-compose.yml
  Dockerfile
  .env.example
  prisma/schema.prisma
  prisma/seed.ts
  src/
    main.ts                      api bootstrap
    worker.ts                    worker bootstrap
    app.module.ts
    modules/
      auth/
      clients/
      providers/
      models/
      prompts/
      tasks/
        handlers/
        schemas/
        registry/
      jobs/
      usage/
      costs/
      playground/
      health/
    shared/
      ai/
        ai-provider.interface.ts
        openai.provider.ts
        gemini.provider.ts
        claude.provider.ts
        openrouter.provider.ts
        fake.provider.ts
      queue/
      storage/
      logger/
      common/
  docs/superpowers/specs/
```

---

## 15. Roadmap (explicitly out of V1)

- Cross-provider fallback engine
- `Idempotency-Key` / `requestId` dedupe of POST /jobs
- HMAC request signing using `apiSecretHash`
- Webhook callbacks on job completion
- IP allowlist enforcement
- Split `INTERNAL` into `HANDLER_ERROR` / `SYSTEM_ERROR`
- Public API for Execution list / `rawResponse`
- Additional ClientKey kinds beyond PRIMARY/SECONDARY
- `moderation()` real implementations
- Storage (S3) for uploaded images; V1 uses URLs only

Schema already supports fallback (`Job 1—* Execution`) and extra keys (`Client 1—* ClientKey`).

---

## 16. Decision log

| Decision | Choice |
|---|---|
| Runtime | Modular monolith, api + worker processes |
| Human auth | JWT |
| System auth | `X-API-Key` only (not Bearer) |
| Playground auth | JWT ADMIN+ |
| Playground persistence | `PlaygroundRun`, not Job |
| Playground usage client | System client `PLAYGROUND` |
| Key storage | `ClientKey` child table, hashed, `lastUsedAt` |
| Provider secrets | Encrypted (decryptable) |
| Task purpose | Code registry, not DB |
| Prompt binding | `Task.promptKey` in DB |
| Retry | 3 attempts, same provider, exponential backoff |
| Fail closed config | Worker, not API |
| Cost | Usage → Cost from snapshot prices |
| Execution snapshots | provider, model (incl. prices), prompt |
| Execution timing | `startedAt`, `completedAt`, `durationMs` |
| Timeout | 60s per attempt; playground HTTP 504 |
| Errors | JSON `{ code, category, message, retryable }` |
| Other-tenant job | HTTP 404 |
| CI vendors | Forbidden |
| First task | PRODUCT_ANALYSIS / VISION / PRODUCT_ANALYZER |

---

## 17. Success criteria for V1

1. Compose brings up api, worker, postgres, redis.
2. Admin logs in, manages providers/models/prompts/clients.
3. Seeded Community-like client can `POST /jobs` for `PRODUCT_ANALYSIS` and poll to COMPLETED against FakeAIProvider.
4. Dashboard queries can group usage and cost by client without mixing playground traffic.
5. Invalid model JSON does not retry.
6. Swagger documents management and execution APIs with the correct auth schemes.
7. CI is green with zero live vendor calls.
