# DWELLERS — Database Guide

**Find. Buy. Build.** — Ghana's digital construction marketplace.

This document describes the Phase 2 database architecture: every entity, the
relationships between them, the nationwide Ghana location model, the
service-area system that powers discovery, the job-request/quote/project
pipelines, messaging, payments, the authorization model, and the processes for
migrating and seeding the database.

Current engine: **SQLite** (development). Target: **PostgreSQL** (production).
The schema is written PostgreSQL-ready — see §14 for the migration procedure.

---

## 1. Conventions (every model)

| Aspect    | Convention                                                                 |
| --------- | -------------------------------------------------------------------------- |
| Id        | `cuid()` string primary key                                                |
| Timestamps| `createdAt` / `updatedAt` automatic                                        |
| Status    | Plain `String` columns; values validated at the API boundary with zod (SQLite has no enums; PostgreSQL stays compatible) |
| Deletion  | Soft delete via `deletedAt` where history must survive (users, listings, businesses, projects, messages, portfolio) |
| Money     | **Integer pesewas** (`1 GH₵ = 100p`) — never floats. Field names end in `Amount`/`Price`/`Rate` |
| Quantity  | Integer thousandths (`quantityMilli = qty × 1000`) — the SQLite connector has no `Decimal` type |
| JSON      | Small JSON documents stored in `String` columns (e.g. `documentRefs`) — portable, no `Json` type |
| Table names | `@@map` to snake_case plurals (`users`, `job_requests`, …)               |
| Indexes   | Defined for actual query patterns (§12) — not blanket-indexed              |

---

## 2. Entity map (41 models)

```
IDENTITY      User · PersonalProfile · AuditLog (no FK, append-only)
BUSINESSES    Business · BusinessMember
PROVIDERS     ProviderProfile (+ ProviderServiceArea)
LOCATIONS     Region · District · Town · CommunityArea
TAXONOMY      Category (self-referencing tree) · MeasurementUnit
LISTINGS      Service (+ ServiceServiceArea) · Product (+ ProductImage)
              Equipment (+ EquipmentImage)
RFQ           JobRequest (+ JobRequestAttachment)
QUOTATIONS    Quote · QuoteItem
PROJECTS      Project · ProjectTask · ProjectMilestone
MESSAGING     Conversation · ConversationParticipant · Message
              MessageRead · MessageAttachment
TRUST         Notification · Review · Verification
PORTFOLIO     PortfolioItem (+ PortfolioImage)
FAVORITES     Favorite (polymorphic saved items)
COMMERCE      Order · OrderItem (price snapshots) · Payment
```

---

## 3. Identity & roles

**User** is the single account table. One account per email (unique), with
optional `phone` (unique, normalised to `+233…`). Verification is tracked with
`emailVerifiedAt` / `phoneVerifiedAt`; `lastLoginAt` records activity;
`status` is `ACTIVE | SUSPENDED | DEACTIVATED`; `deletedAt` soft-deletes.
Passwords are scrypt hashes written by `src/lib/auth/password.ts` — plaintext
never touches the database.

**Roles** are the eight values in `src/lib/auth/roles.ts` (`CUSTOMER`,
`ARTISAN`, `CONTRACTOR`, `CONSTRUCTION_COMPANY`, `SUPPLIER`,
`EQUIPMENT_PROVIDER`, `ADMIN`, `SUPER_ADMIN`). The role string is stored on
the user row and validated by `isRole()`; permissions come exclusively from
the server-side RBAC matrix (`src/lib/auth/permissions.ts`). Users can never
assign themselves a role — role changes go through staff-only, escalation-
guarded flows (`canManageRole`).

**PersonalProfile** (1:1) holds casual display data: bio, address, website,
home location. **BusinessMember** links users to businesses with a business
role (`OWNER | MANAGER | MEMBER`) and invitation state.

---

## 4. Businesses

**Business** is a company account owned by exactly one user (`ownerId`) and
may have many team members. It carries `businessType`
(`CONTRACTOR | CONSTRUCTION_COMPANY | SUPPLIER | EQUIPMENT_RENTAL | RETAIL |
OTHER`), contact fields, `registrationNumber`/`taxId` where applicable,
`verificationStatus` (`UNVERIFIED | PENDING | VERIFIED | REJECTED`) and
`status` (`ACTIVE | SUSPENDED | DELETED`).

A business is **optional** — individual artisans never create one. Providers,
services, products, equipment and portfolio items may optionally reference a
business (`businessId`), which is how company-affiliated work is represented.

**BusinessServiceArea** records the towns a business serves (§6).

---

## 5. Providers

**ProviderProfile** (1:1 with User) is the professional marketplace identity.
It models BOTH:

- the **individual artisan** (`businessId = null`), and
- the **business-affiliated professional** (`businessId` set, e.g. a site
  manager under a construction company).

Matching-relevant signals live here (the future matching engine reads them):

| Signal              | Column(s)                                        |
| ------------------- | ------------------------------------------------ |
| Trade               | `profession` (normalised lowercase key, e.g. `plumber`) |
| Where they work     | `primaryLocationId` + `provider_service_areas` rows (§6) |
| Availability        | `availabilityStatus` (`AVAILABLE | BUSY | UNAVAILABLE`) |
| Trust               | `verificationStatus`                             |
| Rating summary      | `ratingSum` + `ratingCount` (average = sum ÷ count, computed — never stored as float) |
| Experience          | `yearsExperience`                                |
| Track record        | `completedJobsCount`                             |
| Responsiveness      | `responseRatePercent`                            |
| Starting price      | `startingPriceAmount` (integer pesewas)          |

---

## 6. Nationwide Ghana locations & service areas

### 6.1 Location hierarchy

Dwellers is nationwide from day one — never Accra-centric. The hierarchy is a
set of four reference tables, seeded with the 16 regions and extensible
entirely through data (no code changes, no hard-coded towns):

```
GHANA
 └── Region        16 rows (ISO 3166-2:GH) — Ahafo … Western North
      └── District  District | Municipality | Metropolitan Assembly (MMDA)
           └── Town      city/town; `regionId` denormalised for fast
           │             "towns in region X" queries without joins
           └── CommunityArea   neighbourhood/area inside a town
```

`Town` and `CommunityArea` rows carry `latitude`/`longitude` (WGS84) where
available. Every location table has `slug` (URL-safe, unique per parent) and
`isActive`. Slugs + ids are the only location identifiers used by the API —
the frontend never hard-codes location data.

### 6.2 Service areas — where providers WORK

Service areas are **not** the provider's address. A provider based in Nsawam
can serve Nsawam, Adoagyiri, Suhum and more. Three join tables model this:

| Table                 | Subject        | Meaning                          |
| --------------------- | -------------- | -------------------------------- |
| `provider_service_areas` | ProviderProfile | towns the professional works in |
| `business_service_areas` | Business     | towns the company serves         |
| `service_service_areas`  | Service      | towns a specific listing covers  |

Each is `@@unique([subjectId, locationId])` with a reverse index on
`locationId`. **"Which plumbers serve Nsawam?"** resolves to:

```sql
SELECT p.* FROM provider_profiles p
JOIN provider_service_areas s ON s.provider_id = p.id
WHERE s.location_id = :nsawamTownId AND p.profession LIKE 'plumber%';
```

— the indexed query behind `GET /api/providers?profession=plumber&locationId=…`.
A provider matches a location either through an explicit service-area row OR
their `primaryLocationId`.

---

## 7. Marketplace taxonomy & listings

**Category** is a self-referencing tree (`parentId`), maximum three levels.
The seed ships four roots exactly matching the product requirements:

- **Construction Services** → Building, Roofing, Plumbing, Electrical,
  Masonry, Carpentry, Welding, Painting, Tiling, Landscaping, Renovation,
  Property Maintenance
- **Professional Services** → Architecture, Engineering, Quantity Surveying,
  Interior Design, Project Management
- **Materials** → Cement, Blocks, Sand, Aggregates, Iron Rods, Roofing
  Materials, Tiles, Paint, Doors, Windows, Electrical Materials, Plumbing
  Materials
- **Equipment** → Excavators, Loaders, Trucks, Concrete Mixers, Generators,
  Cranes, Rollers, Scaffolding

Categories are data-driven; administrators manage them through the API —
application code never branches on category names.

**MeasurementUnit** is the data-driven unit reference (bag, piece, ton,
kilogram, length, square metre, cubic metre, bundle, carton, unit, trip, day).
Products reference a unit by FK — UIs read the table, never hard-code units.

| Listing     | Owner              | Money fields (pesewas)                                   |
| ----------- | ------------------ | -------------------------------------------------------- |
| **Service** | ProviderProfile (+optional Business) | `startingPriceAmount` — required unless `pricingModel = QUOTE_REQUIRED` |
| **Product** | User (seller) (+optional Business)   | `priceAmount`                                            |
| **Equipment** | User (owner) (+optional Business)  | `dailyRateAmount`, `weeklyRateAmount`, `monthlyRateAmount`, `depositAmount` |

Service `pricingModel`: `FIXED | STARTING_FROM | PER_HOUR | PER_DAY |
PER_UNIT | QUOTE_REQUIRED`. Products carry `stockQuantity`,
`minOrderQuantity`, `deliveryAvailable` and `sku` (unique per seller).
Equipment carries brand/model/year/`condition`, operator/delivery
availability and `availabilityStatus`
(`AVAILABLE | RENTED_OUT | MAINTENANCE | RETIRED`).

Listing lifecycle: `DRAFT → ACTIVE → PAUSED/DELETED` (soft delete; `SUSPENDED`
is reserved for staff moderation). Public list endpoints expose only `ACTIVE`
rows of `ACTIVE` accounts.

---

## 8. Job requests (RFQ) — how Dwellers works without phone calls

A customer describes what they need, where, and when — no phone call required:

1. Customer opens Dwellers, searches **PLUMBER**, selects **NSAWAM**
   (profession × town — see §6.2).
2. Customer clicks **REQUEST A JOB** and files a structured **JobRequest**:
   title + description ("My kitchen sink is leaking…"), optional photos/
   videos/documents (`JobRequestAttachment`, storage keys only), location
   (`locationId` town + optional `communityId` + free-text `areaText` +
   optional lat/lng), budget range (`budgetMinAmount`/`budgetMaxAmount`),
   preferred date and time slot.
3. The request moves through the lifecycle:
   `DRAFT → SUBMITTED → MATCHING → RESPONDED → ACCEPTED → IN_PROGRESS →
   COMPLETED`, or `CANCELLED` (with reason) at any non-terminal point.
4. Providers respond with **Quotes** (§9); acceptance leads to a **Project**
   (§10). Every request gets a human-friendly `reference` (`JR-XXXXXXXX`).

Authorization: customers see ONLY their own requests; provider accounts see
requests targeted at them (`providerId`); staff see all. Foreign reads return
404 — existence of another customer's request is never disclosed.

### 8.1 Provider matching foundation

The schema prepares (but does not implement) the matching engine. For a job
request it can evaluate:

1. **Service/category match** — `categoryId`/`serviceId` vs `Service.categoryId` (indexed)
2. **Service-area match** — `locationId`/`communityId` vs the three service-area joins (indexed on `locationId`)
3. **Location/distance** — `latitude`/`longitude` on the request and on towns/communities
4. **Availability** — `ProviderProfile.availabilityStatus`, `Equipment.availabilityStatus`
5. **Verification** — `verificationStatus` on provider/business
6. **Rating** — `ratingSum`/`ratingCount`
7. **Experience** — `yearsExperience`, `completedJobsCount`
8. **Response rate** — `responseRatePercent`

**HOW DWELLERS FINDS AN ARTISAN:**

```
Customer
 → JobRequest (profession/category + town)
 → Town (or CommunityArea)
 → service-area joins (provider_service_areas / business_service_areas
    / service_service_areas) ∪ provider primaryLocation
 → eligible ProviderProfiles (ACTIVE user, not deleted)
 → ranked by verification, rating, availability, experience, response rate
 → quotation requests / direct hire
```

---

## 9. Quotations

**Quote** is a provider's priced response to a job request. Component amounts
(`labourAmount`, `materialAmount`, `equipmentAmount`, `otherChargesAmount`,
`discountAmount`, `taxAmount`) and `totalAmount` are integer pesewas.

**POLICY — totals are computed on the server.** Totals submitted by a frontend
are never trusted (enforced from the commerce phase; the schema comment
documents this where the rule binds). **QuoteItem** rows carry itemised lines
(Labour — GH₵1,000 / Materials — GH₵500 / Transport — GH₵100 …) with
`quantityMilli` (thousandths), `unitLabel` snapshot and `unitPriceAmount`;
`lineTotalAmount` is computed with `lineTotalAmount()` from
`src/lib/finance.ts` (round half up). Quote status: `DRAFT → SUBMITTED →
VIEWED → ACCEPTED | DECLINED | EXPIRED | WITHDRAWN`. Each quote has a unique
human `quoteNumber` (`QT-…`) and `customerId` denormalised from the job for
fast per-customer queries.

---

## 10. Projects

**Project** is the engagement record (often born from an accepted quote via
`quoteId`): customer, optional provider/business, category, location, budget
(pesewas), start/expected/actual dates, `status`
(`DRAFT → OPEN → QUOTATION → ACCEPTED → ACTIVE → ON_HOLD → COMPLETED |
CANCELLED`) and `progress` (0–100).

- **ProjectTask**: work items with `assigneeId`, `priority`, own status
  (`TODO | IN_PROGRESS | BLOCKED | DONE | CANCELLED`), dates and progress.
- **ProjectMilestone**: phase gates with due/completion dates, optional
  milestone `amount` and `paymentReference` for milestone billing later.

---

## 11. Messaging & notifications

**Conversation** may be linked to a JobRequest, Quote, Project or Order
(nullable FKs + `type`), so context travels with the discussion.
**ConversationParticipant** membership (unique per pair) is the access gate:
only participants may read/contribute. **Message** rows belong to a
conversation, support edit/soft-delete, and track per-user reads through
**MessageRead** receipts (unique per message+user). Attachments reference
storage keys. Realtime transport is a later phase — this is the durable
foundation.

**Notification** is recipient-scoped with `type`, `channel`
(`IN_APP | EMAIL | SMS | WHATSAPP` — only IN_APP is written today),
entity link and read state. Third-party channels plug in later without schema
changes.

---

## 12. Trust, portfolio, favorites

- **Review**: reviewer → provider/business, with overall + sub-ratings
  (quality, professionalism, communication, timeliness, value — 1–5),
  moderation status (`PENDING | PUBLISHED | REJECTED | REMOVED`) and
  `isVerifiedEngagement` set when the review traces to a completed
  job/project/order. Publication of provider/business ratings updates the
  `ratingSum`/`ratingCount` summary on ProviderProfile.
- **Verification**: submissions (`IDENTITY | BUSINESS_REGISTRATION |
  PROFESSIONAL_CERTIFICATE | ADDRESS | TAX | OTHER`) with `documentRefs`
  (JSON storage references), lifecycle `PENDING → UNDER_REVIEW → APPROVED |
  REJECTED | EXPIRED`, reviewer notes and timestamps.
- **PortfolioItem**: showcased work with ordered images, optional category/
  location/service links and completion date.
- **Favorite**: reusable saved-items system — `targetType`
  (`PROVIDER | SERVICE | PRODUCT | EQUIPMENT | BUSINESS`) + `targetId`,
  unique per user. Polymorphic integrity is enforced in the service layer.

---

## 13. Orders & payments

**Order** (unique `orderNumber` `DW-…`) carries customer, seller (and optional
seller business), `subtotalAmount` / `deliveryFeeAmount` / `discountAmount` /
`totalAmount` (integer pesewas), `paymentStatus`
(`UNPAID → PENDING → PAID → PARTIALLY_REFUNDED | REFUNDED | FAILED`) and
fulfilment `status` (`PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED
→ COMPLETED | CANCELLED`) plus delivery address/phone/notes/location.

**OrderItem** SNAPSHOTS the purchase: `productName`, `sku`, `unitLabel` and —
critically — the **historical `unitPriceAmount`**. Historical order totals are
never recomputed from today's catalogue price.

**Payment** is gateway-agnostic (`provider`: PAYSTACK, HUBTEL, MTN_MOMO,
TELECEL_CASH, AT_MONEY, BANK_TRANSFER, CASH, OTHER; `method`: MOBILE_MONEY,
CARD, BANK_TRANSFER, CASH) with unique `transactionRef`, provider transaction
id, lifecycle status and `metadata` (JSON, redacted — payment credentials are
never stored). It links optionally to an order, job request or project.
When commissions/splits/refunds are introduced, they MUST use the explicit
rounding/remainder policy in `src/lib/finance.ts` (round half up;
largest-remainder allocation; remainder to the first party) — never ad-hoc
division.

**Indexing strategy** (query-pattern driven — the full index list lives in
`prisma/schema.prisma`): every FK used for filtering is indexed; list endpoints'
sort keys (`createdAt`) are indexed; the discovery paths (`ProviderProfile.
profession`, `verificationStatus`, `availabilityStatus`; all service-area
joins on `locationId`; `Town.regionId`; `Category.parentId`) are indexed for
the "plumbers in Nsawam" query; commerce reads (`orders.status`,
`orders.paymentStatus`, `payments.status`) are indexed. No blanket indexing.

---

## 14. Authorization model (IDOR protection)

Every domain mutation and private read follows one pattern, implemented in
`src/lib/auth/ownership.ts`:

```
LOAD RESOURCE  →  VERIFY OWNERSHIP / PERMISSION  →  PERFORM ACTION
```

- **Authentication** resolves the caller from the signed session
  (`getAuthContext`) — client-supplied user ids are never trusted.
- **RBAC** (`hasPermission`) answers "can this role do X at all" at the route
  layer (e.g. `marketplace:products:create` for SUPPLIER).
- **Ownership** (`assertOwnership`) answers "does this record belong to the
  caller": customers own their job requests/projects; providers own their
  services through `providerId`; sellers own products through `sellerId`;
  staff (`ADMIN`/`SUPER_ADMIN`) may act where explicitly allowed
  (`allowStaff: true`).
- Missing records return **404** (never 403 for foreign records — existence
  is information). Foreign access returns opaque **403**. Unauthenticated
  access to protected routes returns **401** before any business logic.

---

## 15. Migration process

Prisma migrations are the ONLY way the schema changes — no manual pushes of
unreproducible schemas.

```bash
# development: create/apply a migration
bun run db:migrate            # prisma migrate dev --name <change>

# production-style deploy (no prompts)
bun run db:migrate:deploy     # prisma migrate deploy
```

**Clean-database test (verified in Phase 2):**

```bash
rm db/custom.db
bun run db:migrate:deploy     # rebuilds every table from migrations/
bun run db:seed               # reference data + demo data
bun run verify && bun run verify:phase2
```

The Phase 2 suite (`scripts/verify-phase2.ts`) additionally rebuilds an
isolated database (`db/test-phase2.db`) from the migration files on every run,
so the migration path itself is regression-tested.

## 16. Seed process

```bash
bun run db:seed               # idempotent — safe to re-run
```

Seeds:

- **16 regions**, sample districts, 54 towns (including Nsawam, Adoagyiri,
  Suhum from the product story) and 23 communities with coordinates.
- **Category tree** (4 roots, 39 children) and **12 measurement units**.
- **Clearly-marked demo data** — every demo row carries `isSeedData = true`
  and demo emails use `@demo.dwellers.test`. Demo providers are NEVER marked
  `VERIFIED`; fake providers can never appear as vetted businesses.
  Demo account password: `Demo#Passw0rd` (documented in the seed output only).

## 17. PostgreSQL readiness

The schema deliberately avoids SQLite-only features: no native enums (string
statuses validated at the boundary), no `Json` columns (JSON documents in
`String` columns), no `Decimal` (integer thousandths for quantities), cuid
string ids, and standard Prisma types throughout. `Prisma migrate` SQL is
regenerated per provider, so switching is:

```bash
# 1. Provision PostgreSQL and set DATABASE_URL, e.g.
#    postgres://user:password@host:5432/dwellers?schema=public
# 2. Change the datasource provider in prisma/schema.prisma:
#      provider = "postgresql"
# 3. Recreate the schema and re-seed reference data:
bunx prisma migrate dev --name postgresql_baseline
bun run db:seed
# 4. (Recommended) enforce a CHECK-migration for status columns and add
#    pg_trgm/GIN indexes for name search once on PostgreSQL.
```

Remaining considerations (documented, none blocking): search filtering uses
`contains` (case-insensitive on SQLite's ASCII; consider `citext`/`pg_trgm`
on PostgreSQL for richer matching), and quantity thousandths can later become
native `DECIMAL(12,3)` columns with a documented conversion.
