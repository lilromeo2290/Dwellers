# Module: Identity & Access

Owns authentication, accounts, roles, permissions, sessions and password
management.

## Responsibilities
- Account lifecycle: registration, email verification, login, logout,
  password reset, account suspension/deactivation (soft delete).
- Session issuance (NextAuth JWT strategy — see `src/lib/auth/session.ts`).
- Role assignment governed by `canManageRole()` — escalation-proof.
- Audit every security-relevant action via `src/lib/audit.ts`.

## Already in place (Phase 1)
- Role model and definitions (`src/lib/auth/roles.ts`)
- Permission catalog + matrix (`src/lib/auth/permissions.ts`)
- API guards (`src/lib/auth/guards.ts`)
- Password hashing (`src/lib/auth/password.ts`)
- `User` model with role/status/soft-delete columns

## Planned API surface (Phase 2+)
- `POST /api/auth/register` — customer/provider registration
- `POST /api/auth/login` · `POST /api/auth/logout` (NextAuth credentials)
- `POST /api/auth/password/forgot` · `POST /api/auth/password/reset`
- `GET /api/users/me` · `PATCH /api/users/me`
- `GET /api/admin/users` · `PATCH /api/admin/users/[id]/role` (staff)

## Dependencies
Database (`User`, `AuditLog`), rate limiter (auth preset), logger.
