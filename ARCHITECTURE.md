# DWELLERS — Technical Architecture

**Find. Buy. Build.** — Ghana's digital construction marketplace.

This document records the technical architecture and the decisions behind it
as of **Phase 2 (Database Schema & Backend Foundation)**. It is a living
document: every phase appends decisions with their rationale.

---

## 1. System overview

Dwellers is a modular monolith built on Next.js 16 (App Router). The
presentation layer (React server/client components) and the API layer
(Route Handlers) live in one deployable, while business logic is organised
into domain modules with strict boundaries. This gives marketplace-speed
iteration today with clean extraction paths (separate services) later.

```
┌──────────────────────────────────────────────────────────────────┐
│ Client (browser / future mobile)                                 │
│  React Server Components + minimal client islands                │
└──────────────┬───────────────────────────────────────────────────┘
               │ HTTPS (relative /api paths only)
┌──────────────▼───────────────────────────────────────────────────┐
│ Network layer — src/proxy.ts                                     │
│  security headers · request IDs · coarse rate limiting           │
├──────────────────────────────────────────────────────────────────┤
│ API layer — src/app/api/** (Route Handlers)                      │
│  createHandler(): auth → RBAC → validation → business call →     │
│  uniform envelope · error mapping · logging · per-route limits   │
├──────────────────────────────────────────────────────────────────┤
│ Domain modules — src/modules/* (charters) + src/lib/* (engines)  │
│  identity · marketplace · discovery · projects · communication ·  │
│  commerce · trust · admin                                        │
├──────────────────────────────────────────────────────────────────┤
│ Data & infrastructure                                            │
│  Prisma + SQLite (PG-ready) · Storage provider interface ·       │
│  Audit service · Logger · Rate limiter · Env config              │
└──────────────────────────────────────────────────────────────────┘
```

### How the major components communicate

1. **Client → API**: the browser calls relative `/api/*` endpoints only.
   Responses always use the standard envelope (§4).
2. **Proxy → everything**: `src/proxy.ts` stamps `x-request-id`, applies
   security headers and applies the first rate-limit gate before any route
   runs.
3. **Route handler → guards**: `createHandler` resolves the caller from the
   signed NextAuth session, enforces the route's declared permission, and
   validates input — business logic never sees unvalidated data.
4. **Modules → infrastructure**: module services use `db` (Prisma),
   `recordAudit`, `logger`, `getStorage()` — never concrete drivers — so any
   infrastructure can be swapped without touching features.
5. **Audit vs logs**: operational telemetry goes to the logger (stdout → log
   drains); security-relevant WHO/WHAT/WHEN is appended to the `AuditLog`
   table via `recordAudit`. Both redact secrets and share event names.

### Module map (future features, established boundaries)

| Module          | Owns                                                        | Charter |
| --------------- | ----------------------------------------------------------- | ------- |
| Identity        | auth, users, roles, permissions, sessions, passwords        | `src/modules/identity` |
| Marketplace     | categories, services, products, equipment, providers, businesses | `src/modules/marketplace` |
| Discovery       | search, filtering, locations, recommendations               | `src/modules/discovery` |
| Projects        | projects, tasks, milestones, budgets, documents, progress   | `src/modules/projects` |
| Communication   | conversations, messages, attachments, notifications         | `src/modules/communication` |
| Commerce        | cart, orders, quotations, payments, transactions            | `src/modules/commerce` |
| Trust           | verification, reviews, ratings, reports                     | `src/modules/trust` |
| Admin           | dashboard, user/provider/marketplace management, settings, audit | `src/modules/admin` |

Cross-cutting engines (used BY modules, never the reverse):
`lib/api`, `lib/auth`, `lib/storage`, `lib/audit`, `lib/logger`,
`lib/rate-limit`, `lib/env`, `lib/errors`, `lib/finance`, `lib/constants`.

---

## 2. Technology decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Framework | Next.js 16 App Router | Already established by the scaffold; RSC keeps client bundles small; Route Handlers give a first-class API layer; single deployable for UI + API. |
| Language | TypeScript strict | Marketplace transactions demand compile-time safety; domain types shared end-to-end. |
| Styling | Tailwind 4 + shadcn/ui | Consistent premium UI without a custom design-system maintenance burden; accessible primitives (Radix) out of the box. |
| Database | SQLite → PostgreSQL path | SQLite keeps the sandbox/dev loop zero-infra; all schema/code is written PostgreSQL-ready (no SQLite-specific tricks, string enums at the boundary because SQLite lacks native enums). |
| ORM | Prisma | Typed queries, migrations, and a schema file that documents itself. |
| Auth | NextAuth v4 (JWT strategy) | Installed in the scaffold; JWT sessions survive scale-out without a session table; role claim embedded at sign-in. |
| Validation | zod | One schema language for env, API bodies/queries, and (later) form validation shared to the client. |
| Rate limiting | In-memory fixed window | Single-node today; interface allows a Redis-backed drop-in when horizontal scaling begins. |
| Storage | Provider interface + local driver | Local FS now, S3/CDN later — features only depend on the interface. |

### Deliberately deferred (no fake implementations)

Credentials/OAuth providers and login UI (Phase 2), the full marketplace
schema (Phase 2), payment provider integrations (env-gated, Commerce phase),
WebSocket realtime (Communication phase), search indexing beyond the DB
(Discovery phase). Phase 1 ships working infrastructure + conventions, never
stubbed features pretending to work.

---

## 3. Environment & configuration strategy

- Single validated source of truth: `src/lib/env.ts` (zod). Fails fast at
  boot with a human-readable issue list.
- `APP_ENV` (development | staging | production) is the deployment label
  independent of `NODE_ENV`; production-only requirements (e.g. `AUTH_SECRET`)
  are enforced in the schema.
- **Secrets never enter the repository.** `.env*` is gitignored;
  `.env.example` documents every variable with placeholders. Deployments
  receive secrets through the hosting platform's secret manager.
- Staging mirrors production variables; there is no code path that treats
  staging specially beyond `env.appEnv`.
- Third-party integrations (email, SMS, WhatsApp, payments) are optional
  variables — features that need them check presence via `env` and stay
  disabled (graceful degradation) when unset.

## 4. API conventions

**Envelope** — every JSON response, no exceptions:

```jsonc
// success
{ "success": true, "data": { /* … */ }, "meta": { "pagination": { /* … */ } } }
// failure
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": { /* field errors */ }, "requestId": "…" } }
```

**Route groups** are predictable nouns: `/api/auth`, `/api/users`,
`/api/providers`, `/api/businesses`, `/api/categories`, `/api/services`,
`/api/products`, `/api/equipment`, `/api/projects`, `/api/quotes`,
`/api/orders`, `/api/payments`, `/api/messages`, `/api/notifications`,
`/api/reviews`, `/api/admin`.

**Rules enforced by `createHandler`** (`src/lib/api/handler.ts`):

1. Rate limit per client+route (per-route override, sensible default).
2. Authentication from the server session only — `public` | `optional` |
   `required`; declaring a `permission` implies `required`.
3. RBAC check before any business logic.
4. Body and query validated by zod schemas declared on the route.
5. Errors → typed, user-safe responses (§5); unknown failures become opaque
   500s.
6. Every response carries `x-request-id` and `Cache-Control: no-store`.

**Status codes**: 200 read/update · 201 create · 204 delete · 400 malformed ·
401 unauthenticated · 403 unauthorized · 404 missing · 409 conflict ·
413/415 upload violations · 422 validation · 429 throttled · 503 dependency
down · 500 opaque failure.

**Pagination**: `?page=1&pageSize=20` (clamped to 100); list responses
include `meta.pagination` with `total`, `totalPages`, `hasNextPage`,
`hasPreviousPage`.

## 5. Error handling

- `AppError` subclasses (`src/lib/errors.ts`) carry a stable `code`, an HTTP
  `status` and a message that is always safe to show users.
- `toPublicError()` maps unknown throws and Prisma errors to semantic,
  non-leaking responses (`P2002 → 409`, `P2025 → 404`, driver failures →
  503, everything else → generic 500).
- Production never returns stack traces, driver messages, or internal
  identifiers; the original error is preserved server-side as `cause` for
  logs.
- Operational vs non-operational distinction drives alerting policy.

## 6. Logging & audit

- **Logger** (`lib/logger.ts`): level-filtered; pretty in dev, single-line
  JSON in production; child loggers bind `module` and `requestId`; sensitive
  keys (password, token, secret, authorization, cookie, card, momo…) are
  redacted recursively. Canonical event names in `LogEvent` (login, logout,
  failed login, registration, role change, verification change, payment,
  order, security, admin actions).
- **Audit** (`lib/audit.ts` → `AuditLog` table): append-only, written only
  through the service, never throws into business flows. Actions catalogued
  in `AUDIT_ACTIONS` (registration, logins, role changes, verification
  decisions, review moderation, order/payment transitions, admin settings
  changes, security events). Indexed by actor, action, entity and time —
  this is the future admin audit-log browser's data source.

## 7. Security model

Defense in depth across four layers:

1. **Network (proxy.ts)** — `X-Content-Type-Options: nosniff`,
   `X-Frame-Options: DENY`, `Referrer-Policy`,
   `Permissions-Policy`, HSTS in production, request IDs, coarse per-IP API
   rate limiting. (CSP with nonces is planned alongside authenticated
   surfaces in Phase 2 — documented, not half-shipped.)
2. **API (createHandler + guards)** — authentication from the signed session
   only; permission checks (`requirePermission`/`requireAll`/`requireAny`)
   before business logic; strict rate limits on auth-class endpoints
   (brute-force control).
3. **Business (RBAC engine)** — the permission matrix is the single
   authority; `canManageRole()` makes privilege escalation structurally
   impossible (ADMIN can never touch SUPER_ADMIN; providers can't manage
   accounts); ownership checks are a mandatory service-layer pattern
   (load → verify owner/staff → act) to stop IDOR — client-supplied IDs are
   data, never authorization.
4. **Data & input (zod + Prisma + storage)** — all external input schema-
   validated; Prisma parameterises queries (SQL-injection safe); uploads are
   bounded per category (type + size), renamed to generated UUID keys, and
   the local driver rejects path traversal; private files will stream only
   through permission-checked routes.
5. **Client trust** — secrets only in server env; `NEXT_PUBLIC_*` is the
   only exposure channel; NextAuth JWT is HttpOnly-signed; CSRF: the API is
   same-origin JSON (no cookies-for-actions beyond the session cookie, which
   NextAuth protects); server actions/routes re-verify session server-side.

Known technical debt (tracked, deliberate):
- `typescript.ignoreBuildErrors = true` inherited from the scaffold — to be
  removed after a type-coverage pass.
- In-memory rate limiter is per-instance — swap for Redis when scaling out
  (interface already matches).
- CSP tightening, content-type magic-byte sniffing and virus scanning for
  uploads land with the authenticated upload features (Phase 2+).

## 8. Database principles

Every model follows (`prisma/schema.prisma`):

- `cuid()` primary keys; explicit foreign-key relations (full relational
  graph lands in Phase 2).
- `createdAt`/`updatedAt` timestamps everywhere; `deletedAt` soft deletion
  where records must be recoverable (e.g. users, listings, orders).
- Lifecycle as `status` strings validated at the application boundary
  (SQLite has no native enums; PostgreSQL migration can promote them).
- **Money is integer minor units (pesewas)** — `lib/finance.ts` is the only
  converter/formatter; floats never touch amounts. Rounding is ROUND_HALF_UP;
  splits use largest-remainder allocation with the remainder going to the
  first party — never ad-hoc division.
- **Quantities are integer thousandths** (`quantityMilli = qty × 1000`) —
  the SQLite connector has no `Decimal` type, and floats are unsafe everywhere.
- Indexes on query-pattern columns only (see DATABASE.md § Indexing strategy);
  unique constraints on natural keys (`User.email`, `User.phone`, business
  `slug`, `Order.orderNumber`, quote numbers, payment refs, service-area pairs).
- Statuses are string columns validated at the zod boundary — PostgreSQL
  compatible by design.

**Phase 2 schema** (the full domain model — see DATABASE.md for the tour):
41 models covering identity (User, PersonalProfile), businesses (Business,
BusinessMember), providers (ProviderProfile), the nationwide Ghana location
hierarchy (Region → District → Town → CommunityArea with lat/lng), service
areas (three join tables answering "who serves Nsawam?"), taxonomy
(Category tree, MeasurementUnit), listings (Service, Product, Equipment with
image children), the RFQ backbone (JobRequest + attachments), quotations
(Quote, QuoteItem), projects (Project, ProjectTask, ProjectMilestone),
messaging (Conversation, ConversationParticipant, Message, MessageRead,
MessageAttachment), trust (Notification, Review, Verification), portfolio,
favorites, commerce (Order + OrderItem with historical price snapshots,
gateway-agnostic Payment) and the append-only AuditLog.

### Ghana geography model

All location-aware features use one database-backed hierarchy:

```
Region (16, ISO 3166-2:GH) → District (MMDA) → Town/City → CommunityArea
```

Every level is a table with slug, coordinates where available and `isActive`;
reference data is seeded (`scripts/seed.ts`) and extended data-driven —
features must never hard-code cities. Town rows denormalise `regionId` so
region-wide sweeps never need a join. Service areas are deliberately separate
from where a provider lives (see DATABASE.md §6.2): a provider based in
Nsawam can serve Nsawam, Adoagyiri, Suhum and more, each as its own indexed
join row — this is what later answers "which plumbers serve Nsawam?".

### Discovery architecture (Phase 4)

The Find experience is ONE engine behind MANY doors — homepage hero, `/find`,
`/find/[category]`, `/find/[category]/[location]`, the provider directory and
`GET /api/discovery/providers` all call `discoverProviders()` in
`src/modules/discovery/provider-discovery.ts`; no surface implements search
logic itself. The pipeline is: strict Zod criteria → resolve IDs (taxonomy
subtree, location tier) → hard filters (active account, offered service,
covering service area, server-side filters) → capped candidate fetch →
scoring via the central weight matrix (`ranking.ts`: service 30 / location 25
/ availability 15 / rating 10 / response 10 / experience 5 / verification 5,
neutral-fill for missing data) → sort → server-side pagination → a
privacy-safe envelope (no emails, phones or raw coordinates; distances are
derived Haversine bands). Zero exact results trigger a clearly labeled
nearby tier (same filters, towns within 50 km) — the customer's selection is
never silently replaced. Full contract, SEO routes and upgrade path:
**DISCOVERY.md**.

### Client IP & trusted proxies

Forwarded headers are trusted ONLY when `TRUST_PROXY_ENABLED=true` (a
deployment behind infrastructure we control). With `TRUSTED_PROXY_HOPS=N`,
the client IP is the entry at position `length − N` of `X-Forwarded-For` —
the peer observed by the first trusted proxy. Direct deployments (trust off)
ignore forwarded headers entirely and record `direct`, so a client can never
forge its source IP. `getClientIp` in `lib/rate-limit.ts` is the single
extraction point (rate limiter + audit both use it).

## 9. File management

Eight upload categories exactly match the product requirements
(`profile-image`, `business-logo`, `product-image`, `portfolio-image`,
`project-image`, `document`, `quote-attachment`, `message-attachment`).
Each category has a policy: allowed MIME types + size ceiling
(`lib/storage/validation.ts`). Keys are generated
(`<category>/<year>/<month>/<uuid><ext>`) — original filenames are stored as
metadata, never used as paths. The `StorageProvider` interface isolates the
backend; the local driver enforces containment (no traversal), and access
control for private objects is enforced by the API routes that serve them.

## 10. Performance strategy

- Server components by default; client JS only where interaction demands
  (the Phase 1 landing ships zero interactive islands).
- List endpoints paginate through the shared contract; over-eager requests
  are clamped, not crashed.
- Database indexes defined at the schema level; Prisma queries select
  explicit fields (no blind `SELECT *` patterns in services).
- Caching: HTTP `no-store` on API data (correctness first); an in-process
  cache layer is reserved for hot reads (categories, geo, settings) as
  features land.
- Images: `sharp` is available; image optimization pipelines (next/image +
  generated variants) activate with real upload features.
- Realtime (WebSocket) is isolated in `mini-services/` so chat traffic never
  shares the Next.js process.

## 11. Delivery roadmap

| Phase | Scope | Status |
| ----- | ----- | ------ |
| **Phase 1** | Foundation, architecture & standards | **Complete** (gate: PASS WITH CONDITIONS) |
| **Phase 2** | Database schema & backend foundation (full domain model, first API surface, remediation) | **Complete** |
| Phase 3 | Authentication, registration & role-based dashboards | ✅ Delivered (see AUTHENTICATION.md) |
| Phase 4 | Find / Nationwide Discovery (search engine, ranking, SEO landings, provider profiles) | ✅ Delivered (see DISCOVERY.md) |
| Phase 5 | Request Service / Job Requests (real RFQ workflow, state machine, attachments, notifications) | ✅ Delivered (see JOB_REQUESTS.md) |
| Phase 6+ | Quotations, payments, messaging, commerce, trust features | Indicative |

Phase sequencing is confirmed per product priorities. **The project does not
proceed to Phase 6 without explicit instruction.**
