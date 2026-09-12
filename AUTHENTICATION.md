# DWELLERS — Authentication & Access Guide

Phase 3 scope: registration, login, sessions, roles, onboarding, profile
ownership, dashboards. Everything here is enforced SERVER-SIDE — the UI only
reflects decisions the server has already made.

## 1. Architecture at a glance

```
Browser ──▶ NextAuth v4 route (/api/auth/[...nextauth])
                │  credentials provider → authenticateDwellersUser()
                │  JWT carries: userId, role, status
                ▼
Server components / route handlers
                │  getAuthContext()  (the ONLY identity source)
                ▼
Handler factory ─ rate limit → auth → LIVE status check → RBAC → zod → service
Page guards    ─ session → LIVE status+role check → redirect
Services       ─ load → verify owner/staff → act (ownership guard)
```

- **Session strategy**: stateless JWT (7-day max age). No session table.
- **Claims**: `userId`, `role`, `status` — captured at sign-in from the
  database, never from the client.
- **Secret**: `AUTH_SECRET` (required in staging/production; see `.env.example`).

## 2. Registration

`POST /api/auth/register` — public, strict rate limit (10/min/IP).

Registration is **path-based**. The client submits one of six journeys and the
server maps path → role (`PATH_ROLE_MAP` in
`src/modules/identity/auth-service.ts`):

| Path        | Role                  | Records created (one transaction)                                    |
| ----------- | --------------------- | -------------------------------------------------------------------- |
| `customer`  | `CUSTOMER`            | User + PersonalProfile                                               |
| `artisan`   | `ARTISAN`             | User + PersonalProfile + ProviderProfile + ProviderServiceArea(s)    |
| `contractor`| `CONTRACTOR`          | same as artisan                                                      |
| `company`   | `CONSTRUCTION_COMPANY`| User + PersonalProfile + Business + BusinessMember(OWNER) + ProviderProfile(business) + BusinessServiceArea(s) |
| `supplier`  | `SUPPLIER`            | same as company (businessType `SUPPLIER`)                            |
| `equipment` | `EQUIPMENT_PROVIDER`  | Business only when a business name is supplied (businessType `EQUIPMENT_RENTAL`) |

Security properties:

- The request body has **no role field**. `ADMIN` / `SUPER_ADMIN` are
  unreachable by construction (zod enum rejects; service double-checks and
  audits blocked attempts).
- Passwords: minimum 8 characters with upper + lower + digit; hashed with the
  existing scrypt utility; never logged; never returned by any API.
- Phones: Ghana format only (`0XXXXXXXXX` / `+233…`), stored canonically
  normalised (`+233…`).
- Emails: lower-cased/trimmed before uniqueness; duplicates return ONE generic
  conflict message for email OR phone (anti-enumeration).
- Registration does NOT verify anyone: providers start `UNVERIFIED`
  (PART 28 — verification is an administrative trust workflow).

After a successful registration the client immediately signs in via the
credentials provider, then lands on `/dashboard`.

## 3. Login & logout

- `POST /api/auth/callback/credentials` (NextAuth) — identifier accepts the
  **email or the Ghana phone**. Rate limited at 10/min/IP.
- Outcomes are server-decided codes the login page maps to friendly copy:
  - `CredentialsSignin` → "Email/phone or password is incorrect."
  - `ACCOUNT_SUSPENDED` / `ACCOUNT_DEACTIVATED` → account-state message.
  - `RATE_LIMITED` → slow-down message (429 before NextAuth sees the request).
- Success: `lastLoginAt` updated, `user.login` audit event.
- Failure: `user.login_failed` audit event (reason recorded, secrets never).
- Logout: NextAuth sign-out clears the cookie; the server `signOut` event
  writes the `user.logout` audit event.
- Password reset: **deferred** (needs a delivery channel — see §9).

## 4. Sessions & authorization

- Route handlers resolve identity ONLY through `getAuthContext()`.
- **Live status re-check**: every authenticated request through the handler
  factory re-reads the account row (one indexed PK select). Suspension or
  deactivation takes effect on the very next request — never merely hidden in
  the UI.
- Dashboard pages use `requireDashboardPage()` (`src/lib/auth/page-guards.ts`):
  session → live DB status/role → redirect to sign-in or `/403`.
- RBAC stays the explicit Phase 1 matrix (`permissions.ts`); role escalation
  defences (`canManageRole`) are untouched.
- `/dashboard` redirects by role read from the live database (PART 31).

## 5. Ownership (IDOR defence)

Self-service endpoints are session-scoped — no user id travels in any payload:

- `PATCH /api/users/me` — own account only
- `PATCH /api/users/me/password` — verifies current password server-side
- `PUT /api/providers/me/service-areas` — replaces OWN areas
- `PUT /api/businesses/me/service-areas` — the caller's OWNED business
- `POST /api/notifications/read` — foreign ids → 404, never 200

The Phase 2 pattern (LOAD → VERIFY → ACT via `assertOwnership`) is unchanged.

## 6. Dashboards

| Route        | Roles                 | Notes                                                       |
| ------------ | --------------------- | ----------------------------------------------------------- |
| `/customer`  | CUSTOMER              | completion widget, later-phase placeholders                  |
| `/artisan`   | ARTISAN               | verification banner, real services/service areas             |
| `/contractor`| CONTRACTOR            | same as artisan                                              |
| `/company`   | CONSTRUCTION_COMPANY  | business profile, owner membership                           |
| `/supplier`  | SUPPLIER              | business profile + delivery preference                       |
| `/equipment` | EQUIPMENT_PROVIDER    | business optional (PART 9)                                   |
| `/admin`     | ADMIN, SUPER_ADMIN    | stats, user table, audit log (staff only)                    |

Later-phase modules appear as honest "Coming soon" placeholders — no fake
functionality.

## 7. Notifications (in-app only)

`NOTIFICATION_TYPES`: `ACCOUNT_WELCOME`, `PROFILE_COMPLETION`,
`VERIFICATION_STATUS`, `ACCOUNT_SECURITY`. No SMS/WhatsApp/email dispatch
exists in this phase; the schema (channel, sentAt) is ready for later phases.

## 8. Audit events

`user.registered`, `user.login`, `user.login_failed`, `user.logout`,
`user.password_changed`, `user.profile_updated` (+ Phase 2 actions for
provider/business changes). Passwords and secrets are never logged — the
logger's redactor runs on audit metadata too.

## 9. Known limitations (deliberate)

- **Session revocation after password change**: stateless JWTs stay valid
  until expiry. Immediate revocation requires a token-version column or
  session table — prepared for a later phase (PART 42 defers it explicitly).
- **Password reset**: requires email/SMS delivery; honest placeholder page for
  now.
- **Mid-session role changes**: dashboards re-check the live record on every
  navigation; API routes re-check status live, role claims refresh on next
  token issuance.
- **BusinessMember granularity**: Phase 3 covers the OWNER; member-scoped
  permissions arrive with the team phase.

## 10. Demo accounts (development only)

The seed creates `@demo.dwellers.test` accounts with password `Demo#Passw0rd`,
all flagged `isSeedData=true` and never `VERIFIED`. Never expose these in
production (seeding is a manual step, not part of deploy).
