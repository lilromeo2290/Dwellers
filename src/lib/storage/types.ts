/**
 * Dwellers — Storage abstraction types.
 *
 * The platform never talks to a concrete storage backend directly; it depends
 * on this interface (see local.ts for the current driver). Adding S3/GCS
 * later means adding a provider, not rewriting features.
 */

/** Every upload category the platform will handle (per product requirements). */
export const STORAGE_CATEGORIES = [
  'profile-image',
  'business-logo',
  'product-image',
  'portfolio-image',
  'project-image',
  'document',
  'quote-attachment',
  'message-attachment',
  'job-attachment',
] as const

export type StorageCategory = (typeof STORAGE_CATEGORIES)[number]

export interface StoredObject {
  /** Provider-agnostic key under which the object lives. */
  key: string
  size: number
  contentType: string
}

export interface StorageProvider {
  readonly name: string
  put(key: string, data: Buffer, contentType: string): Promise<StoredObject>
  get(key: string): Promise<{ data: Buffer; contentType: string }>
  /**
   * Streams the object body as a WHATWG ReadableStream — used by
   * authenticated download routes so large files never buffer in memory.
   */
  stream(key: string): ReadableStream<Uint8Array>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
  /** Public/CDN URL when the driver serves objects publicly; else null (use signed URLs / API streaming). */
  publicUrl(key: string): string | null
}
