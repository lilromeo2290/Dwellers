# Module: Discovery

Owns search, filtering, location browsing and recommendations across the
marketplace.

## Responsibilities
- Unified search over providers, services, products and equipment.
- Faceted filtering (category, price range, rating, verification status).
- Location-aware queries using the Region → City/Town → Area hierarchy.
- Later: personalised recommendations (search + behaviour signals).

## Design rules
- Reads are served from dedicated indexes/caches — never table scans.
- Search rate-limited with the `search` preset (expensive queries).
- All list endpoints use the shared pagination contract
  (`src/lib/api/pagination.ts`).

## Planned API surface
- `GET /api/search?type=&q=&region=&city=&category=&page=`
- `GET /api/locations/regions` · `/api/locations/regions/[id]/cities`

## Dependencies
Marketplace (indexed data), Database geo tables, cache (in-memory now).
