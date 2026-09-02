/**
 * Dwellers — Role definitions.
 *
 * Eight initial roles. Roles are stored as plain strings in the database
 * (SQLite/Prisma has no native enums) and validated through this module —
 * `Role` is the single source of truth. Never compare raw strings; use the
 * helpers exported here.
 *
 * `level` expresses trust ordering (higher manages lower). It is used ONLY to
 * prevent horizontal/vertical privilege escalation (see canManageRole) —
 * permissions themselves always come from the explicit matrix in
 * permissions.ts, never from level arithmetic.
 */

export const ROLES = [
  'CUSTOMER',
  'ARTISAN',
  'CONTRACTOR',
  'CONSTRUCTION_COMPANY',
  'SUPPLIER',
  'EQUIPMENT_PROVIDER',
  'ADMIN',
  'SUPER_ADMIN',
] as const

export type Role = (typeof ROLES)[number]

export interface RoleDefinition {
  value: Role
  label: string
  description: string
  level: number
  /** Provider-side roles can offer services/products on the marketplace. */
  isProvider: boolean
  /** Platform staff roles. */
  isStaff: boolean
}

export const ROLE_DEFINITIONS: Record<Role, RoleDefinition> = {
  CUSTOMER: {
    value: 'CUSTOMER',
    label: 'Customer',
    description:
      'Individuals building, renovating, maintaining or improving property. Discovers providers, requests quotations, creates projects, places orders and leaves reviews.',
    level: 10,
    isProvider: false,
    isStaff: false,
  },
  ARTISAN: {
    value: 'ARTISAN',
    label: 'Artisan',
    description:
      'Skilled trades professional (mason, electrician, plumber, welder…). Publishes a professional profile and services, receives leads, submits quotations and manages assigned work.',
    level: 20,
    isProvider: true,
    isStaff: false,
  },
  CONTRACTOR: {
    value: 'CONTRACTOR',
    label: 'Contractor',
    description:
      'Independent contractor. Same marketplace capabilities as an artisan plus project and team management for larger engagements.',
    level: 25,
    isProvider: true,
    isStaff: false,
  },
  CONSTRUCTION_COMPANY: {
    value: 'CONSTRUCTION_COMPANY',
    label: 'Construction Company',
    description:
      'Registered company account. Manages a company profile, team members, services, leads, quotations, portfolio and client relationships.',
    level: 30,
    isProvider: true,
    isStaff: false,
  },
  SUPPLIER: {
    value: 'SUPPLIER',
    label: 'Supplier',
    description:
      'Building-material merchant. Manages product catalogue, inventory, pricing, customer orders and fulfilment.',
    level: 30,
    isProvider: true,
    isStaff: false,
  },
  EQUIPMENT_PROVIDER: {
    value: 'EQUIPMENT_PROVIDER',
    label: 'Equipment Provider',
    description:
      'Equipment owner or rental company. Lists equipment with rental rates and availability, and handles rental requests.',
    level: 30,
    isProvider: true,
    isStaff: false,
  },
  ADMIN: {
    value: 'ADMIN',
    label: 'Administrator',
    description:
      'Platform staff. Operates the marketplace: user and provider management, verification, moderation, reports and system settings.',
    level: 90,
    isProvider: false,
    isStaff: true,
  },
  SUPER_ADMIN: {
    value: 'SUPER_ADMIN',
    label: 'Super Administrator',
    description:
      'Full system-level control, including role assignment, permission changes and destructive administrative operations.',
    level: 100,
    isProvider: false,
    isStaff: true,
  },
}

export const DEFAULT_ROLE: Role = 'CUSTOMER'

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

export function parseRole(value: unknown): Role {
  if (isRole(value)) return value
  throw new Error(`Unknown role: ${String(value)}`)
}

export function getRoleDefinition(role: Role): RoleDefinition {
  return ROLE_DEFINITIONS[role]
}

export function isStaff(role: Role): boolean {
  return ROLE_DEFINITIONS[role].isStaff
}

export function isProviderRole(role: Role): boolean {
  return ROLE_DEFINITIONS[role].isProvider
}

/**
 * Decides whether `actor` is allowed to act on accounts holding `target`.
 * Rules (enforced at the API layer, never in the UI):
 *  - Only staff roles manage other accounts' roles at all.
 *  - Nobody manages an account at an equal or higher trust level —
 *    an ADMIN cannot touch SUPER_ADMIN accounts, and cannot elevate
 *    anyone to SUPER_ADMIN.
 *  - SUPER_ADMIN is required to create or modify SUPER_ADMIN access.
 */
export function canManageRole(actor: Role | null, target: Role): boolean {
  if (!actor) return false
  if (actor === 'SUPER_ADMIN') return true
  if (target === 'SUPER_ADMIN') return false
  const actorDef = ROLE_DEFINITIONS[actor]
  const targetDef = ROLE_DEFINITIONS[target]
  if (!actorDef.isStaff) return false
  return actorDef.level > targetDef.level
}

/** Roles an actor may assign when managing another account. */
export function assignableRoles(actor: Role): Role[] {
  if (!ROLE_DEFINITIONS[actor].isStaff) return []
  return ROLES.filter((role) => canManageRole(actor, role))
}
