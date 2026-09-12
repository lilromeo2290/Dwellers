/**
 * Dwellers — Upload validation.
 *
 * Centralised policy for every upload category: allowed MIME types, size
 * ceilings, filename sanitisation and collision-free key generation.
 * EVERY upload endpoint must pass through validateUpload() — no exceptions.
 * This is the first gate against malicious uploads (type confusion,
 * oversized payloads, path traversal via filenames).
 */
import { randomUUID } from 'node:crypto'
import { BadRequestError, PayloadTooLargeError, UnsupportedMediaTypeError } from '@/lib/errors'
import type { StorageCategory } from '@/lib/storage/types'

interface UploadPolicy {
  label: string
  allowedMime: readonly string[]
  /** 5 MB default; documents and images tuned per category. */
  maxBytes: number
}

const MB = 1024 * 1024

export const UPLOAD_POLICIES: Record<StorageCategory, UploadPolicy> = {
  'profile-image': { label: 'Profile image', allowedMime: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 5 * MB },
  'business-logo': { label: 'Business logo', allowedMime: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 2 * MB },
  'product-image': { label: 'Product image', allowedMime: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 8 * MB },
  'portfolio-image': { label: 'Portfolio image', allowedMime: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 8 * MB },
  'project-image': { label: 'Project image', allowedMime: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 8 * MB },
  'document': { label: 'Document', allowedMime: ['application/pdf', 'image/jpeg', 'image/png'], maxBytes: 20 * MB },
  'quote-attachment': { label: 'Quotation attachment', allowedMime: ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], maxBytes: 10 * MB },
  'message-attachment': { label: 'Message attachment', allowedMime: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], maxBytes: 10 * MB },
}

export interface UploadCandidate {
  filename: string
  contentType: string
  size: number
}

export interface ValidatedUpload {
  category: StorageCategory
  /** Generated storage key — safe, unique, category-scoped, date-partitioned. */
  key: string
  sanitizedFilename: string
  contentType: string
  size: number
}

/**
 * MIME types never accepted from users. SVG is a stored-XSS vector: it can
 * carry <script> payloads that execute in the origin serving it. If SVG ever
 * becomes a legitimate need (e.g. admin-uploaded brand assets), it MUST be
 * sanitised server-side and served from a sandboxed origin — MIME checks
 * alone are never sufficient (content can lie about its type).
 */
const BLOCKED_MIME = new Set(['image/svg+xml'])

/** Strips directories and dangerous characters; keeps a human-readable stem. */
export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? 'file'
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120)
  return cleaned || 'file'
}

function extensionOf(filename: string): string {
  const parts = filename.split('.')
  const ext = parts.length > 1 ? `.${parts.pop()!.toLowerCase().slice(0, 10)}` : ''
  return /^[a-z0-9.]+$/.test(ext) ? ext : ''
}

/**
 * Validates an upload candidate against its category policy and produces the
 * storage key. Content-type sniffing from magic bytes happens in the upload
 * route (Phase 2) — this layer enforces declared type + size + naming.
 */
export function validateUpload(
  category: StorageCategory,
  candidate: UploadCandidate,
): ValidatedUpload {
  const policy = UPLOAD_POLICIES[category]

  if (candidate.size <= 0) {
    throw new BadRequestError(`${policy.label} is empty.`)
  }
  if (candidate.size > policy.maxBytes) {
    throw new PayloadTooLargeError(policy.maxBytes)
  }
  if (BLOCKED_MIME.has(candidate.contentType)) {
    throw new UnsupportedMediaTypeError(
      `${policy.label} cannot be SVG. Use PNG, JPEG or WEBP.`,
    )
  }
  if (!policy.allowedMime.includes(candidate.contentType)) {
    throw new UnsupportedMediaTypeError(
      `${policy.label} must be one of: ${policy.allowedMime.join(', ')}.`,
    )
  }

  const sanitizedFilename = sanitizeFilename(candidate.filename)
  const ext = extensionOf(sanitizedFilename)
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')

  return {
    category,
    key: `${category}/${year}/${month}/${randomUUID()}${ext}`,
    sanitizedFilename,
    contentType: candidate.contentType,
    size: candidate.size,
  }
}
