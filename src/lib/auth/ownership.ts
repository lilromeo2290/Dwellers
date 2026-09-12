/**
 * Dwellers — Resource ownership guard (IDOR defence).
 *
 * The mandatory pattern for EVERY domain mutation and private read:
 *
 *   1. LOAD the resource by id (service layer).
 *   2. VERIFY ownership/staff clearance via assertOwnership().
 *   3. PERFORM the action.
 *
 * Client-supplied user ids are never trusted — ownership always compares
 * against the server-resolved AuthContext (see src/lib/auth/session.ts).
 */
import { ForbiddenError, NotFoundError } from '@/lib/errors'
import type { AuthContext } from '@/lib/auth/session'
import { isStaff } from '@/lib/auth/roles'

/** Minimal shape a protectable resource must expose. */
export interface OwnableRecord {
  ownerId?: string | null
  userId?: string | null
}

/** True when the record's owner field matches the caller. */
export function isOwner(record: OwnableRecord | null | undefined, auth: AuthContext | null): boolean {
  if (!record || !auth) return false
  return record.ownerId === auth.userId || record.userId === auth.userId
}

export interface OwnershipOptions<T> {
  /** Staff roles (ADMIN/SUPER_ADMIN) may act on any record when true. */
  allowStaff?: boolean
  /**
   * Record fields that hold the owner's USER id. Defaults to `ownerId` and
   * `userId`. Records whose owner is indirect (e.g. a service owned by its
   * provider profile) are mapped to `{ userId }` objects by the caller.
   */
  ownerFields?: (keyof T)[]
}

/**
 * Throws 404 when the record does not exist (never 403 — existence of a
 * foreign resource is itself information), 403 when the caller is neither
 * owner nor cleared staff. Returns the record so TypeScript narrows it to
 * non-null after the call.
 */
export function assertOwnership<T extends object>(
  record: T | null | undefined,
  auth: AuthContext | null,
  options: OwnershipOptions<T> = {},
): T {
  if (!record) throw new NotFoundError()

  if (auth) {
    const defaultFields = ['ownerId', 'userId'] as (keyof T & string)[]
    const fields = (options.ownerFields ?? defaultFields) as (keyof T)[]
    const owned = fields.some((field) => record[field] === auth.userId)
    if (owned) return record

    if (options.allowStaff && isStaff(auth.role)) return record

    throw new ForbiddenError('You do not have permission to access this resource.')
  }

  // Unauthenticated callers learn nothing about existence of foreign data.
  throw new ForbiddenError('Please sign in to continue.')
}
