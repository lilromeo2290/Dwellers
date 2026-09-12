/**
 * Dwellers — Job-request photo upload (Phase 5, PART 11–14).
 *   POST /api/job-requests/[id]/attachments — multipart form, field "file".
 *
 * Uses the EXISTING storage abstraction with the 'job-attachment' policy
 * (JPEG/PNG/WEBP, 10 MB, SVG explicitly blocked) — no second storage system.
 * The attachment row is created for the CALLER'S OWN request, through the
 * same ownership guard as every other request mutation (PART 48).
 */
import { createHandler } from '@/lib/api/handler'
import { jsonCreated } from '@/lib/api/response'
import { BadRequestError, PayloadTooLargeError } from '@/lib/errors'
import { getStorage } from '@/lib/storage'
import { UPLOAD_POLICIES, validateUpload } from '@/lib/storage/validation'
import { recordJobRequestAttachment } from '@/modules/projects/job-request-service'
import { z } from 'zod'

const idSchema = z.string().min(1)

export const POST = createHandler(
  { auth: 'required', permission: 'projects:create', rateLimit: 'upload' },
  async ({ auth, request, params }) => {
    const requestId = idSchema.parse(params.id)

    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      throw new BadRequestError('Upload must be multipart/form-data with a "file" field.')
    }

    // Next caps request bodies (10 MB in development). An oversized upload
    // makes formData() throw — surfaced as an honest 413/400, never a 500.
    let form: FormData
    try {
      form = await request.formData()
    } catch (error) {
      const contentLength = Number(request.headers.get('content-length') ?? '0')
      const maxBytes = UPLOAD_POLICIES['job-attachment'].maxBytes
      if (contentLength === 0 || contentLength > maxBytes) {
        throw new PayloadTooLargeError(maxBytes)
      }
      throw new BadRequestError('The upload could not be processed. Please try again with a smaller photo.')
    }
    const file = form.get('file')
    if (!(file instanceof File)) {
      throw new BadRequestError('Missing "file" field.')
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const validated = validateUpload('job-attachment', {
      filename: file.name || 'photo',
      contentType: file.type || 'application/octet-stream',
      size: buffer.length,
    })

    const storage = getStorage()
    const stored = await storage.put(validated.key, buffer, validated.contentType)

    const attachment = await recordJobRequestAttachment(auth, requestId, {
      storageKey: stored.key,
      originalName: validated.sanitizedFilename,
      mimeType: validated.contentType,
      sizeBytes: stored.size,
    })

    return jsonCreated(attachment)
  },
)
