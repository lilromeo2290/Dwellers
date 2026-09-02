/**
 * Dwellers — Permission catalog and role→permission matrix.
 *
 * Authorization is enforced at the API layer through `hasPermission` — the UI
 * merely reflects decisions made here. Format: `"<domain>:<action>"`.
 *
 * Principles:
 *  - Explicit matrix: a role has exactly the permissions listed (plus wildcard
 *    matches); nothing is inferred from "hiding buttons".
 *  - Wildcards: `*` grants everything (SUPER_ADMIN only); `domain:*` grants a
 *    whole domain (used for ADMIN staff convenience).
 *  - Ownership checks (IDOR defence) are separate: `hasPermission` answers
 *    "can this role do X at all"; resource-level ownership is verified in the
 *    module services that load the resource (Phase 2+ pattern:
 *    load → verify owner/staff → act).
 */

export const PERMISSION_DOMAINS = [
  'identity',
  'marketplace',
  'discovery',
  'projects',
  'communication',
  'commerce',
  'trust',
  'admin',
] as const

export type PermissionDomain = (typeof PERMISSION_DOMAINS)[number]

/** Wildcard form `"<domain>:*"` or the global `"*"`. */
export type Permission = string

// -----------------------------------------------------------------------------
// Catalog — every permission the platform will ever check, documented once.
// Phase 1 defines the map; phases that implement features start USING entries.
// -----------------------------------------------------------------------------

export const PERMISSIONS = {
  // Identity & access ---------------------------------------------------------
  'identity:profile:read': 'Read a user profile',
  'identity:profile:update': 'Update own profile',
  'identity:users:manage': 'Manage platform users (staff)',
  'identity:roles:assign': 'Assign roles to accounts (staff)',
  'identity:sessions:revoke': 'Revoke sessions (staff)',

  // Marketplace ---------------------------------------------------------------
  'marketplace:services:create': 'Publish a service listing (providers)',
  'marketplace:services:manage': 'Manage own service listings',
  'marketplace:products:create': 'Publish a product listing (suppliers)',
  'marketplace:products:manage': 'Manage own product inventory',
  'marketplace:equipment:create': 'Publish equipment listings (equipment providers)',
  'marketplace:equipment:manage': 'Manage own equipment and availability',
  'marketplace:business:manage': 'Manage own business/company profile',
  'marketplace:team:manage': 'Manage company team members',
  'marketplace:portfolio:manage': 'Manage own portfolio gallery',
  'marketplace:leads:receive': 'Receive and manage customer leads',

  // Discovery -----------------------------------------------------------------
  'discovery:search': 'Search providers, services, products and equipment',
  'discovery:locations:browse': 'Browse by region, city, town or area',

  // Projects ------------------------------------------------------------------
  'projects:create': 'Create projects',
  'projects:manage': 'Manage own projects, tasks and milestones',
  'projects:budget:manage': 'Manage project budgets',
  'projects:documents:manage': 'Upload and manage project documents',
  'projects:progress:report': 'Report progress on assigned work',

  // Communication -------------------------------------------------------------
  'communication:messages:send': 'Send direct messages and attachments',
  'communication:conversations:read': 'Read own conversations',
  'communication:notifications:read': 'Read own notifications',

  // Commerce ------------------------------------------------------------------
  'commerce:quotes:request': 'Request quotations',
  'commerce:quotes:submit': 'Submit quotations (providers)',
  'commerce:quotes:respond': 'Accept or decline received quotations',
  'commerce:orders:create': 'Place orders',
  'commerce:orders:manage': 'Manage own orders and fulfilment',
  'commerce:cart:manage': 'Manage own cart',
  'commerce:payments:pay': 'Pay for orders (customer side)',
  'commerce:payments:receive': 'Receive settlements (provider side)',

  // Trust ---------------------------------------------------------------------
  'trust:reviews:create': 'Review providers after engagement',
  'trust:reviews:moderate': 'Moderate reviews and ratings (staff)',
  'trust:verification:request': 'Submit verification documents',
  'trust:verification:decide': 'Approve or reject verification (staff)',
  'trust:reports:file': 'Report abuse or bad actors',
  'trust:reports:resolve': 'Resolve reports (staff)',

  // Administration ------------------------------------------------------------
  'admin:dashboard:view': 'View admin dashboard',
  'admin:users:manage': 'User management screens',
  'admin:providers:manage': 'Provider management screens',
  'admin:marketplace:manage': 'Marketplace-wide management (categories, moderation)',
  'admin:reports:view': 'View platform reports and analytics',
  'admin:settings:manage': 'Change system settings',
  'admin:audit:view': 'View audit logs',
} as const satisfies Record<string, string>

export type PermissionKey = keyof typeof PERMISSIONS

// -----------------------------------------------------------------------------
// Role matrix
// -----------------------------------------------------------------------------

/** Permissions shared by every authenticated account. */
export const BASE_PERMISSIONS: PermissionKey[] = [
  'identity:profile:read',
  'identity:profile:update',
  'discovery:search',
  'discovery:locations:browse',
  'communication:messages:send',
  'communication:conversations:read',
  'communication:notifications:read',
  'trust:reports:file',
]

export const ROLE_PERMISSIONS: Record<Role, readonly (PermissionKey | Permission)[]> = {
  CUSTOMER: [
    ...BASE_PERMISSIONS,
    'projects:create',
    'projects:manage',
    'projects:budget:manage',
    'projects:documents:manage',
    'commerce:quotes:request',
    'commerce:quotes:respond',
    'commerce:orders:create',
    'commerce:cart:manage',
    'commerce:payments:pay',
    'trust:reviews:create',
  ],

  ARTISAN: [
    ...BASE_PERMISSIONS,
    'marketplace:services:create',
    'marketplace:services:manage',
    'marketplace:portfolio:manage',
    'marketplace:leads:receive',
    'projects:manage',
    'projects:progress:report',
    'projects:documents:manage',
    'commerce:quotes:submit',
    'commerce:orders:manage',
    'trust:verification:request',
  ],

  CONTRACTOR: [
    ...BASE_PERMISSIONS,
    'marketplace:services:create',
    'marketplace:services:manage',
    'marketplace:portfolio:manage',
    'marketplace:leads:receive',
    'marketplace:team:manage',
    'projects:manage',
    'projects:progress:report',
    'projects:documents:manage',
    'commerce:quotes:submit',
    'commerce:orders:manage',
    'trust:verification:request',
  ],

  CONSTRUCTION_COMPANY: [
    ...BASE_PERMISSIONS,
    'marketplace:services:create',
    'marketplace:services:manage',
    'marketplace:portfolio:manage',
    'marketplace:leads:receive',
    'marketplace:business:manage',
    'marketplace:team:manage',
    'projects:manage',
    'projects:progress:report',
    'projects:documents:manage',
    'commerce:quotes:submit',
    'commerce:orders:manage',
    'trust:verification:request',
  ],

  SUPPLIER: [
    ...BASE_PERMISSIONS,
    'marketplace:products:create',
    'marketplace:products:manage',
    'marketplace:business:manage',
    'marketplace:team:manage',
    'commerce:orders:manage',
    'trust:verification:request',
  ],

  EQUIPMENT_PROVIDER: [
    ...BASE_PERMISSIONS,
    'marketplace:equipment:create',
    'marketplace:equipment:manage',
    'marketplace:business:manage',
    'commerce:orders:manage',
    'trust:verification:request',
  ],

  ADMIN: [
    ...BASE_PERMISSIONS,
    'identity:users:manage',
    'identity:sessions:revoke',
    'trust:reviews:moderate',
    'trust:verification:decide',
    'trust:reports:resolve',
    'admin:*',
  ],

  SUPER_ADMIN: ['*'],
}

// -----------------------------------------------------------------------------
// Evaluation engine (pure functions — unit-testable, no I/O)
// -----------------------------------------------------------------------------

function matchesWildcard(granted: string, requested: string): boolean {
  if (granted === '*') return true
  if (granted === requested) return true
  if (granted.endsWith(':*')) {
    return requested.startsWith(granted.slice(0, -1))
  }
  return false
}

/** True when the role's matrix grants `requested` (wildcard-aware). */
export function hasPermission(role: Role, requested: Permission): boolean {
  const granted = ROLE_PERMISSIONS[role]
  return granted.some((entry) => matchesWildcard(entry, requested))
}

/** True when the role holds ALL of the requested permissions. */
export function hasAllPermissions(role: Role, requested: Permission[]): boolean {
  return requested.every((permission) => hasPermission(role, permission))
}

/** True when the role holds ANY of the requested permissions. */
export function hasAnyPermission(role: Role, requested: Permission[]): boolean {
  return requested.some((permission) => hasPermission(role, permission))
}

/** Resolves the effective permission list for a role (wildcards expanded). */
export function resolveEffectivePermissions(role: Role): Permission[] {
  if (hasPermission(role, '*')) return Object.keys(PERMISSIONS)
  return Object.keys(PERMISSIONS).filter((permission) =>
    hasPermission(role, permission),
  )
}
