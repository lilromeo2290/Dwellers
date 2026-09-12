/**
 * Dwellers — Development seed (PHASE 2).
 *
 * Seeds the nationwide Ghana reference data (16 regions, sample districts,
 * towns and communities), the marketplace taxonomy (category tree + measurement
 * units) and clearly-marked DEMO accounts/businesses/listings.
 *
 * Demo-data policy (phase requirement):
 *  - every seeded user/business/listing row carries isSeedData = true;
 *  - demo providers are NEVER marked VERIFIED — they stay UNVERIFIED/PENDING
 *    so fake providers can never appear as vetted businesses;
 *  - all demo emails use the @demo.dwellers.test domain.
 *
 * Idempotent: safe to re-run (upserts on unique keys).
 * Run: bun scripts/seed.ts
 */
import { PrismaClient } from '@prisma/client'
import { slugify } from '../src/lib/utils'
import { hashPassword } from '../src/lib/auth/password'

const db = new PrismaClient()

const DEMO_PASSWORD = 'Demo#Passw0rd'

interface RegionSeed {
  name: string
  capital: string
  lat: number
  lng: number
  towns: { name: string; major?: boolean; lat?: number; lng?: number }[]
  communities?: Record<string, string[]> // town name → communities
}

/** One entry per region; capitals are always seeded as towns. Extra detail
 *  for Greater Accra, Eastern and Ashanti (the densest market areas). */
const GHANA: RegionSeed[] = [
  {
    name: 'Ahafo', capital: 'Goaso', lat: 6.9833, lng: -2.4833,
    towns: [{ name: 'Goaso', major: true, lat: 6.9833, lng: -2.4833 }, { name: 'Bechem', lat: 7.1, lng: -2.4833 }, { name: 'Hwidiem', lat: 6.9333, lng: -2.4667 }],
  },
  {
    name: 'Ashanti', capital: 'Kumasi', lat: 6.6885, lng: -1.6244,
    towns: [
      { name: 'Kumasi', major: true, lat: 6.6885, lng: -1.6244 },
      { name: 'Obuasi', lat: 6.2, lng: -1.6667 },
      { name: 'Ejisu', lat: 6.4833, lng: -1.4667 },
      { name: 'Konongo', lat: 6.6167, lng: -1.2167 },
      { name: 'Mampong', lat: 7.0667, lng: -1.4 },
    ],
    communities: { Kumasi: ['Asokwa', 'Ahodwo', 'Bantama', 'Suame', 'Oforikrom'] },
  },
  {
    name: 'Bono', capital: 'Sunyani', lat: 7.3349, lng: -2.3268,
    towns: [{ name: 'Sunyani', major: true, lat: 7.3349, lng: -2.3268 }, { name: 'Berekum', lat: 7.45, lng: -2.5833 }, { name: 'Dormaa Ahenkro', lat: 7.2833, lng: -2.8667 }],
  },
  {
    name: 'Bono East', capital: 'Techiman', lat: 7.5892, lng: -1.9472,
    towns: [{ name: 'Techiman', major: true, lat: 7.5892, lng: -1.9472 }, { name: 'Kintampo', lat: 8.05, lng: -1.7333 }],
  },
  {
    name: 'Central', capital: 'Cape Coast', lat: 5.1315, lng: -1.2795,
    towns: [{ name: 'Cape Coast', major: true, lat: 5.1315, lng: -1.2795 }, { name: 'Winneba', lat: 5.35, lng: -0.6333 }, { name: 'Swedru', lat: 5.5333, lng: -0.7 }, { name: 'Elmina', lat: 5.0833, lng: -1.35 }],
  },
  {
    name: 'Eastern', capital: 'Koforidua', lat: 6.0941, lng: -0.2591,
    towns: [
      { name: 'Koforidua', major: true, lat: 6.0941, lng: -0.2591 },
      { name: 'Nsawam', lat: 5.8085, lng: -0.3539 },
      { name: 'Adoagyiri', lat: 5.793, lng: -0.343 },
      { name: 'Suhum', lat: 5.75, lng: -0.45 },
      { name: 'Akropong', lat: 5.9667, lng: -0.0833 },
      { name: 'Nkawkaw', lat: 6.55, lng: -0.7667 },
    ],
    communities: { Nsawam: ['Zongo', 'Kwaman', 'Faase'], Koforidua: ['Old Estate', 'Zongo'] },
  },
  {
    name: 'Greater Accra', capital: 'Accra', lat: 5.6037, lng: -0.187,
    towns: [
      { name: 'Accra', major: true, lat: 5.6037, lng: -0.187 },
      { name: 'Tema', major: true, lat: 5.6698, lng: -0.0166 },
      { name: 'Madina', lat: 5.6833, lng: -0.1667 },
      { name: 'Adenta', lat: 5.7083, lng: -0.1653 },
      { name: 'Ashaiman', lat: 5.7, lng: -0.0333 },
      { name: 'Legon', lat: 5.65, lng: -0.1875 },
      { name: 'Amasaman', lat: 5.7, lng: -0.2833 },
    ],
    communities: {
      Accra: ['Osu', 'Dansoman', 'East Legon', 'Achimota', 'Kaneshie', 'Spintex'],
      Tema: ['Sakumono', 'Lashibi', 'Community 5', 'Tema New Town'],
    },
  },
  {
    name: 'North East', capital: 'Nalerigu', lat: 10.5667, lng: -0.3667,
    towns: [{ name: 'Nalerigu', major: true, lat: 10.5667, lng: -0.3667 }, { name: 'Walewale', lat: 10.35, lng: -0.8 }],
  },
  {
    name: 'Northern', capital: 'Tamale', lat: 9.4008, lng: -0.8393,
    towns: [{ name: 'Tamale', major: true, lat: 9.4008, lng: -0.8393 }, { name: 'Yendi', lat: 9.45, lng: -0.0167 }, { name: 'Savelugu', lat: 9.6167, lng: -0.8333 }],
    communities: { Tamale: ['Lamashegu', 'Aboabo', 'Gumani'] },
  },
  {
    name: 'Oti', capital: 'Dambai', lat: 7.9667, lng: 0.15,
    towns: [{ name: 'Dambai', major: true, lat: 7.9667, lng: 0.15 }, { name: 'Kete Krachi', lat: 7.8, lng: 0.05 }, { name: 'Nkwanta', lat: 8.3, lng: 0.5167 }],
  },
  {
    name: 'Savannah', capital: 'Damongo', lat: 9.0757, lng: -1.8061,
    towns: [{ name: 'Damongo', major: true, lat: 9.0757, lng: -1.8061 }, { name: 'Salaga', lat: 8.55, lng: -0.5167 }],
  },
  {
    name: 'Upper East', capital: 'Bolgatanga', lat: 10.7855, lng: -0.8514,
    towns: [{ name: 'Bolgatanga', major: true, lat: 10.7855, lng: -0.8514 }, { name: 'Navrongo', lat: 10.9, lng: -1.0833 }, { name: 'Bawku', lat: 11.1833, lng: -0.2333 }],
  },
  {
    name: 'Upper West', capital: 'Wa', lat: 10.0601, lng: -2.5099,
    towns: [{ name: 'Wa', major: true, lat: 10.0601, lng: -2.5099 }, { name: 'Tumu', lat: 10.9, lng: -1.9833 }],
  },
  {
    name: 'Volta', capital: 'Ho', lat: 6.6111, lng: 0.4713,
    towns: [{ name: 'Ho', major: true, lat: 6.6111, lng: 0.4713 }, { name: 'Keta', lat: 5.9167, lng: 0.9833 }, { name: 'Hohoe', lat: 7.15, lng: 0.4667 }, { name: 'Kpando', lat: 6.9833, lng: 0.3 }],
  },
  {
    name: 'Western', capital: 'Sekondi-Takoradi', lat: 4.934, lng: -1.7137,
    towns: [{ name: 'Sekondi-Takoradi', major: true, lat: 4.934, lng: -1.7137 }, { name: 'Tarkwa', lat: 5.3, lng: -1.9833 }, { name: 'Axim', lat: 4.8667, lng: -2.2333 }],
  },
  {
    name: 'Western North', capital: 'Sefwi Wiawso', lat: 6.2, lng: -2.8,
    towns: [{ name: 'Sefwi Wiawso', major: true, lat: 6.2, lng: -2.8 }, { name: 'Bibiani', lat: 6.4667, lng: -2.3167 }],
  },
]

// District names: derived per region with the capital pattern (a real, but
// deliberately sample-level, MMDA subset — extend any time via the database).
function districtNameFor(region: string, town: string): string {
  if (town === 'Accra') return 'Accra Metropolitan'
  if (town === 'Tema') return 'Tema Metropolitan'
  if (town === 'Kumasi') return 'Kumasi Metropolitan'
  if (town === 'Tamale') return 'Tamale Metropolitan'
  if (town === 'Shama') return 'Shama District'
  return `${town} Municipal`
}

async function seedLocations() {
  for (const [index, regionSeed] of GHANA.entries()) {
    const region = await db.region.upsert({
      where: { slug: slugify(regionSeed.name) },
      update: { capital: regionSeed.capital, latitude: regionSeed.lat, longitude: regionSeed.lng, sortOrder: index },
      create: {
        name: regionSeed.name,
        slug: slugify(regionSeed.name),
        capital: regionSeed.capital,
        latitude: regionSeed.lat,
        longitude: regionSeed.lng,
        sortOrder: index,
      },
    })

    for (const townSeed of regionSeed.towns) {
      const district = await db.district.upsert({
        where: { regionId_slug: { regionId: region.id, slug: slugify(districtNameFor(regionSeed.name, townSeed.name)) } },
        update: { latitude: townSeed.lat, longitude: townSeed.lng },
        create: {
          regionId: region.id,
          name: districtNameFor(regionSeed.name, townSeed.name),
          slug: slugify(districtNameFor(regionSeed.name, townSeed.name)),
          type: townSeed.major ? 'METROPOLITAN' : 'MUNICIPALITY',
          latitude: townSeed.lat,
          longitude: townSeed.lng,
        },
      })

      const town = await db.town.upsert({
        where: { districtId_slug: { districtId: district.id, slug: slugify(townSeed.name) } },
        update: { isMajor: townSeed.major ?? false, latitude: townSeed.lat, longitude: townSeed.lng },
        create: {
          districtId: district.id,
          regionId: region.id,
          name: townSeed.name,
          slug: slugify(townSeed.name),
          isMajor: townSeed.major ?? false,
          latitude: townSeed.lat,
          longitude: townSeed.lng,
        },
      })

      const communities = regionSeed.communities?.[townSeed.name] ?? []
      for (const communityName of communities) {
        await db.communityArea.upsert({
          where: { townId_slug: { townId: town.id, slug: slugify(communityName) } },
          update: {},
          create: { townId: town.id, name: communityName, slug: slugify(communityName) },
        })
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Taxonomy — category tree + measurement units
// -----------------------------------------------------------------------------

const CATEGORY_TREE: Record<string, string[]> = {
  'Construction Services': [
    'Building', 'Roofing', 'Plumbing', 'Electrical', 'Masonry', 'Carpentry',
    'Welding', 'Painting', 'Tiling', 'Landscaping', 'Renovation', 'Property Maintenance',
  ],
  'Professional Services': [
    'Architecture', 'Engineering', 'Quantity Surveying', 'Interior Design', 'Project Management',
  ],
  'Materials': [
    'Cement', 'Blocks', 'Sand', 'Aggregates', 'Iron Rods', 'Roofing Materials',
    'Tiles', 'Paint', 'Doors', 'Windows', 'Electrical Materials', 'Plumbing Materials',
  ],
  'Equipment': [
    'Excavators', 'Loaders', 'Trucks', 'Concrete Mixers', 'Generators', 'Cranes',
    'Rollers', 'Scaffolding',
  ],
}

const UNITS: { name: string; slug: string; symbol: string | null; kind: string }[] = [
  { name: 'Bag', slug: 'bag', symbol: null, kind: 'COUNT' },
  { name: 'Piece', slug: 'piece', symbol: 'pc', kind: 'COUNT' },
  { name: 'Ton', slug: 'ton', symbol: 't', kind: 'MASS' },
  { name: 'Kilogram', slug: 'kilogram', symbol: 'kg', kind: 'MASS' },
  { name: 'Length', slug: 'length', symbol: null, kind: 'LENGTH' },
  { name: 'Square Metre', slug: 'square-metre', symbol: 'm²', kind: 'AREA' },
  { name: 'Cubic Metre', slug: 'cubic-metre', symbol: 'm³', kind: 'VOLUME' },
  { name: 'Bundle', slug: 'bundle', symbol: null, kind: 'COUNT' },
  { name: 'Carton', slug: 'carton', symbol: null, kind: 'COUNT' },
  { name: 'Unit', slug: 'unit', symbol: null, kind: 'OTHER' },
  { name: 'Trip', slug: 'trip', symbol: null, kind: 'OTHER' },
  { name: 'Day', slug: 'day', symbol: null, kind: 'OTHER' },
]

async function seedTaxonomy() {
  for (const [rootName, children] of Object.entries(CATEGORY_TREE)) {
    const root = await db.category.upsert({
      where: { slug: slugify(rootName) },
      update: { isActive: true },
      create: { name: rootName, slug: slugify(rootName), level: 1, sortOrder: Object.keys(CATEGORY_TREE).indexOf(rootName) },
    })
    for (const [index, childName] of children.entries()) {
      await db.category.upsert({
        where: { slug: slugify(childName) },
        update: { parentId: root.id, isActive: true },
        create: { name: childName, slug: slugify(childName), parentId: root.id, level: 2, sortOrder: index },
      })
    }
  }

  for (const [index, unit] of UNITS.entries()) {
    await db.measurementUnit.upsert({
      where: { slug: unit.slug },
      update: { name: unit.name, symbol: unit.symbol, kind: unit.kind },
      create: { name: unit.name, slug: unit.slug, symbol: unit.symbol, kind: unit.kind, sortOrder: index },
    })
  }
}

// -----------------------------------------------------------------------------
// Demo accounts, businesses, providers, listings — all isSeedData
// -----------------------------------------------------------------------------

async function seedDemoData() {
  const passwordHash = await hashPassword(DEMO_PASSWORD)
  const town = async (name: string) => {
    const found = await db.town.findFirst({ where: { name } })
    if (!found) throw new Error(`Seed town not found: ${name}`)
    return found
  }

  const nsawam = await town('Nsawam')
  const adoagyiri = await town('Adoagyiri')
  const suhum = await town('Suhum')
  const koforidua = await town('Koforidua')
  const accra = await town('Accra')
  const kumasi = await town('Kumasi')
  const tema = await town('Tema')

  const cat = (name: string) => db.category.findUnique({ where: { slug: slugify(name) } }).then((r) => {
    if (!r) throw new Error(`Seed category missing: ${name}`)
    return r
  })
  const unit = (slug: string) => db.measurementUnit.findUnique({ where: { slug } }).then((r) => {
    if (!r) throw new Error(`Seed unit missing: ${slug}`)
    return r
  })

  const upsertUser = async (email: string, data: {
    name: string
    role: string
    phone?: string
    locationId?: string
  }) =>
    db.user.upsert({
      where: { email },
      update: { name: data.name, role: data.role },
      create: {
        email,
        name: data.name,
        role: data.role,
        phone: data.phone,
        passwordHash,
        isSeedData: true,
        emailVerifiedAt: new Date(),
        profile: data.locationId ? { create: { locationId: data.locationId } } : undefined,
      },
    })

  // Staff ------------------------------------------------------------------
  await upsertUser('superadmin@demo.dwellers.test', { name: 'Ama Boateng (Demo)', role: 'SUPER_ADMIN' })
  await upsertUser('admin@demo.dwellers.test', { name: 'Staff Admin (Demo)', role: 'ADMIN' })

  // Customers --------------------------------------------------------------
  const kojo = await upsertUser('kojo@demo.dwellers.test', {
    name: 'Kojo Mensah (Demo)', role: 'CUSTOMER', phone: '0241234567', locationId: accra.id,
  })
  await upsertUser('efua@demo.dwellers.test', {
    name: 'Efua Owusu (Demo)', role: 'CUSTOMER', phone: '0551234567', locationId: nsawam.id,
  })

  // Individual artisan — the "plumber in Nsawam" from the product story ------
  const kwame = await upsertUser('kwame@demo.dwellers.test', {
    name: 'Kwame Darko (Demo)', role: 'ARTISAN', phone: '0201234567', locationId: nsawam.id,
  })
  const kwameProvider = await db.providerProfile.upsert({
    where: { userId: kwame.id },
    update: { profession: 'plumber', primaryLocationId: nsawam.id },
    create: {
      userId: kwame.id,
      profession: 'plumber',
      headline: 'Plumbing repairs & installations around Nsawam',
      biography: 'Demo artisan profile. Twelve years fitting and fixing household and shop plumbing.',
      yearsExperience: 12,
      startingPriceAmount: 150_00,
      primaryLocationId: nsawam.id,
      isSeedData: true,
      serviceAreas: {
        create: [nsawam.id, adoagyiri.id, suhum.id, koforidua.id].map((locationId) => ({ locationId })),
      },
    },
  })

  const yaw = await upsertUser('yaw@demo.dwellers.test', {
    name: 'Yaw Asante (Demo)', role: 'ARTISAN', phone: '0271234567', locationId: kumasi.id,
  })
  const yawProvider = await db.providerProfile.upsert({
    where: { userId: yaw.id },
    update: { profession: 'electrician', primaryLocationId: kumasi.id },
    create: {
      userId: yaw.id,
      profession: 'electrician',
      headline: 'Certified electrician — wiring, faults, solar',
      yearsExperience: 8,
      startingPriceAmount: 120_00,
      primaryLocationId: kumasi.id,
      isSeedData: true,
      serviceAreas: { create: [{ locationId: kumasi.id }] },
    },
  })

  // Contractor with a business ----------------------------------------------
  const kofi = await upsertUser('kofi@demo.dwellers.test', {
    name: 'Kofi Boakye (Demo)', role: 'CONTRACTOR', phone: '0261234567',
  })
  const kofiProvider = await db.providerProfile.upsert({
    where: { userId: kofi.id },
    update: { profession: 'general contractor', primaryLocationId: accra.id },
    create: {
      userId: kofi.id,
      profession: 'general contractor',
      headline: 'Residential builds and renovations, Greater Accra',
      yearsExperience: 15,
      primaryLocationId: accra.id,
      isSeedData: true,
      serviceAreas: { create: [accra.id, tema.id].map((locationId) => ({ locationId })) },
    },
  })

  // Construction company -----------------------------------------------------
  const akua = await upsertUser('akua@demo.dwellers.test', {
    name: 'Akua Addo (Demo)', role: 'CONSTRUCTION_COMPANY', phone: '0249876543',
  })
  const adansi = await db.business.upsert({
    where: { slug: 'adansi-builders-ltd' },
    update: { ownerId: akua.id },
    create: {
      ownerId: akua.id,
      name: 'Adansi Builders Ltd (Demo)',
      slug: 'adansi-builders-ltd',
      businessType: 'CONSTRUCTION_COMPANY',
      description: 'Demo construction company. Residential estates, offices and road works.',
      email: 'akua@demo.dwellers.test',
      phone: '+233249876543',
      locationId: kumasi.id,
      isSeedData: true,
      serviceAreas: {
        create: [kumasi.id, accra.id].map((locationId) => ({ locationId })),
      },
      members: { create: { userId: akua.id, memberRole: 'OWNER', status: 'ACTIVE' } },
    },
  })
  const adansiProvider = await db.providerProfile.upsert({
    where: { userId: akua.id },
    update: { businessId: adansi.id, profession: 'building construction' },
    create: {
      userId: akua.id,
      businessId: adansi.id,
      profession: 'building construction',
      headline: 'Full building construction services',
      yearsExperience: 20,
      primaryLocationId: kumasi.id,
      isSeedData: true,
    },
  })

  // Supplier with products ----------------------------------------------------
  const abena = await upsertUser('abena@demo.dwellers.test', {
    name: 'Abena Frimpong (Demo)', role: 'SUPPLIER', phone: '0541234567',
  })
  const frimpongMaterials = await db.business.upsert({
    where: { slug: 'frimpong-building-materials' },
    update: { ownerId: abena.id },
    create: {
      ownerId: abena.id,
      name: 'Frimpong Building Materials (Demo)',
      slug: 'frimpong-building-materials',
      businessType: 'SUPPLIER',
      description: 'Demo materials shop. Cement, blocks, iron rods and roofing sheets.',
      email: 'abena@demo.dwellers.test',
      phone: '+233541234567',
      locationId: accra.id,
      isSeedData: true,
      serviceAreas: { create: [{ locationId: accra.id }, { locationId: tema.id }] },
    },
  })

  const bag = await unit('bag')
  const ton = await unit('ton')
  const piece = await unit('piece')
  await db.product.upsert({
    where: { sellerId_sku: { sellerId: abena.id, sku: 'DEMO-CEM-50' } },
    update: { priceAmount: 92_00 },
    create: {
      sellerId: abena.id,
      businessId: frimpongMaterials.id,
      categoryId: (await cat('Cement')).id,
      name: 'Dangote Cement 50kg (Demo)',
      sku: 'DEMO-CEM-50',
      priceAmount: 92_00,
      unitId: bag.id,
      stockQuantity: 1200,
      minOrderQuantity: 5,
      locationId: accra.id,
      deliveryAvailable: true,
      status: 'ACTIVE',
      isSeedData: true,
    },
  })
  await db.product.upsert({
    where: { sellerId_sku: { sellerId: abena.id, sku: 'DEMO-BLK-6IN' } },
    update: { priceAmount: 6_50 },
    create: {
      sellerId: abena.id,
      businessId: frimpongMaterials.id,
      categoryId: (await cat('Blocks')).id,
      name: 'Solid Blocks 6 Inch (Demo)',
      sku: 'DEMO-BLK-6IN',
      priceAmount: 6_50,
      unitId: piece.id,
      stockQuantity: 8000,
      locationId: accra.id,
      deliveryAvailable: true,
      status: 'ACTIVE',
      isSeedData: true,
    },
  })
  await db.product.upsert({
    where: { sellerId_sku: { sellerId: abena.id, sku: 'DEMO-IRON-12MM' } },
    update: { priceAmount: 78_00 },
    create: {
      sellerId: abena.id,
      businessId: frimpongMaterials.id,
      categoryId: (await cat('Iron Rods')).id,
      name: 'Iron Rods 12mm — per ton (Demo)',
      sku: 'DEMO-IRON-12MM',
      priceAmount: 7800_00,
      unitId: ton.id,
      stockQuantity: 40,
      locationId: accra.id,
      status: 'ACTIVE',
      isSeedData: true,
    },
  })

  // Equipment provider --------------------------------------------------------
  const hemaa = await upsertUser('hemaa@demo.dwellers.test', {
    name: 'Hemaa Rentals (Demo)', role: 'EQUIPMENT_PROVIDER', phone: '0561234567',
  })
  const hemaaEquipment = await db.business.upsert({
    where: { slug: 'hemaa-equipment-rentals' },
    update: { ownerId: hemaa.id },
    create: {
      ownerId: hemaa.id,
      name: 'Hemaa Equipment Rentals (Demo)',
      slug: 'hemaa-equipment-rentals',
      businessType: 'EQUIPMENT_RENTAL',
      description: 'Demo equipment yard. Excavators, mixers, generators with operators.',
      email: 'hemaa@demo.dwellers.test',
      phone: '+233561234567',
      locationId: tema.id,
      isSeedData: true,
      serviceAreas: { create: [{ locationId: tema.id }, { locationId: accra.id }] },
    },
  })

  await db.equipment.upsert({
    where: { id: (await db.equipment.findFirst({ where: { name: 'Caterpillar 320 Excavator (Demo)' } }))?.id ?? 'none' },
    update: {},
    create: {
      ownerId: hemaa.id,
      businessId: hemaaEquipment.id,
      categoryId: (await cat('Excavators')).id,
      name: 'Caterpillar 320 Excavator (Demo)',
      brand: 'Caterpillar',
      model: '320 GC',
      yearManufactured: 2019,
      condition: 'EXCELLENT',
      dailyRateAmount: 3500_00,
      weeklyRateAmount: 21_000_00,
      monthlyRateAmount: 75_000_00,
      depositAmount: 5000_00,
      locationId: tema.id,
      operatorAvailable: true,
      deliveryAvailable: true,
      description: 'Demo listing. 20-ton excavator with certified operator available.',
      availabilityStatus: 'AVAILABLE',
      status: 'ACTIVE',
      isSeedData: true,
    },
  })
  await db.equipment.create({
    data: {
      ownerId: hemaa.id,
      businessId: hemaaEquipment.id,
      categoryId: (await cat('Concrete Mixers')).id,
      name: 'Concrete Mixer 350L (Demo)',
      brand: 'Big Bull',
      condition: 'GOOD',
      dailyRateAmount: 250_00,
      weeklyRateAmount: 1400_00,
      depositAmount: 300_00,
      locationId: tema.id,
      operatorAvailable: false,
      deliveryAvailable: true,
      availabilityStatus: 'AVAILABLE',
      status: 'ACTIVE',
      isSeedData: true,
    },
  })

  // Services -------------------------------------------------------------------
  const plumbing = await cat('Plumbing')
  const electrical = await cat('Electrical')
  const building = await cat('Building')
  const roofing = await cat('Roofing')

  await db.service.upsert({
    where: { id: (await db.service.findFirst({ where: { name: 'Kitchen & bathroom plumbing repair (Demo)' } }))?.id ?? 'none' },
    update: {},
    create: {
      providerId: kwameProvider.id,
      categoryId: plumbing.id,
      name: 'Kitchen & bathroom plumbing repair (Demo)',
      description: 'Leaking sinks, burst pipes, toilet and tap repairs across Nsawam and nearby towns.',
      pricingModel: 'STARTING_FROM',
      startingPriceAmount: 150_00,
      status: 'ACTIVE',
      isSeedData: true,
      serviceAreas: { create: [nsawam.id, adoagyiri.id, suhum.id].map((locationId) => ({ locationId })) },
    },
  })
  await db.service.upsert({
    where: { id: (await db.service.findFirst({ where: { name: 'Full plumbing installation — new build (Demo)' } }))?.id ?? 'none' },
    update: {},
    create: {
      providerId: kwameProvider.id,
      categoryId: plumbing.id,
      name: 'Full plumbing installation — new build (Demo)',
      description: 'Complete pipe runs, drainage and fittings for new residential builds.',
      pricingModel: 'QUOTE_REQUIRED',
      status: 'ACTIVE',
      isSeedData: true,
    },
  })
  await db.service.upsert({
    where: { id: (await db.service.findFirst({ where: { name: 'House wiring & fault fixing (Demo)' } }))?.id ?? 'none' },
    update: {},
    create: {
      providerId: yawProvider.id,
      categoryId: electrical.id,
      name: 'House wiring & fault fixing (Demo)',
      description: 'New wiring, fault tracing, distribution board upgrades.',
      pricingModel: 'PER_DAY',
      startingPriceAmount: 280_00,
      status: 'ACTIVE',
      isSeedData: true,
    },
  })
  await db.service.upsert({
    where: { id: (await db.service.findFirst({ where: { name: 'Residential building construction (Demo)' } }))?.id ?? 'none' },
    update: {},
    create: {
      providerId: adansiProvider.id,
      businessId: adansi.id,
      categoryId: building.id,
      name: 'Residential building construction (Demo)',
      description: 'From foundation to roofing — full residential projects.',
      pricingModel: 'QUOTE_REQUIRED',
      status: 'ACTIVE',
      isSeedData: true,
    },
  })
  await db.service.upsert({
    where: { id: (await db.service.findFirst({ where: { name: 'Roofing sheet installation (Demo)' } }))?.id ?? 'none' },
    update: {},
    create: {
      providerId: kofiProvider.id,
      categoryId: roofing.id,
      name: 'Roofing sheet installation (Demo)',
      description: 'Truss fabrication and roofing sheet installation.',
      pricingModel: 'PER_UNIT',
      startingPriceAmount: 45_00,
      status: 'ACTIVE',
      isSeedData: true,
    },
  })

  // A demo job request from Kojo (plumbing problem in Nsawam) -------------------
  const existingJob = await db.jobRequest.findFirst({ where: { reference: 'JR-DEMO001' } })
  if (!existingJob) {
    await db.jobRequest.create({
      data: {
        reference: 'JR-DEMO001',
        customerId: kojo.id,
        categoryId: plumbing.id,
        locationId: nsawam.id,
        communityId: (await db.communityArea.findFirst({ where: { townId: nsawam.id } }))?.id,
        title: 'Kitchen sink leaking (Demo)',
        description:
          'My kitchen sink is leaking under the trap. I need a plumber to come and repair it. Nsawam, near the old lorry station.',
        budgetMinAmount: 100_00,
        budgetMaxAmount: 300_00,
        preferredTimeSlot: 'MORNING',
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    })
  }

  // Phase 5 demo fixtures -------------------------------------------------------
  // Raymond (customer in Nsawam) — the acceptance-test customer.
  const raymond = await upsertUser('raymond@demo.dwellers.test', {
    name: 'Raymond Asare (Demo)', role: 'CUSTOMER', phone: '0209887766', locationId: nsawam.id,
  })
  // A non-owner business member of Adansi Builders — exercises PART 27.
  const kwaku = await upsertUser('kwaku@demo.dwellers.test', {
    name: 'Kwaku Osei (Demo)', role: 'CONSTRUCTION_COMPANY', phone: '0247778899', locationId: kumasi.id,
  })
  await db.businessMember.upsert({
    where: { businessId_userId: { businessId: adansi.id, userId: kwaku.id } },
    update: { memberRole: 'MEMBER', status: 'ACTIVE' },
    create: { businessId: adansi.id, userId: kwaku.id, memberRole: 'MEMBER', status: 'ACTIVE' },
  })

  // A real, live demo request: Raymond → Kwame Plumbing (Nsawam), SUBMITTED.
  const plumbingService = await db.service.findFirst({
    where: { providerId: kwameProvider.id, status: 'ACTIVE', isSeedData: true },
  })
  const existingDemoRequest = await db.jobRequest.findFirst({ where: { reference: 'JR-DEMO002' } })
  if (!existingDemoRequest && plumbingService) {
    const now = new Date()
    await db.jobRequest.create({
      data: {
        reference: 'JR-DEMO002',
        customerId: raymond.id,
        providerId: kwameProvider.id,
        serviceId: plumbingService.id,
        categoryId: plumbing.id,
        locationId: nsawam.id,
        title: 'Fix leaking bathroom pipe (Demo)',
        description:
          'The pipe under my bathroom sink has been leaking for two days. Please come and inspect it. Near the Adoagyiri market.',
        preferredTimeSlot: 'MORNING',
        urgency: 'NORMAL',
        status: 'SUBMITTED',
        submittedAt: now,
        events: {
          create: [
            { eventType: 'CREATED', actorId: raymond.id, actorRole: 'CUSTOMER', createdAt: now },
            { eventType: 'SUBMITTED', actorId: raymond.id, actorRole: 'CUSTOMER', createdAt: now },
          ],
        },
      },
    })
    await db.notification.create({
      data: {
        recipientId: kwame.id,
        type: 'JOB_REQUEST_NEW',
        channel: 'IN_APP',
        title: 'New service request in Nsawam.',
        body: 'Plumbing request — open Job Requests to respond.',
        entityType: 'JobRequest',
        entityId: (await db.jobRequest.findFirst({ where: { reference: 'JR-DEMO002' } }))!.id,
      },
    })
  }

  console.log(
    [
      '',
      'DWELLERS — Phase 2 development seed complete.',
      `  Regions: ${await db.region.count()} (16 expected)`,
      `  Districts: ${await db.district.count()}`,
      `  Towns: ${await db.town.count()}`,
      `  Communities: ${await db.communityArea.count()}`,
      `  Categories: ${await db.category.count()}`,
      `  Units: ${await db.measurementUnit.count()}`,
      `  Demo users: ${await db.user.count({ where: { isSeedData: true } })}`,
      `  Demo providers: ${await db.providerProfile.count({ where: { isSeedData: true } })}`,
      `  Demo businesses: ${await db.business.count({ where: { isSeedData: true } })}`,
      `  Demo services: ${await db.service.count({ where: { isSeedData: true } })}`,
      `  Demo products: ${await db.product.count({ where: { isSeedData: true } })}`,
      `  Demo equipment: ${await db.equipment.count({ where: { isSeedData: true } })}`,
      '',
      `  Demo password for every seeded account: ${DEMO_PASSWORD}`,
      '  All demo rows carry isSeedData=true and are never shown as VERIFIED.',
      '',
    ].join('\n'),
  )
}

async function main() {
  await seedLocations()
  await seedTaxonomy()
  await seedDemoData()
}

main()
  .catch((error) => {
    console.error('Seed failed:', error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())


