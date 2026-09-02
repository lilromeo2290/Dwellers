# Module: Trust

Owns verification, reviews, ratings and abuse reporting — the reputation
layer that makes a marketplace safe.

## Responsibilities
- Provider verification workflow: document submission → admin review →
  badge decision (all transitions audited).
- Reviews + ratings on providers, restricted to customers with a real
  completed engagement (order/project linkage enforced server-side).
- Review moderation (staff can hide/remove abusive content, decisions audited).
- Abuse reports from any user with resolution workflow for staff.

## Design rules
- Ratings aggregates are derived (avg/count) and cached; never stored
  denormalised without a recompute path.
- Review authorship is immutable; edits create a new version.
- Report resolution actions require staff permissions and are audited.

## Planned API surface
- `POST /api/verification/submit` (provider) · `GET /api/admin/verification` (staff)
- `GET/POST /api/reviews` · `PATCH /api/admin/reviews/[id]`
- `POST /api/reports` · `GET/PATCH /api/admin/reports`

## Dependencies
Identity, Marketplace, Commerce (engagement proof), Database.
