/**
 * Dwellers — API authorization guards.
 *
 * Used exclusively inside route handlers (via createHandler or directly).
 * These functions convert session data into hard authorization decisions and
 * throw typed errors that the API layer translates into 401/403 responses.
 * Nothing here ever trusts client-supplied identity or role.
 */
import { ForbiddenError, UnauthorizedError } from '@/lib/errors'
import type { AuthContext } from '@/lib/auth/session'
import { hasAllPermissions, hasPermission, hasAnyPermission } from '@/lib/auth/permissions'
import type { Permission } from '@/lib/auth/permissions'
import { canManageRole } from '@/lib/auth/roles'
import { LogEvent, logger } from '@/lib/logger'

/** Throws 401 unless a session exists. */
export function requireAuth(auth: AuthContext | null): AuthContext {
  if (!auth) throw new UnauthorizedError()
  return auth
}

/** Throws 403 unless the caller's role grants the permission. */
export function requirePermission(
  auth: AuthContext | null,
  permission: Permission,
): AuthContext {
  const context = requireAuth(auth)
  if (!hasPermission(context.role, permission)) {
    logger.warn('Authorization denied: missing permission', {
      module: 'auth',
      event: LogEvent.ACCESS_DENIED,
      actorId: context.userId,
      role: context.role,
      permission,
    })
    throw new ForbiddenError()
  }
  return context
}

/** Throws 403 unless the caller's role grants ALL permissions. */
export function requireAllPermissions(
  auth: AuthContext | null,
  permissions: Permission[],
): AuthContext {
  const context = requireAuth(auth)
  if (!hasAllPermissions(context.role, permissions)) {
    logger.warn('Authorization denied: missing permissions', {
      module: 'auth',
      event: LogEvent.ACCESS_DENIED,
      actorId: context.userId,
      role: context.role,
      permissions,
    })
    throw new ForbiddenError()
  }
  return context
}

/** Throws 403 unless the caller's role grants ANY of the permissions. */
export function requireAnyPermission(
  auth: AuthContext | null,
  permissions: Permission[],
): AuthContext {
  const context = requireAuth(auth)
  if (!hasAnyPermission(context.role, permissions)) {
    logger.warn('Authorization denied: missing any-of permissions', {
      module: 'auth',
      event: LogEvent.ACCESS_DENIED,
      actorId: context.userId,
      role: context.role,
      permissions,
    })
    throw new ForbiddenError()
  }
  return context
}

/**
 * Role-management escalation check: `actor` may manage `targetRole` accounts
 * only per canManageRole(). Call this on every role-changing or staff-level
 * account mutation IN ADDITION to permission checks.
 */
export function requireCanManageRole(
  auth: AuthContext | null,
  targetRole: Parameters<typeof canManageRole>[1],
): AuthContext {
  const context = requireAuth(auth)
  if (!canManageRole(context.role, targetRole)) {
    logger.warn('Authorization denied: role management escalation blocked', {
      module: 'auth',
      event: LogEvent.SECURITY_EVENT,
      actorId: context.userId,
      actorRole: context.role,
      targetRole,
    })
    throw new ForbiddenError('You cannot manage accounts at this level.')
  }
  return context
}
