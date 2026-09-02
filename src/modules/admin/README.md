# Module: Administration

Owns the staff back office: dashboard, user management, provider management,
marketplace management, verification queue, reports, system settings and the
audit-log viewer.

## Responsibilities
- Operational dashboards (users, listings, orders, disputes).
- User/provider management with escalation-proof role changes
  (`requireCanManageRole` guards every mutation).
- Marketplace-wide management: category tree, featured placements,
  moderation queues.
- System settings (key/value, change-audited, cache-invalidating).
- Audit-log browser over the `AuditLog` table.

## Design rules
- Every admin route is permission-checked server-side (`admin:*` domain for
  ADMIN, everything for SUPER_ADMIN) — the admin UI is never the gate.
- Destructive actions require explicit confirmation payloads and are audited
  with before/after metadata.
- Admin UI consumes the same public API contracts; no privileged backdoor
  endpoints.

## Planned API surface
- `GET /api/admin/overview`
- `GET/PATCH /api/admin/users` · `/api/admin/users/[id]`
- `GET /api/admin/audit-logs` · `GET/PATCH /api/admin/settings`

## Dependencies
All modules (read models), Identity (staff roles), Database.
