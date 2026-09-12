/**
 * Dwellers — Own avatar upload (PART 25).
 *   POST /api/users/me/avatar — multipart form, field "file"
 *
 * Uses the existing storage abstraction with the 'profile-image' policy
 * (JPEG/PNG/WEBP, 5 MB, SVG explicitly blocked). The storage key is stored on
 * the caller's OWN account — the id comes from the session, never the form.
 */
import { createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { BadRequestError } from '@/lib/errors'
import { getStorage } from '@/lib/storage'
import { validateUpload } from '@/lib/storage/validation'
import { db } from '@/lib/db'
import { AUDIT_ACTIONS, recordAudit } from '@/lib/audit'
import { requireAuth } from '@/lib/auth/guards'
import { env } from '@/lib/env'

export const POST = createHandler({ auth: 'required', rateLimit: 'standard' }, async ({ auth, request }) => {
  const context = requireAuth(auth)

  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    throw new BadRequestError('Upload must be multipart/form-data with a "file" field.')
  }

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    throw new BadRequestError('Missing "file" field.')
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const validated = validateUpload('profile-image', {
    filename: file.name || 'avatar',
    contentType: file.type || 'application/octet-stream',
    size: buffer.length,
  })

  const storage = getStorage()
  const stored = await storage.put(validated.key, buffer, validated.contentType)

  // Delete the previous avatar object when it is being replaced.
  const existing = await db.user.findUnique({
    where: { id: context.userId },
    select: { avatarKey: true },
  })
  if (existing?.avatarKey && existing.avatarKey !== stored.key) {
    await storage.delete(existing.avatarKey).catch(() => undefined)
  }

  await db.user.update({
    where: { id: context.userId },
    data: { avatarKey: stored.key },
    select: { id: true },
  })

  await recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.USER_PROFILE_UPDATED,
    entityType: 'User',
    entityId: context.userId,
    metadata: { field: 'avatarKey' },
  })

  const base = env.STORAGE_PUBLIC_URL
  return jsonOk({
    avatarKey: stored.key,
    url: base ? `${base.replace(/\/$/, '')}/${stored.key}` : null,
  })
})
