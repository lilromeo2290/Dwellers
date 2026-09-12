/**
 * Dwellers — Single job-request attachment (Phase 5, PART 12/48/49).
 *   GET    — stream the stored photo to authorized parties only
 *            (owning customer, targeted provider side, staff). Storage keys
 *            are never exposed and the bytes never leave the auth boundary.
 *   DELETE — the owning customer removes a photo while the request is still
 *            editable (pre-provider-response), with a real timeline event.
 */
import { NextResponse } from 'next/server'
import { createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { logger } from '@/lib/logger'
import { NotFoundError } from '@/lib/errors'
import { getStorage } from '@/lib/storage'
import { z } from 'zod'
import {
  getJobRequestAttachmentForViewing,
  removeJobRequestAttachment,
} from '@/modules/projects/job-request-service'

const idSchema = z.string().min(1)

export const GET = createHandler({ auth: 'required' }, async ({ auth, params }) => {
  const requestId = idSchema.parse(params.id)
  const attachmentId = idSchema.parse(params.attachmentId)

  const attachment = await getJobRequestAttachmentForViewing(auth, requestId, attachmentId)
  const storage = getStorage()
  if (!(await storage.exists(attachment.storageKey))) {
    throw new NotFoundError('Attachment file')
  }

  const binary = storage.stream(attachment.storageKey)
  // NextResponse (not bare Response) so the handler factory passes the
  // binary stream straight through instead of wrapping it in the JSON envelope.
  return new NextResponse(binary as unknown as ReadableStream, {
    headers: {
      'Content-Type': attachment.mimeType ?? 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent(attachment.originalName ?? 'photo')}"`,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

export const DELETE = createHandler({ auth: 'required' }, async ({ auth, params }) => {
  const requestId = idSchema.parse(params.id)
  const attachmentId = idSchema.parse(params.attachmentId)

  const removed = await removeJobRequestAttachment(auth, requestId, attachmentId)
  // Best-effort binary cleanup — the DB row is already gone atomically.
  try {
    await getStorage().delete(removed.storageKey)
  } catch (error) {
    logger.warn('Attachment binary cleanup failed', { storageKey: removed.storageKey, error })
  }
  return jsonOk({ id: removed.id, deleted: true })
})
