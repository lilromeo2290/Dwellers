# Module: Marketplace

Owns the supply side of the platform: categories, service listings, product
listings, equipment listings, provider profiles and business profiles.

## Responsibilities
- Category taxonomy (shared by services, products and equipment).
- Listing lifecycle per provider type:
  - Artisan/Contractor/Company → services
  - Supplier → products (inventory, pricing)
  - Equipment Provider → equipment (rental rates, availability windows)
- Business profiles with team management for company accounts.
- Portfolio galleries for visual work.
- Lead distribution to relevant providers.

## Design rules
- Every listing belongs to exactly one provider account and one category.
- All money fields are integer pesewas (`src/lib/finance.ts`).
- Geo scoping through the location hierarchy — never hard-code cities.
- Ownership verified in the service layer before any mutation (IDOR).

## Planned API surface
- `GET/POST/PATCH/DELETE /api/categories` (admin-managed)
- `GET/POST/PATCH/DELETE /api/services` · `/api/products` · `/api/equipment`
- `GET/POST/PATCH /api/providers` · `/api/businesses`

## Dependencies
Identity (provider roles), Database, Storage (images), Discovery (indexing).
