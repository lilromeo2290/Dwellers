/**
 * Dwellers — Pagination conventions.
 *
 * List endpoints accept `page` (1-based) and `pageSize` (1–100, default 20)
 * and translate them into Prisma `skip`/`take`. Responses carry a
 * `PaginationMeta` object so clients never have to guess.
 */
import { z } from 'zod'
import type { PaginationMeta } from '@/types/api'

export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 20

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
})

export type PaginationQuery = z.infer<typeof paginationQuerySchema>

export interface PaginationParams extends PaginationQuery {
  /** Prisma offset. */
  skip: number
  /** Prisma limit. */
  take: number
}

/** Parses and clamps pagination from URL search params. Never throws. */
export function parsePagination(searchParams: URLSearchParams): PaginationParams {
  const toInt = (value: string | null): number => {
    const parsed = Number.parseInt(value ?? '', 10)
    return Number.isFinite(parsed) ? parsed : Number.NaN
  }

  const rawPage = toInt(searchParams.get('page'))
  const rawPageSize = toInt(searchParams.get('pageSize'))

  // Over-eager clients are clamped rather than rejected: page floors at 1,
  // pageSize is bounded to [1, MAX_PAGE_SIZE]. Unparseable values fall back
  // to defaults so a bad link never breaks a list view.
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
  const pageSize = Number.isFinite(rawPageSize)
    ? Math.min(Math.max(rawPageSize, 1), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize }
}

export function buildPaginationMeta(total: number, page: number, pageSize: number): PaginationMeta {
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize)
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1 && total > 0,
  }
}
