/**
 * Dwellers — Brand constants (client-safe, no secrets).
 */
export const BRAND = {
  name: 'Dwellers',
  tagline: 'Find. Buy. Build.',
  description:
    'Dwellers is Ghana’s digital construction marketplace — connecting people building, renovating, maintaining or improving property with trusted artisans, contractors, construction companies, architects, engineers, quantity surveyors, interior designers, material suppliers and equipment providers.',
  valueChain: ['Find', 'Compare', 'Connect', 'Quote', 'Buy', 'Build'],
  currency: { code: 'GHS', symbol: 'GH₵' },
  market: 'Ghana',
} as const

/** Provider categories the marketplace will onboard (per product definition). */
export const PROVIDER_CATEGORIES = [
  { name: 'Artisans', description: 'Masons, electricians, plumbers, welders, carpenters' },
  { name: 'Contractors', description: 'Independent building and civil works contractors' },
  { name: 'Construction Companies', description: 'Registered firms for large-scale projects' },
  { name: 'Architects', description: 'Design and planning professionals' },
  { name: 'Engineers', description: 'Structural, civil and building services engineers' },
  { name: 'Quantity Surveyors', description: 'Cost planning and measurement experts' },
  { name: 'Interior Designers', description: 'Finishes, fittings and spatial design' },
  { name: 'Material Suppliers', description: 'Cement, steel, roofing, tiles and finishes' },
  { name: 'Equipment Providers', description: 'Machinery and tooling for hire' },
  { name: 'Equipment Rental', description: 'Short and long-term rental fleets' },
  { name: 'Construction Service Providers', description: 'Specialist and support services' },
] as const
