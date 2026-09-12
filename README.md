# DWELLERS — Find. Buy. Build.

Ghana's digital construction marketplace. Dwellers connects people who are
**building, renovating, maintaining or improving property** with trusted
artisans, contractors, construction companies, architects, engineers,
quantity surveyors, interior designers, material suppliers and equipment
providers.

The long-term product journey: **Find → Compare → Connect → Quote → Buy → Build**.

> **Current status: Phase 2 — Database Schema & Backend Foundation (complete).**
> Phase 1 delivered the professional technical foundation; Phase 2 delivered
> the full domain database (41 models), the nationwide Ghana location
> hierarchy, the job-request/RFQ backbone and the first real API surface.
> Marketplace UI features are intentionally NOT built yet.

---

## Technology stack

| Layer      | Technology                                        |
| ---------- | ------------------------------------------------- |
| Framework  | Next.js 16 (App Router) + TypeScript 5 (strict)   |
| UI         | Tailwind CSS 4 + shadcn/ui (New York) + Lucide    |
| Runtime    | Bun (dev/test), Node-compatible production output |
| Database   | SQLite via Prisma ORM 6 (PostgreSQL-ready by design) |
| Auth       | NextAuth.js v4 — JWT sessions (providers land in Phase 2) |
| Validation | zod 4 — every API boundary                        |
| State      | Zustand (client) · TanStack Query (server state)  |
| Lint/QA    | ESLint 9 (`eslint-config-next`) · foundation verify script |
| VCS        | Git with Conventional Commits                     |

## Project structure

```
├── prisma/
│   ├── schema.prisma            # Full domain model (42 models — see DATABASE.md)
│   └── migrations/              # Reproducible migrations (never manual pushes)
├── scripts/
│   ├── verify-foundation.ts     # `bun run verify` — Phase 1 core checks
│   ├── verify-phase2.ts         # `bun run verify:phase2` — domain + security suite
│   ├── verify-phase3.ts         # `bun run verify:phase3` — auth + onboarding suite
│   ├── verify-phase4.ts         # `bun run verify:phase4` — discovery suite
│   └── seed.ts                  # `bun run db:seed` — Ghana locations, taxonomy,
│                                #   clearly-marked demo accounts/listings
├── src/
│   ├── app/
│   │   ├── api/                 # API routes (built on the shared handler factory)
│   │   │   ├── route.ts         #   /api — index & conventions
│   │   │   ├── health/          #   /api/health — liveness + DB check
│   │   │   ├── users/           #   /api/users(/me) — account self-service
│   │   │   ├── businesses/      #   /api/businesses — company profiles
│   │   │   ├── providers/       #   /api/providers — provider profiles (Phase 2 API)
│   │   │   ├── discovery/       #   /api/discovery — THE search contract (Phase 4)
│   │   │   ├── categories/      #   /api/categories — taxonomy
│   │   │   ├── locations/       #   /api/locations — Region→District→Town→Community
│   │   │   ├── services/        #   /api/services — service listings
│   │   │   ├── products/        #   /api/products — product listings
│   │   │   ├── equipment/       #   /api/equipment — equipment listings
│   │   │   ├── job-requests/    #   /api/job-requests — RFQ lifecycle
│   │   │   └── [...path]/       #   JSON 404 catch-all (API envelope)
│   │   ├── layout.tsx           # Root layout, metadata, fonts
│   │   ├── page.tsx             # Brand foundation landing
│   │   └── globals.css          # Design tokens (Dwellers palette)
│   ├── components/
│   │   ├── ui/                  # shadcn/ui primitives (do not duplicate)
│   │   ├── layout/              # Site header, footer, brand mark
│   │   └── foundation/          # Phase 1 landing sections
│   ├── config/                  # Brand + navigation constants (client-safe)
│   ├── lib/
│   │   ├── api/                 # API conventions: handler factory, envelope,
│   │   │                        #   pagination, validation, shared schemas
│   │   ├── auth/                # RBAC engine: roles, permissions, guards,
│   │   │                        #   session, password hashing, ownership (IDOR)
│   │   ├── storage/             # Upload policies + storage provider interface
│   │   ├── constants/           # Ghana geo reference data
│   │   ├── audit.ts             # Append-only audit trail service
│   │   ├── db.ts                # Prisma client singleton (dev-only query logging)
│   │   ├── env.ts               # zod-validated environment configuration
│   │   ├── errors.ts            # AppError hierarchy + safe error mapping
│   │   ├── finance.ts           # GH₵ money helpers + rounding/division policy
│   │   ├── logger.ts            # Structured, redacting logger + event names
│   │   ├── rate-limit.ts        # Hardened rate limiter + trusted-proxy client IP
│   │   └── utils.ts             # slugify, reference generation
│   ├── modules/                 # Domain modules (identity, marketplace, discovery,
│   │                            #   projects, …) — charters + zod schemas + services
│   ├── proxy.ts                 # Network layer: security headers, request IDs,
│   │                            #   coarse API rate limiting (Next 16 proxy)
│   └── types/                   # Shared API contract types
├── .env.example                 # Environment template (never real secrets)
├── ARCHITECTURE.md              # Technical architecture & decisions
├── DATABASE.md                  # Database guide: entities, locations, service
│                                #   areas, RFQ/quote/project/messaging/payment
│                                #   architecture, authorization, migrations, seed
└── README.md
```

## Getting started

### Prerequisites
- Bun ≥ 1.2 (or Node ≥ 20 with a compatible package manager)
- Git

### Install

```bash
bun install
```

### Configure the environment

```bash
cp .env.example .env
# Fill in values — only DATABASE_URL is required in development.
# Generate an auth secret with: openssl rand -base64 32
```

Never commit `.env`. Secrets live only in your local file or the deployment
platform's secret manager.

### Run locally

```bash
bun run dev        # http://localhost:3000
```

### Verify the foundations

```bash
bun run verify           # 48 checks — RBAC, errors, pagination, storage,
                         # passwords, money, Ghana reference data
bun run verify:phase2    # 106 checks — domain entities, ownership/IDOR,
                         # money policy, phone validation, storage streaming,
                         # rate limiter, client IP (isolated test database)
bun run verify:phase3    # 73 checks — registration (6 paths), login/logout,
                         # sessions, passwords, account status, ownership,
                         # notifications, audit, live HTTP auth flows
bun run verify:phase4    # 56 checks — discovery engine, critical Nsawam
                         # acceptance (4 tests), ranking, filters, sorting,
                         # pagination, nearby fallback, privacy, analytics,
                         # SEO landings, live HTTP discovery contract
```

### Lint & types

```bash
bun run lint
bunx tsc --noEmit        # must pass — ignoreBuildErrors is false
```

### Database

```bash
bun run db:migrate          # create/apply a migration (team workflow)
bun run db:migrate:deploy   # apply migrations without prompts (CI/production)
bun run db:seed             # seed Ghana locations, taxonomy, demo data
bun run db:generate         # regenerate the Prisma client
bun run db:push             # (dev shortcut only — prefer migrations)
```

The SQLite file lives at `db/custom.db` (gitignored). See **DATABASE.md** for
the full data model and the PostgreSQL migration procedure.

### Build for production

```bash
bun run build          # standalone output in .next/standalone
bun run start          # serve the production build
```

### Deploy

1. Provision secrets on the platform (at minimum: `DATABASE_URL`,
   `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`; `APP_ENV=production`).
2. Build with `bun run build` and run `bun run start` (or the standalone
   server directly behind a reverse proxy).
3. Run `bun run db:migrate` (or `db:push` for SQLite single-node) during the
   release step.
4. Point monitoring at `GET /api/health` — expects the success envelope with
   `checks.database = "connected"`.

## Environment variables

The full, commented list lives in **`.env.example`**. Groups:

| Group            | Keys (examples)                                   | Required in dev? |
| ---------------- | ------------------------------------------------- | ---------------- |
| Application      | `APP_ENV`, `NEXT_PUBLIC_APP_URL`, `LOG_LEVEL`     | No (defaults)    |
| Database         | `DATABASE_URL`                                    | **Yes**          |
| Auth             | `AUTH_SECRET`, `NEXTAUTH_URL`                     | Production only  |
| Storage          | `STORAGE_DRIVER`, `STORAGE_LOCAL_PATH`            | No (defaults)    |
| Email / SMS / WhatsApp | `SMTP_*`, `SMS_*`, `WHATSAPP_*`             | Optional         |
| Payments         | `PAYSTACK_*`, `HUBTEL_*`, `MOMO_*`                | Optional         |

`src/lib/env.ts` validates everything at boot and fails fast with a clear
report; sensitive variables are enforced in production via
`requiredInProduction` rules.

## Git conventions

Conventional Commits, always meaningful:

```
feat: initialize Dwellers architecture
feat: add authentication foundation
fix: resolve quotation validation
docs: expand deployment guide
refactor: extract quotation pricing rules
```

Never: `update`, `changes`, `test`, `stuff`.

## Testing strategy

- **Foundation checks** — `bun run verify` exercises the security-critical
  pure layers (RBAC, escalation rules, error mapping, upload policies,
  password hashing, money).
- **Phase 2 suite** — `bun run verify:phase2` builds an isolated database
  from the migrations and tests every domain entity: creation, validation,
  relationships, authorization, ownership/IDOR denials, duplicate records,
  pagination, money policy, phone validation, storage streaming/traversal,
  rate-limiter eviction and trusted-proxy IP extraction.
- **Lint + strict types** — `bun run lint` and `tsc --noEmit` with
  `noImplicitAny` on; the build fails on type errors.
- **API contract** — every route uses the shared handler factory, so
  envelope/status conventions are enforced structurally, not by review.

## Where to read next

- **[DISCOVERY.md](./DISCOVERY.md)** — the Find experience: search criteria,
  service/location matching, the ranking weights, nearby fallback,
  public/authenticated boundaries, SEO routes and the API contract.
- **[DATABASE.md](./DATABASE.md)** — the data model: entities, relationships,
  Ghana location hierarchy, service areas, job-request/quote/project/messaging
  architecture, authorization model, migrations, seed and PostgreSQL readiness.
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — how the system is designed and
  why: module map, API conventions, security model, database principles,
  Ghana geography model, performance strategy and the delivery roadmap.
- **`src/modules/*/README.md`** — the charter of each domain module
  (responsibilities, rules, planned API surface).
