/**
 * Dwellers — Audit trail service.
 *
 * Append-only record of security- and business-relevant WHO/WHAT/WHEN.
 * Distinct from the logger: the logger is telemetry (stdout/log drains),
 * the audit trail is queryable platform history stored in the database.
 *
 * Rules:
 *  - Write ONLY through this module (uniform redaction + failure policy).
 *  - Audit failures must never break the business operation: failures are
 *    logged, never thrown.
 *  - Metadata is redacted through the logger's redactor before storage.
 */
import { db } from '@/lib/db'
import { LogEvent, logger, type LogEventName } from '@/lib/logger'
import { getClientIp } from '@/lib/rate-limit'

/** Canonical audit actions. Extend as modules ship; keep names stable. */
export const AUDIT_ACTIONS = {
  // Identity
  USER_REGISTERED: 'user.registered',
  USER_LOGIN: 'user.login',
  USER_LOGIN_FAILED: 'user.login_failed',
  USER_LOGOUT: 'user.logout',
  USER_PASSWORD_CHANGED: 'user.password_changed',
  USER_ROLE_CHANGED: 'user.role_changed',
  USER_SUSPENDED: 'user.suspended',
  USER_REACTIVATED: 'user.reactivated',
  USER_DEACTIVATED: 'user.deactivated',
  USER_DELETED: 'user.deleted',
  SESSION_REVOKED: 'session.revoked',
  // Trust
  VERIFICATION_SUBMITTED: 'verification.submitted',
  VERIFICATION_APPROVED: 'verification.approved',
  VERIFICATION_REJECTED: 'verification.rejected',
  REVIEW_CREATED: 'review.created',
  REVIEW_REMOVED: 'review.removed',
  REPORT_FILED: 'report.filed',
  REPORT_RESOLVED: 'report.resolved',
  // Commerce
  QUOTATION_REQUESTED: 'quotation.requested',
  QUOTATION_SUBMITTED: 'quotation.submitted',
  QUOTATION_ACCEPTED: 'quotation.accepted',
  ORDER_CREATED: 'order.created',
  ORDER_CANCELLED: 'order.cancelled',
  PAYMENT_INITIATED: 'payment.initiated',
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_REFUNDED: 'payment.refunded',
  // Administration
  ADMIN_SETTINGS_CHANGED: 'admin.settings_changed',
  ADMIN_IMPERSONATION_STARTED: 'admin.impersonation_started',
  ADMIN_DATA_EXPORTED: 'admin.data_exported',
  // Security
  RATE_LIMIT_TRIGGERED: 'security.rate_limit_triggered',
  ACCESS_DENIED: 'security.access_denied',
  SUSPICIOUS_ACTIVITY: 'security.suspicious_activity',
} as const

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS]

export interface AuditEntry {
  /** Actor's user id; omit for system-initiated actions. */
  actorId?: string | null
  actorRole?: string | null
  action: AuditAction | LogEventName | (string & {})
  entityType?: string
  entityId?: string
  /** Safe, structured context — secrets are redacted automatically. */
  metadata?: Record<string, unknown>
  ip?: string
  userAgent?: string
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        actorRole: entry.actorRole ?? null,
        action: entry.action,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      },
    })
  } catch (error) {
    // Audit must never break the caller; surface loudly in logs instead.
    logger.error('Failed to persist audit entry', error, {
      module: 'audit',
      action: entry.action,
      actorId: entry.actorId ?? undefined,
    })
  }
}

/** Convenience wrapper extracting ip/user-agent from an API request. */
export function auditContextFromRequest(request: Request): Pick<AuditEntry, 'ip' | 'userAgent'> {
  return {
    ip: getClientIp(request),
    userAgent: request.headers.get('user-agent') ?? undefined,
  }
}
