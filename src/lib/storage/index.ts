/**
 * Dwellers — Storage driver factory.
 *
 * Selects the provider from configuration. The rest of the application
 * depends only on getStorage() and the StorageProvider interface, so moving
 * to S3 (or any CDN-backed driver) is a configuration change.
 */
import { env } from '@/lib/env'
import { LocalStorageProvider } from '@/lib/storage/local'
import type { StorageProvider } from '@/lib/storage/types'

let provider: StorageProvider | null = null

export function getStorage(): StorageProvider {
  if (!provider) {
    switch (env.STORAGE_DRIVER) {
      case 's3':
        // Phase 2+ ships the S3 driver with the commerce/attachment features
        // that need it. Falling back loudly prevents silent misconfiguration.
        throw new Error('STORAGE_DRIVER=s3 is not implemented yet; use "local".')
      case 'local':
      default:
        provider = new LocalStorageProvider()
    }
  }
  return provider
}

export * from '@/lib/storage/types'
export * from '@/lib/storage/validation'
