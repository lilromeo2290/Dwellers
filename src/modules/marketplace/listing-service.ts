/**
 * Dwellers — Marketplace module: listing services.
 *
 * Service listings (artisans/contractors/companies), product listings
 * (suppliers) and equipment listings (equipment providers). Role gating is
 * enforced by the RBAC permission matrix; ownership by load → verify → act.
 * All money values are integer pesewas validated at the boundary.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { optionalPesewasSchema, optionalText, pesewasSchema, safeText } from '@/lib/api/schemas'
import { paginationQuerySchema, skipTake } from '@/lib/api/pagination'
import type { AuthContext } from '@/lib/auth/session'
import { requireAuth } from '@/lib/auth/guards'
import { assertOwnership } from '@/lib/auth/ownership'
import { slugify } from '@/lib/utils'
import {
  AUDIT_ACTIONS,
  recordAudit,
} from '@/lib/audit'

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

export const PRICING_MODELS = [
  'FIXED',
  'STARTING_FROM',
  'PER_HOUR',
  'PER_DAY',
  'PER_UNIT',
  'QUOTE_REQUIRED',
] as const

export const LISTING_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'SUSPENDED', 'DELETED'] as const

const serviceBaseSchema = z.object({
  name: safeText(140, 'Service name'),
  description: optionalText(5000, 'Description'),
  categoryId: z.string().min(1),
  pricingModel: z.enum(PRICING_MODELS),
  startingPriceAmount: optionalPesewasSchema,
  status: z.enum(['DRAFT', 'ACTIVE']).optional(),
  serviceAreaIds: z.array(z.string().min(1)).max(50).optional(),
  businessId: z.string().min(1).nullable().optional(),
})

export const createServiceSchema = serviceBaseSchema.refine(
  (value) => value.pricingModel === 'QUOTE_REQUIRED' || value.startingPriceAmount != null,
  { message: 'A starting price is required unless the pricing model is QUOTE_REQUIRED',
    path: ['startingPriceAmount'] },
)

export const updateServiceSchema = serviceBaseSchema.partial()

export const serviceListQuerySchema = paginationQuerySchema.extend({
  categoryId: z.string().optional(),
  providerId: z.string().optional(),
  locationId: z.string().optional(),
  pricingModel: z.enum(PRICING_MODELS).optional(),
  q: safeText(120).optional(),
})

export const createProductSchema = z.object({
  name: safeText(140, 'Product name'),
  description: optionalText(5000, 'Description'),
  categoryId: z.string().min(1),
  priceAmount: pesewasSchema,
  sku: safeText(60, 'SKU').optional(),
  unitId: z.string().min(1).nullable().optional(),
  stockQuantity: z.number().int().min(0).optional(),
  minOrderQuantity: z.number().int().min(0).nullable().optional(),
  locationId: z.string().min(1).nullable().optional(),
  deliveryAvailable: z.boolean().optional(),
  status: z.enum(['DRAFT', 'ACTIVE']).optional(),
  businessId: z.string().min(1).nullable().optional(),
})

export const updateProductSchema = createProductSchema.partial()

export const productListQuerySchema = paginationQuerySchema.extend({
  categoryId: z.string().optional(),
  sellerId: z.string().optional(),
  locationId: z.string().optional(),
  deliveryAvailable: z
    .string()
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  q: safeText(120).optional(),
})

export const EQUIPMENT_CONDITIONS = ['NEW', 'EXCELLENT', 'GOOD', 'FAIR'] as const
export const EQUIPMENT_AVAILABILITY = [
  'AVAILABLE',
  'RENTED_OUT',
  'MAINTENANCE',
  'RETIRED',
] as const

export const createEquipmentSchema = z.object({
  name: safeText(140, 'Equipment name'),
  description: optionalText(5000, 'Description'),
  categoryId: z.string().min(1),
  brand: optionalText(60, 'Brand'),
  model: optionalText(60, 'Model'),
  yearManufactured: z.number().int().min(1950).max(2100).nullable().optional(),
  condition: z.enum(EQUIPMENT_CONDITIONS).nullable().optional(),
  dailyRateAmount: optionalPesewasSchema,
  weeklyRateAmount: optionalPesewasSchema,
  monthlyRateAmount: optionalPesewasSchema,
  depositAmount: optionalPesewasSchema,
  locationId: z.string().min(1).nullable().optional(),
  operatorAvailable: z.boolean().optional(),
  deliveryAvailable: z.boolean().optional(),
  availabilityStatus: z.enum(EQUIPMENT_AVAILABILITY).optional(),
  status: z.enum(['DRAFT', 'ACTIVE']).optional(),
  businessId: z.string().min(1).nullable().optional(),
})

export const updateEquipmentSchema = createEquipmentSchema.partial()

export const equipmentListQuerySchema = paginationQuerySchema.extend({
  categoryId: z.string().optional(),
  ownerId: z.string().optional(),
  locationId: z.string().optional(),
  availabilityStatus: z.enum(EQUIPMENT_AVAILABILITY).optional(),
  operatorAvailable: z
    .string()
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  q: safeText(120).optional(),
})

export type CreateServiceInput = z.infer<typeof createServiceSchema>
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>
export type ServiceListQuery = z.infer<typeof serviceListQuerySchema>
export type CreateProductInput = z.infer<typeof createProductSchema>
export type UpdateProductInput = z.infer<typeof updateProductSchema>
export type ProductListQuery = z.infer<typeof productListQuerySchema>
export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>
export type UpdateEquipmentInput = z.infer<typeof updateEquipmentSchema>
export type EquipmentListQuery = z.infer<typeof equipmentListQuerySchema>

// -----------------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------------

async function assertCategoryExists(categoryId: string): Promise<void> {
  const category = await db.category.findFirst({ where: { id: categoryId, isActive: true } })
  if (!category) throw new ValidationError({ categoryId: ['Unknown category'] })
}

async function assertTownExists(locationId: string, field = 'locationId'): Promise<void> {
  const town = await db.town.findUnique({ where: { id: locationId } })
  if (!town) throw new ValidationError({ [field]: ['Unknown location'] })
}

async function assertOwnBusiness(
  auth: AuthContext,
  businessId: string | null | undefined,
): Promise<void> {
  if (!businessId) return
  const business = await db.business.findFirst({ where: { id: businessId, deletedAt: null } })
  assertOwnership(business, auth)
}

/** Shared public-list filter: only ACTIVE listings of ACTIVE accounts. */
function publicListingWhere() {
  return {
    status: 'ACTIVE',
    deletedAt: null,
  }
}

// -----------------------------------------------------------------------------
// Services
// -----------------------------------------------------------------------------

export async function createServiceListing(auth: AuthContext | null, input: CreateServiceInput) {
  const context = requireAuth(auth)
  const provider = await db.providerProfile.findUnique({ where: { userId: context.userId } })
  if (!provider) throw new ValidationError({ provider: ['Create your provider profile first'] })

  await assertCategoryExists(input.categoryId)
  const serviceAreaIds = input.serviceAreaIds ?? []
  for (const locationId of serviceAreaIds) await assertTownExists(locationId, 'serviceAreaIds')
  await assertOwnBusiness(context, input.businessId)

  const listing = await db.service.create({
    data: {
      providerId: provider.id,
      businessId: input.businessId ?? provider.businessId,
      categoryId: input.categoryId,
      name: input.name,
      description: input.description ?? null,
      pricingModel: input.pricingModel,
      startingPriceAmount: input.startingPriceAmount ?? null,
      status: input.status ?? 'DRAFT',
      serviceAreas: {
        create: [...new Set(serviceAreaIds)].map((locationId) => ({ locationId })),
      },
    },
  })

  await recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.SERVICE_PUBLISHED,
    entityType: 'Service',
    entityId: listing.id,
    metadata: { name: listing.name },
  })

  return listing
}

export async function listServices(query: ServiceListQuery) {
  const where = {
    ...publicListingWhere(),
    provider: { deletedAt: null, user: { status: 'ACTIVE' } },
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.providerId ? { providerId: query.providerId } : {}),
    ...(query.pricingModel ? { pricingModel: query.pricingModel } : {}),
    ...(query.q ? { name: { contains: query.q } } : {}),
    ...(query.locationId
      ? {
          OR: [
            { serviceAreas: { some: { locationId: query.locationId } } },
            { provider: { serviceAreas: { some: { locationId: query.locationId } } } },
            { provider: { primaryLocationId: query.locationId } },
          ],
        }
      : {}),
  }

  const { skip, take } = skipTake(query)
  const [total, items] = await Promise.all([
    db.service.count({ where }),
    db.service.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        name: true,
        description: true,
        pricingModel: true,
        startingPriceAmount: true,
        currency: true,
        category: { select: { id: true, name: true, slug: true } },
        provider: {
          select: {
            id: true,
            profession: true,
            verificationStatus: true,
            ratingSum: true,
            ratingCount: true,
            user: { select: { name: true } },
          },
        },
        serviceAreas: { select: { location: { select: { id: true, name: true } } } },
      },
    }),
  ])

  return { items, total }
}

export async function getServiceListing(id: string) {
  const listing = await db.service.findFirst({
    where: { ...publicListingWhere(), id },
    select: {
      id: true,
      name: true,
      description: true,
      pricingModel: true,
      startingPriceAmount: true,
      currency: true,
      category: { select: { id: true, name: true, slug: true } },
      provider: {
        select: {
          id: true,
          profession: true,
          headline: true,
          verificationStatus: true,
          ratingSum: true,
          ratingCount: true,
          completedJobsCount: true,
          user: { select: { name: true, avatarKey: true } },
          business: { select: { id: true, name: true } },
        },
      },
      serviceAreas: {
        select: { location: { select: { id: true, name: true, region: { select: { name: true } } } } },
      },
    },
  })
  if (!listing) throw new NotFoundError('Service')
  return listing
}

export async function updateServiceListing(
  auth: AuthContext | null,
  id: string,
  input: UpdateServiceInput,
) {
  const context = requireAuth(auth)
  const existing = await db.service.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, provider: { select: { userId: true } } },
  })
  assertOwnership(existing ? { userId: existing.provider.userId } : null, context, { allowStaff: true })

  if (input.categoryId) await assertCategoryExists(input.categoryId)
  const serviceAreaIds = input.serviceAreaIds
  if (serviceAreaIds) {
    for (const locationId of serviceAreaIds) await assertTownExists(locationId, 'serviceAreaIds')
  }
  await assertOwnBusiness(context, input.businessId)

  const { serviceAreaIds: areas, ...fields } = input
  const listing = await db.service.update({
    where: { id },
    data: {
      ...fields,
      ...(areas
        ? {
            serviceAreas: {
              deleteMany: {},
              create: [...new Set(areas)].map((locationId) => ({ locationId })),
            },
          }
        : {}),
    },
  })

  await recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.SERVICE_UPDATED,
    entityType: 'Service',
    entityId: listing.id,
  })

  return listing
}

export async function deleteServiceListing(auth: AuthContext | null, id: string) {
  const context = requireAuth(auth)
  const existing = await db.service.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, provider: { select: { userId: true } } },
  })
  assertOwnership(existing ? { userId: existing.provider.userId } : null, context, { allowStaff: true })

  await db.service.update({ where: { id }, data: { status: 'DELETED', deletedAt: new Date() } })

  await recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.SERVICE_REMOVED,
    entityType: 'Service',
    entityId: id,
  })
}

// -----------------------------------------------------------------------------
// Products
// -----------------------------------------------------------------------------

export async function createProductListing(auth: AuthContext | null, input: CreateProductInput) {
  const context = requireAuth(auth)

  await assertCategoryExists(input.categoryId)
  if (input.locationId) await assertTownExists(input.locationId)
  if (input.unitId) {
    const unit = await db.measurementUnit.findFirst({ where: { id: input.unitId, isActive: true } })
    if (!unit) throw new ValidationError({ unitId: ['Unknown unit'] })
  }
  if (input.sku) {
    const clash = await db.product.findFirst({
      where: { sellerId: context.userId, sku: input.sku, deletedAt: null },
    })
    if (clash) throw new ValidationError({ sku: ['You already have a product with this SKU'] })
  }
  await assertOwnBusiness(context, input.businessId)

  const listing = await db.product.create({
    data: {
      sellerId: context.userId,
      businessId: input.businessId ?? null,
      categoryId: input.categoryId,
      name: input.name,
      description: input.description ?? null,
      priceAmount: input.priceAmount,
      sku: input.sku || null,
      unitId: input.unitId ?? null,
      stockQuantity: input.stockQuantity ?? 0,
      minOrderQuantity: input.minOrderQuantity ?? null,
      locationId: input.locationId ?? null,
      deliveryAvailable: input.deliveryAvailable ?? false,
      status: input.status ?? 'DRAFT',
    },
  })

  await recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.PRODUCT_PUBLISHED,
    entityType: 'Product',
    entityId: listing.id,
    metadata: { name: listing.name },
  })

  return listing
}

export async function listProducts(query: ProductListQuery) {
  const where = {
    ...publicListingWhere(),
    seller: { status: 'ACTIVE' },
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.sellerId ? { sellerId: query.sellerId } : {}),
    ...(query.locationId ? { locationId: query.locationId } : {}),
    ...(query.deliveryAvailable !== undefined
      ? { deliveryAvailable: query.deliveryAvailable }
      : {}),
    ...(query.q ? { name: { contains: query.q } } : {}),
  }

  const { skip, take } = skipTake(query)
  const [total, items] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        name: true,
        description: true,
        priceAmount: true,
        currency: true,
        stockQuantity: true,
        minOrderQuantity: true,
        deliveryAvailable: true,
        unit: { select: { name: true, slug: true, symbol: true } },
        category: { select: { id: true, name: true, slug: true } },
        seller: { select: { id: true, name: true } },
        business: { select: { id: true, name: true } },
        location: { select: { id: true, name: true, region: { select: { name: true } } } },
      },
    }),
  ])

  return { items, total }
}

export async function getProductListing(id: string) {
  const listing = await db.product.findFirst({
    where: { ...publicListingWhere(), id },
    select: {
      id: true,
      name: true,
      description: true,
      priceAmount: true,
      currency: true,
      sku: true,
      stockQuantity: true,
      minOrderQuantity: true,
      deliveryAvailable: true,
      unit: { select: { name: true, slug: true, symbol: true } },
      category: { select: { id: true, name: true, slug: true } },
      seller: { select: { id: true, name: true } },
      business: { select: { id: true, name: true, verificationStatus: true } },
      location: { select: { id: true, name: true, region: { select: { name: true } } } },
      images: { select: { id: true, storageKey: true, sortOrder: true } },
    },
  })
  if (!listing) throw new NotFoundError('Product')
  return listing
}

export async function updateProductListing(
  auth: AuthContext | null,
  id: string,
  input: UpdateProductInput,
) {
  const context = requireAuth(auth)
  const existing = await db.product.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, sellerId: true },
  })
  assertOwnership(existing ? { userId: existing.sellerId } : null, context, { allowStaff: true })

  if (input.categoryId) await assertCategoryExists(input.categoryId)
  if (input.locationId) await assertTownExists(input.locationId)
  if (input.sku) {
    const clash = await db.product.findFirst({
      where: { sellerId: context.userId, sku: input.sku, deletedAt: null, NOT: { id } },
    })
    if (clash) throw new ValidationError({ sku: ['You already have a product with this SKU'] })
  }
  await assertOwnBusiness(context, input.businessId)

  const listing = await db.product.update({ where: { id }, data: input })

  await recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.PRODUCT_UPDATED,
    entityType: 'Product',
    entityId: listing.id,
  })

  return listing
}

export async function deleteProductListing(auth: AuthContext | null, id: string) {
  const context = requireAuth(auth)
  const existing = await db.product.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, sellerId: true },
  })
  assertOwnership(existing ? { userId: existing.sellerId } : null, context, { allowStaff: true })

  await db.product.update({ where: { id }, data: { status: 'DELETED', deletedAt: new Date() } })

  await recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.PRODUCT_REMOVED,
    entityType: 'Product',
    entityId: id,
  })
}

// -----------------------------------------------------------------------------
// Equipment
// -----------------------------------------------------------------------------

export async function createEquipmentListing(auth: AuthContext | null, input: CreateEquipmentInput) {
  const context = requireAuth(auth)

  await assertCategoryExists(input.categoryId)
  if (input.locationId) await assertTownExists(input.locationId)
  await assertOwnBusiness(context, input.businessId)

  const { availabilityStatus, ...fields } = input
  const listing = await db.equipment.create({
    data: {
      ownerId: context.userId,
      businessId: input.businessId ?? null,
      availabilityStatus,
      status: input.status ?? 'DRAFT',
      ...fields,
    },
  })

  await recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.EQUIPMENT_PUBLISHED,
    entityType: 'Equipment',
    entityId: listing.id,
    metadata: { name: listing.name },
  })

  return listing
}

export async function listEquipment(query: EquipmentListQuery) {
  const where = {
    ...publicListingWhere(),
    owner: { status: 'ACTIVE' },
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.ownerId ? { ownerId: query.ownerId } : {}),
    ...(query.locationId ? { locationId: query.locationId } : {}),
    ...(query.availabilityStatus ? { availabilityStatus: query.availabilityStatus } : {}),
    ...(query.operatorAvailable !== undefined
      ? { operatorAvailable: query.operatorAvailable }
      : {}),
    ...(query.q ? { name: { contains: query.q } } : {}),
  }

  const { skip, take } = skipTake(query)
  const [total, items] = await Promise.all([
    db.equipment.count({ where }),
    db.equipment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        name: true,
        brand: true,
        model: true,
        condition: true,
        dailyRateAmount: true,
        weeklyRateAmount: true,
        monthlyRateAmount: true,
        depositAmount: true,
        currency: true,
        operatorAvailable: true,
        deliveryAvailable: true,
        availabilityStatus: true,
        category: { select: { id: true, name: true, slug: true } },
        owner: { select: { id: true, name: true } },
        business: { select: { id: true, name: true } },
        location: { select: { id: true, name: true, region: { select: { name: true } } } },
      },
    }),
  ])

  return { items, total }
}

export async function getEquipmentListing(id: string) {
  const listing = await db.equipment.findFirst({
    where: { ...publicListingWhere(), id },
    select: {
      id: true,
      name: true,
      description: true,
      brand: true,
      model: true,
      yearManufactured: true,
      condition: true,
      dailyRateAmount: true,
      weeklyRateAmount: true,
      monthlyRateAmount: true,
      depositAmount: true,
      currency: true,
      operatorAvailable: true,
      deliveryAvailable: true,
      availabilityStatus: true,
      category: { select: { id: true, name: true, slug: true } },
      owner: { select: { id: true, name: true } },
      business: { select: { id: true, name: true, verificationStatus: true } },
      location: { select: { id: true, name: true, region: { select: { name: true } } } },
      images: { select: { id: true, storageKey: true, sortOrder: true } },
    },
  })
  if (!listing) throw new NotFoundError('Equipment')
  return listing
}

export async function updateEquipmentListing(
  auth: AuthContext | null,
  id: string,
  input: UpdateEquipmentInput,
) {
  const context = requireAuth(auth)
  const existing = await db.equipment.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, ownerId: true },
  })
  assertOwnership(existing ? { userId: existing.ownerId } : null, context, { allowStaff: true })

  if (input.categoryId) await assertCategoryExists(input.categoryId)
  if (input.locationId) await assertTownExists(input.locationId)
  await assertOwnBusiness(context, input.businessId)

  const listing = await db.equipment.update({ where: { id }, data: input })

  await recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.EQUIPMENT_UPDATED,
    entityType: 'Equipment',
    entityId: listing.id,
  })

  return listing
}

export async function deleteEquipmentListing(auth: AuthContext | null, id: string) {
  const context = requireAuth(auth)
  const existing = await db.equipment.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, ownerId: true },
  })
  assertOwnership(existing ? { userId: existing.ownerId } : null, context, { allowStaff: true })

  await db.equipment.update({ where: { id }, data: { status: 'DELETED', deletedAt: new Date() } })

  await recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.EQUIPMENT_REMOVED,
    entityType: 'Equipment',
    entityId: id,
  })
}

// Re-exported for the routes module (slug kept for future SEO URLs).
export const _slugify = slugify
