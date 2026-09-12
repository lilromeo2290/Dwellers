/**
 * Dwellers — Discovery module: categories & locations.
 *
 * Public browsing surfaces for the marketplace taxonomy and the nationwide
 * Ghana location hierarchy. Categories are admin-managed (mutations land with
 * the admin phase); locations are reference data extended via the database —
 * never hard-coded into application code.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { safeText } from '@/lib/api/schemas'
import { paginationQuerySchema, skipTake } from '@/lib/api/pagination'
import type { AuthContext } from '@/lib/auth/session'
import { requireAuth } from '@/lib/auth/guards'
import { AUDIT_ACTIONS, recordAudit } from '@/lib/audit'
import { slugify } from '@/lib/utils'

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

export const categoryListQuerySchema = z.object({
  parentId: z.string().optional(),
  tree: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  q: safeText(120).optional(),
})

export const createCategorySchema = z.object({
  name: safeText(80, 'Category name'),
  description: safeText(500).nullable().optional(),
  parentId: z.string().min(1).nullable().optional(),
  icon: safeText(40).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
})

export const updateCategorySchema = createCategorySchema.partial().extend({
  isActive: z.boolean().optional(),
})

export const LOCATION_LEVELS = ['regions', 'districts', 'towns', 'communities'] as const

export const locationListQuerySchema = paginationQuerySchema.extend({
  level: z.enum(LOCATION_LEVELS),
  regionId: z.string().optional(),
  districtId: z.string().optional(),
  townId: z.string().optional(),
  q: safeText(80).optional(),
})

export type CategoryListQuery = z.infer<typeof categoryListQuerySchema>
export type CreateCategoryInput = z.infer<typeof createCategorySchema>
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>
export type LocationListQuery = z.infer<typeof locationListQuerySchema>

// -----------------------------------------------------------------------------
// Categories
// -----------------------------------------------------------------------------

export async function listCategories(query: CategoryListQuery) {
  const where = {
    isActive: true,
    ...(query.parentId !== undefined ? { parentId: query.parentId } : {}),
    ...(query.q ? { name: { contains: query.q } } : {}),
  }

  if (!query.tree) {
    const items = await db.category.findMany({
      where,
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        parentId: true,
        name: true,
        slug: true,
        description: true,
        icon: true,
        level: true,
        sortOrder: true,
      },
    })
    return { items, total: items.length }
  }

  // Two-level tree: roots matching the filter with their active children.
  const roots = await db.category.findMany({
    where: { ...where, parentId: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      icon: true,
      level: true,
      sortOrder: true,
      children: {
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          parentId: true,
          name: true,
          slug: true,
          description: true,
          icon: true,
          level: true,
          sortOrder: true,
        },
      },
    },
  })
  return { items: roots, total: roots.length }
}

/** Admin-only category creation (permission-gated upstream). */
export async function createCategory(auth: AuthContext | null, input: CreateCategoryInput) {
  const context = requireAuth(auth)

  let level = 1
  if (input.parentId) {
    const parent = await db.category.findFirst({ where: { id: input.parentId, isActive: true } })
    if (!parent) throw new ValidationError({ parentId: ['Unknown parent category'] })
    if (parent.level >= 3) {
      throw new ValidationError({ parentId: ['Categories nest at most three levels deep'] })
    }
    level = parent.level + 1
  }

  const slug = slugify(input.name)
  const clash = await db.category.findUnique({ where: { slug } })
  if (clash) throw new ValidationError({ name: ['A category with this name already exists'] })

  const category = await db.category.create({
    data: {
      name: input.name,
      slug,
      description: input.description ?? null,
      parentId: input.parentId ?? null,
      icon: input.icon ?? null,
      level,
      sortOrder: input.sortOrder ?? 0,
    },
  })

  await recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.CATEGORY_CREATED,
    entityType: 'Category',
    entityId: category.id,
    metadata: { name: category.name, level },
  })

  return category
}

/** Admin-only category update. */
export async function updateCategory(
  auth: AuthContext | null,
  id: string,
  input: UpdateCategoryInput,
) {
  const context = requireAuth(auth)
  const existing = await db.category.findFirst({ where: { id } })
  if (!existing) throw new NotFoundError('Category')

  const category = await db.category.update({ where: { id }, data: input })

  await recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.CATEGORY_UPDATED,
    entityType: 'Category',
    entityId: category.id,
  })

  return category
}

/** Admin-only soft delete (history keeps its references). */
export async function deleteCategory(auth: AuthContext | null, id: string) {
  const context = requireAuth(auth)
  const existing = await db.category.findFirst({ where: { id } })
  if (!existing) throw new NotFoundError('Category')

  await db.category.update({ where: { id }, data: { isActive: false } })

  await recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.CATEGORY_REMOVED,
    entityType: 'Category',
    entityId: id,
  })
}

// -----------------------------------------------------------------------------
// Locations
// -----------------------------------------------------------------------------

/**
 * Hierarchical browsing across the whole of Ghana:
 *   level=regions                        → all 16 regions
 *   level=districts&regionId=…           → districts of a region
 *   level=towns&districtId=…|regionId=…  → towns, optional region-wide sweep
 *   level=communities&townId=…           → communities/areas of a town
 * `q` narrows by name at any level (search preparation for later phases).
 */
export async function listLocations(query: LocationListQuery) {
  switch (query.level) {
    case 'regions': {
      const items = await db.region.findMany({
        where: {
          isActive: true,
          ...(query.q ? { name: { contains: query.q } } : {}),
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          slug: true,
          capital: true,
          latitude: true,
          longitude: true,
        },
      })
      return { items, total: items.length }
    }

    case 'districts': {
      const where = {
        isActive: true,
        ...(query.regionId ? { regionId: query.regionId } : {}),
        ...(query.q ? { name: { contains: query.q } } : {}),
      }
      const { skip, take } = skipTake(query)
  const [total, items] = await Promise.all([
        db.district.count({ where }),
        db.district.findMany({
          where,
          orderBy: { name: 'asc' },
          skip,
          take,
          select: {
            id: true,
            regionId: true,
            name: true,
            slug: true,
            type: true,
            region: { select: { id: true, name: true } },
          },
        }),
      ])
      return { items, total }
    }

    case 'towns': {
      const where = {
        isActive: true,
        ...(query.districtId ? { districtId: query.districtId } : {}),
        ...(query.regionId ? { regionId: query.regionId } : {}),
        ...(query.q ? { name: { contains: query.q } } : {}),
      }
      const { skip, take } = skipTake(query)
  const [total, items] = await Promise.all([
        db.town.count({ where }),
        db.town.findMany({
          where,
          orderBy: [{ isMajor: 'desc' }, { name: 'asc' }],
          skip,
          take,
          select: {
            id: true,
            districtId: true,
            regionId: true,
            name: true,
            slug: true,
            isMajor: true,
            latitude: true,
            longitude: true,
            district: { select: { id: true, name: true } },
            region: { select: { id: true, name: true } },
          },
        }),
      ])
      return { items, total }
    }

    case 'communities': {
      const where = {
        isActive: true,
        ...(query.townId ? { townId: query.townId } : {}),
        ...(query.q ? { name: { contains: query.q } } : {}),
      }
      const { skip, take } = skipTake(query)
  const [total, items] = await Promise.all([
        db.communityArea.count({ where }),
        db.communityArea.findMany({
          where,
          orderBy: { name: 'asc' },
          skip,
          take,
          select: {
            id: true,
            townId: true,
            name: true,
            slug: true,
            latitude: true,
            longitude: true,
            town: { select: { id: true, name: true, region: { select: { name: true } } } },
          },
        }),
      ])
      return { items, total }
    }
  }
}
