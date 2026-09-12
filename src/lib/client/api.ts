/**
 * Dwellers — Client API helper.
 *
 * Thin fetch wrapper that unwraps the platform response envelope
 * ({ success, data, error }) and normalises failures into a typed error
 * carrying per-field messages for forms. Client-side only usage.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly fieldErrors: Record<string, string[]> = {},
    readonly status: number = 0,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface Envelope<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: { fieldErrors?: Record<string, string[]> }
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, ...rest } = init ?? {}
  const response = await fetch(path, {
    ...rest,
    headers: {
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })

  let payload: Envelope<T>
  try {
    payload = (await response.json()) as Envelope<T>
  } catch {
    throw new ApiError('Unexpected server response. Please try again.', 'BAD_RESPONSE', {}, response.status)
  }

  if (!response.ok || !payload.success) {
    throw new ApiError(
      payload.error?.message ?? 'Something went wrong. Please try again.',
      payload.error?.code ?? 'UNKNOWN',
      payload.error?.details?.fieldErrors ?? {},
      response.status,
    )
  }

  return payload.data as T
}
