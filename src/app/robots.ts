/**
 * Dwellers — Robots (PART 48): discovery pages are indexable. No accidental
 * noindex on any discovery surface.
 */
import type { MetadataRoute } from 'next'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://dwellers.example'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Authenticated platform surfaces add no public value and should not
        // be crawled; every discovery surface stays open.
        disallow: ['/api/', '/auth/', '/dashboard/', '/admin/', '/customer/', '/artisan/', '/contractor/', '/company/', '/supplier/'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
