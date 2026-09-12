/**
 * Dwellers — Local filesystem storage driver.
 *
 * Current driver for development and the single-node deployment. Objects live
 * under a dedicated root (STORAGE_LOCAL_PATH) and are addressed by generated
 * keys — client data NEVER influences the physical path directly.
 *
 * Access control note: uploaded objects are not publicly guessable (UUID keys)
 * but are also not access-checked by the filesystem itself. Private objects
 * (documents, attachments) are served through authenticated API routes that
 * verify the caller's permission to the parent resource before streaming.
 */
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import path from 'node:path'
import { NotFoundError } from '@/lib/errors'
import { env } from '@/lib/env'
import type { StorageProvider, StoredObject } from '@/lib/storage/types'

export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local'
  private readonly root: string

  constructor(root: string = env.STORAGE_LOCAL_PATH) {
    this.root = path.resolve(process.cwd(), root)
  }

  /** Resolves a key inside the root, rejecting any traversal attempt. */
  private resolve(key: string): string {
    const safeKey = key.replace(/\\/g, '/').replace(/^\/+/, '')
    const resolved = path.resolve(this.root, safeKey)
    if (!resolved.startsWith(this.root + path.sep) && resolved !== this.root) {
      throw new NotFoundError('File')
    }
    return resolved
  }

  async put(key: string, data: Buffer, contentType: string): Promise<StoredObject> {
    const target = this.resolve(key)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, data, { mode: 0o600 })
    return { key, size: data.byteLength, contentType }
  }

  async get(key: string): Promise<{ data: Buffer; contentType: string }> {
    const target = this.resolve(key)
    if (!existsSync(target)) throw new NotFoundError('File')
    const data = await readFile(target)
    return { data, contentType: 'application/octet-stream' }
  }

  /**
   * Streams a stored object — for authenticated download routes.
   *
   * Uses Node's official `Readable.toWeb` adapter to convert the fs read
   * stream into a WHATWG ReadableStream (never a bare type cast of the Node
   * stream, which would lack the web-stream protocol at runtime).
   */
  stream(key: string): ReadableStream<Uint8Array> {
    const target = this.resolve(key)
    if (!existsSync(target)) throw new NotFoundError('File')
    const nodeStream = createReadStream(target)
    return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>
  }

  async delete(key: string): Promise<void> {
    const target = this.resolve(key)
    await unlink(target).catch(() => undefined)
  }

  async exists(key: string): Promise<boolean> {
    try {
      const info = await stat(this.resolve(key))
      return info.isFile()
    } catch {
      return false
    }
  }

  publicUrl(): string | null {
    // Local driver has no public base; objects are served through API routes.
    return null
  }
}
