# DWELLERS — Find. Buy. Build.

Ghana's digital construction marketplace. Dwellers connects people who are
**building, renovating, maintaining or improving property** with trusted
artisans, contractors, construction companies, architects, engineers,
quantity surveyors, interior designers, material suppliers and equipment
providers.

The long-term product journey: **Find → Compare → Connect → Quote → Buy → Build**.

> **Current status: Phase 1 — Project Foundation, Architecture & Development
> Standards.** Marketplace features are intentionally NOT built yet; this phase
> delivers the professional technical foundation they will be built on.

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
│   └── schema.prisma            # Foundation models (User, AuditLog) + conventions
├── scripts/
│   └── verify-foundation.ts     # `bun run verify` — proves core foundations work
├── src/
│   ├── app/
│   │   ├── api/                 # API routes (built on the shared handler factory)
│   │   │   ├── route.ts         #   /api — index & conventions
│   │   │   └── health/          #   /api/health — liveness + DB check
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
│   │   │                        #   pagination, validation
│   │   ├── auth/                # RBAC engine: roles, permissions, guards,
│   │   │                        #   session, password hashing
│   │   ├── storage/             # Upload policies + storage provider interface
│   │   ├── constants/           # Ghana geo reference data
│   │   ├── audit.ts             # Append-only audit trail service
│   │   ├── db.ts                # Prisma client singleton
│   │   ├── env.ts               # zod-validated environment configuration
│   │   ├── errors.ts            # AppError hierarchy + safe error mapping
│   │   ├── finance.ts           # GH₵ money helpers (integer pesewas)
│   │   ├── logger.ts            # Structured, redacting logger + event names
│   │   └── rate-limit.ts        # In-memory rate limiter + policies
│   ├── modules/                 # Domain module charters (identity, marketplace,
│   │                            #   discovery, projects, communication, commerce,
│   │                            #   trust, admin) — one README per module
│   ├── proxy.ts                 # Network layer: security headers, request IDs,
│   │                            #   coarse API rate limiting (Next 16 proxy)
│   └── types/                   # Shared API contract types
├── .env.example                 # Environment template (never real secrets)
├── ARCHITECTURE.md              # Technical architecture & decisions
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

### Verify the foundation

```bash
bun run verify     # 48 checks across RBAC, errors, pagination, storage,
                   # passwords, money and Ghana reference data
```

### Lint

```bash
bun run lint
```

### Database

```bash
bun run db:push        # sync schema (development workflow)
bun run db:generate    # regenerate the Prisma client
bun run db:migrate     # create/apply a migration (team workflow)
```

The SQLite file lives at `db/custom.db` (gitignored). See `.env.example` for
the PostgreSQL connection format used when the platform moves to a managed
database.

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
- **Lint** — `bun run lint` keeps Next.js rules enforced.
- **Unit/integration tests** — arrive with Phase 2 backend features
  (Vitest recommended; the architecture keeps business logic pure and
  testable by design: no framework coupling inside `src/lib`).
- **API contract** — every route uses the shared handler factory, so
  envelope/status conventions are enforced structurally, not by review.

## Where to read next

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — how the system is designed and
  why: module map, API conventions, security model, database principles,
  Ghana geography model, performance strategy and the delivery roadmap.
- **`src/modules/*/README.md`** — the charter of each domain module
  (responsibilities, rules, planned API surface).
