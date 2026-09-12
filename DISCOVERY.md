# DWELLERS — Discovery Guide

**Find. Buy. Build.** — Ghana's digital construction marketplace.

Phase 4 turns Dwellers into a real discovery marketplace: a customer says
**what** they need and **where** they need it, and Dwellers returns the
providers whose **service areas** and **offerings** genuinely match — ranked,
paginated and honest. This document is the contract for how discovery works.

---

## 1. Discovery architecture (one engine, many doors)

Every discovery surface uses the SAME backend service — no surface implements
search logic itself.

```
Homepage hero search ─┐
Find menu (/find) ────┤
Category landing ─────┤──► discoverProviders() ──► GET /api/discovery/providers
/find/[category] ─────┤        (src/modules/         (same engine over HTTP,
/find/[cat]/[loc] ────┤         discovery/            used by future mobile
Provider directory ───┘         provider-discovery.ts) and partners)
```

- **Service layer**: `src/modules/discovery/provider-discovery.ts` — the
  pipeline. `src/modules/discovery/ranking.ts` — the ONLY place weights and
  scoring bands live. `src/modules/discovery/landing.ts` — SEO slug
  resolution + landing content.
- **API**: `GET /api/discovery/providers` (search) and
  `POST /api/discovery/events` (anonymous interaction events).
- **Pages**: `/find`, `/find/[category]`, `/find/[category]/[location]`,
  `/providers/[id]`, homepage hero.
- The Phase 2 `GET /api/providers` endpoint still exists for back-compat; the
  discovery API is the product contract going forward.

## 2. Search criteria

The engine accepts (all validated with a strict Zod schema — unknown or
malformed values are rejected with `422 VALIDATION_ERROR`):

| Group     | Parameters |
| --------- | ---------- |
| Service   | `categorySlug` / `categoryId` / `serviceId` (resolved to the category subtree) |
| Location  | `communityId` → `townId` → `districtId` → `regionId` (IDs are authoritative — never names), optional `latitude`/`longitude` search point |
| Quality   | `verification` (UNVERIFIED/PENDING/VERIFIED), `availability` (AVAILABLE/BUSY/UNAVAILABLE), `minRating`, `maxPrice` (integer pesewas) |
| Shape     | `providerType` (INDIVIDUAL/BUSINESS), `maxDistanceKm`, `q` (free text over profession/headline/biography/business name) |
| Output    | `sort`, `page`, `pageSize` |

Internally IDs are resolved to real rows first; unknown IDs fail validation
instead of silently returning wrong results.

## 3. Service matching

"Provider offers the requested service" means the provider has at least one
**ACTIVE `Service` row inside the requested category subtree**. Categories are
a 3-level tree (root → leaf); searching a root (e.g. *Construction Services*)
finds specialists in every child (e.g. *Plumbing*), but an exact leaf hit
scores higher than an ancestor hit. Nothing is matched from free-text
addresses or hard-coded trade names — the taxonomy is database-driven.

## 4. Location matching

Dwellers serves all 16 regions through the Phase 2 hierarchy:

```
GHANA → REGION (16) → DISTRICT/MUNICIPALITY (MMDA) → TOWN/CITY → COMMUNITY/AREA
```

- "Serves the area" means a **`ProviderServiceArea` row** (or the profile's
  base `primaryLocationId`) covering the requested town — never a text match
  on an address. Businesses use `BusinessServiceArea`.
- A community search resolves to its town (service areas are town-level).
- District/region searches sweep every active town inside them.
- Where coordinates exist (lat/lng on Region/District/Town/CommunityArea),
  **Haversine** distance (`src/lib/geo.ts`) measures the request point
  against the provider's nearest served town. Distances surface only as
  derived values (`distanceKm`, band label `0–5 / 5–15 / 15–30 / 30+ km`) —
  **raw coordinates never leave the service layer**.

## 5. Provider eligibility (hard filters — applied before any scoring)

A provider appears in results only when ALL of these hold:

1. `deletedAt` is null and the **user account is ACTIVE** — suspension takes
   effect immediately (the same live-status rule as authenticated routes).
2. The provider **offers the requested service/category** (ACTIVE Service row
   in the subtree) — when a service/category is part of the search.
3. The provider's **service area covers the requested location** (exact town,
   or a town inside the district/region sweep).
4. Server-side filters apply: `verification`, `availability`, `minRating`,
   `maxPrice`, `providerType`, `maxDistanceKm`, `q`.

## 6. Ranking algorithm (PART 10)

Weights live ONLY in `src/modules/discovery/ranking.ts` and are asserted to
sum to 100% at module load:

| Component    | Weight | Signal |
| ------------ | ------ | ------ |
| Service match     | 30% | Exact leaf category 1.0 · ancestor match 0.6 |
| Location match    | 25% | Exact town 1.0 · distance band (1.0/0.8/0.55/0.35) · district sweep 0.6 · region sweep 0.3 |
| Availability      | 15% | AVAILABLE 1.0 · BUSY 0.4 · UNAVAILABLE 0 · unknown 0.5 |
| Rating quality    | 10% | Published-review average ÷ 5 (needs ≥ 3 reviews) |
| Response rate     | 10% | `responseRatePercent` ÷ 100 |
| Experience        | 5%  | Years ÷ 10 (capped at 1) |
| Verification      | 5%  | VERIFIED 1.0 · PENDING 0.5 · UNVERIFIED 0 |

**Neutral-fill rule**: a component with no real data (no reviews yet, no
response rate, no years recorded) scores **0.5 and keeps its weight**.
Missing information pulls a provider toward the middle — it never boosts an
empty profile above a substantive one and never fabricates data. Ratings
below 3 reviews are treated as "no rating yet" for the same reason.

**Ranking transparency (PART 40)**: surfaces show plain-language reasons —
"Serves your area", "Offers Plumbing", "Available now", "Highly rated",
"Verified provider", "About 5–15 km away" — never the numeric score, and the
word "Best" is never used. "Recommended" means this score.

## 7. Sorting

| Sort | Behaviour |
| ---- | --------- |
| Recommended | The Dwellers matching score (above) |
| Nearest | Haversine distance ascending; providers without measurable distance fall back to score, never fabricated |
| Highest rated | Rated providers first (≥ 3 reviews), then average, then score |
| Most experienced | Years descending |
| Lowest starting price | Ascending; quote-required/unpriced last |
| Fastest response | Response rate descending; nulls last |

## 8. Pagination

Server-side always: `page` + `pageSize` (≤ 100) → `{ items, page, pageSize,
total, totalPages, hasNextPage, hasPreviousPage }`. Ranking happens on the
eligible candidate set (capped at 600 per run — see §13), then the page is
sliced. A provider appears **exactly once** per result set regardless of how
many services or service areas matched (dedupe by provider ID).

## 9. Nearby fallback

When an exact search returns **zero** results and the request has a search
point with coordinates, the engine retries the SAME hard filters with the
location condition swapped for towns within **50 km**. Results are returned
in a separate, clearly labeled block — `nearby: { label: 'Nearby providers',
items, total }` — and every card names the town it actually serves. The
customer's original selection is never silently replaced. If filters
(verification, etc.) exclude everyone nearby, the nearby block is empty too —
no filter is downgraded to fill the page. Empty states also suggest real
nearby towns ("Try nearby areas") and offer the Phase 5 job-request entry.

## 10. Public vs authenticated discovery (PART 22)

| Action | Auth required |
| ------ | ------------- |
| Search, view results, view category/location pages | No |
| View public provider profile | No |
| REQUEST SERVICE | Yes → sign-in preserves intent via `?callbackUrl=/providers/[id]?intent=request-service`; signed-in users get the honest "job requests arrive with Phase 5" state — **no fake submission is ever created** |
| MESSAGE PROVIDER | Yes → same pattern (`intent=message`); no simulated messages |
| POST JOB (from empty state) | Yes → registration entry preserved for Phase 5 |

## 11. SEO (PART 25–28)

- Indexable, database-driven routes: `/find/[category]` and
  `/find/[category]/[location]` (location segment resolves town → district →
  region). `/find?...` URLs are the canonical shareable search form.
- Only content-backed URLs exist: `sitemap.xml` includes category pages and
  category × town combinations that genuinely have ≥ 1 eligible provider
  (computed from real Service + ProviderServiceArea rows, capped at 500).
- Every discovery page ships `generateMetadata` (title/description from DB
  rows), canonical URL and Open Graph tags; provider profiles add JSON-LD
  (`ProfessionalService`) with `aggregateRating` ONLY when real published
  reviews exist.
- `robots.ts` allows all discovery surfaces; authenticated areas are
  disallowed. No discovery page is noindexed.
- Footer + category landings provide internal links from real taxonomy rows.

## 12. API surface

| Endpoint | Auth | Notes |
| -------- | ---- | ----- |
| `GET /api/discovery/providers` | public | full criteria contract; strict schema; `search` rate-limit preset (60/min/IP) |
| `POST /api/discovery/events` | optional | `{ type, providerId?, categoryId?, townId?, resultCount? }` — enum-locked, no free text, no PII; returns 204 |
| `GET /api/categories`, `GET /api/locations` | public | Phase 2 APIs powering the search UI |

Analytics events recorded (PART 32): `provider_search` (API), 
`provider_profile_view` (profile page), `provider_contact_clicked`,
`request_service_clicked`, `filter_used` (client). Rows store resolved IDs
and coarse counters only — no user IDs, no IPs, no free text (the schema has
no such columns; enforced by a suite check).

## 13. Performance (PART 21)

- One capped `findMany` per tier (exact, nearby) with minimal `select`s —
  no N+1: service areas, base location, business and matched services ride
  along in the same query.
- Aggregates (rating summary, portfolio counts) are stored/denormalised —
  reviews are never loaded to rank.
- `DISCOVERY_CANDIDATE_CAP = 600` bounds compute per request; ranking and
  pagination happen after the cap, so pages 2+ rank consistently within a
  run. Documented upgrade path: move scoring into SQL (PostgreSQL window
  functions) or an index-backed materialised score when volumes grow.
- Existing Phase 2 indexes carry the queries: `provider_profiles(profession,
  verificationStatus, availabilityStatus, primaryLocationId)`,
  `provider_service_areas(locationId)`, `services(categoryId, status)`,
  `towns(regionId)`. No new query-path indexes were needed; the new
  `discovery_events` indexes serve analytics only.

## 14. Security & privacy (PART 33)

- Validation: strict Zod at the API (422 on unknown/malformed values); the
  page layer tolerantly degrades malformed links to defaults.
- Rate limiting: shared `search` preset (60/min/IP) on both endpoints; env-
  gated in development, on in production (`RATE_LIMIT_ENABLED`).
- Privacy: payloads contain no emails, phone numbers, raw coordinates,
  password hashes or audit data; reviewers display first names only;
  suspended providers 404 publicly.
- Errors are opaque envelope errors with request IDs; nothing internal leaks.

## 15. Future upgrade path

- PostgreSQL: `citext`/`pg_trgm` for `q`, per-token location search, and
  SQL-side ranking when candidate volumes exceed the cap.
- Availability becomes a schedule (Phase 5+) — `AVAILABILITY_SCORES` already
  maps the states.
- Real-time availability and response-time medians slot into the existing
  weight matrix without schema churn.
- `DiscoveryEvent` aggregates power Phase 5+ recommendations and
  search-quality tuning.
