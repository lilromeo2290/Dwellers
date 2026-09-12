/**
 * Dwellers — Per-role dashboard navigation config.
 *
 * Each entry lists the sidebar sections for one role dashboard. Sections
 * whose backend features land in later phases still appear, marked
 * "coming soon" — the UI never fakes functionality (PARTS 18-24).
 */
import type { Role } from '@/lib/auth/roles'

export interface DashboardNavItem {
  label: string
  href: string
  /** Placeholder section: backend arrives in a later phase. */
  comingSoon?: boolean
  phase?: string
}

export interface DashboardNavGroup {
  heading: string
  items: DashboardNavItem[]
}

export const DASHBOARD_NAV: Record<Role, DashboardNavGroup[]> = {
  CUSTOMER: [
    {
      heading: 'Workspace',
      items: [
        { label: 'Overview', href: '/customer' },
        { label: 'My Profile', href: '/customer/profile' },
        { label: 'My Job Requests', href: '/customer/requests' },
        { label: 'Notifications', href: '/customer/notifications' },
        { label: 'Account Settings', href: '/customer/settings' },
      ],
    },
    {
      heading: 'Marketplace (later phases)',
      items: [
        { label: 'Find an Artisan', href: '/find' },
        { label: 'My Quotes', href: '/customer#quotes', comingSoon: true, phase: 'Phase 6' },
        { label: 'My Projects', href: '/customer#projects', comingSoon: true, phase: 'Phase 6' },
        { label: 'My Orders', href: '/customer#orders', comingSoon: true, phase: 'Phase 6' },
        { label: 'Messages', href: '/customer#messages', comingSoon: true, phase: 'Phase 6' },
        { label: 'Saved Providers', href: '/customer#saved', comingSoon: true, phase: 'Phase 6' },
      ],
    },
  ],
  ARTISAN: [
    {
      heading: 'Workspace',
      items: [
        { label: 'Overview', href: '/artisan' },
        { label: 'My Profile', href: '/artisan/profile' },
        { label: 'My Services', href: '/artisan/services' },
        { label: 'Service Areas', href: '/artisan/service-areas' },
        { label: 'Job Requests', href: '/artisan/requests' },
        { label: 'Verification', href: '/artisan/verification' },
        { label: 'Notifications', href: '/artisan/notifications' },
        { label: 'Settings', href: '/artisan/settings' },
      ],
    },
    {
      heading: 'Business (later phases)',
      items: [
        { label: 'Quotes', href: '/artisan#quotes', comingSoon: true, phase: 'Phase 6' },
        { label: 'Projects', href: '/artisan#projects', comingSoon: true, phase: 'Phase 6' },
        { label: 'Portfolio', href: '/artisan#portfolio', comingSoon: true, phase: 'Phase 6' },
        { label: 'Reviews', href: '/artisan#reviews', comingSoon: true, phase: 'Phase 6' },
        { label: 'Messages', href: '/artisan#messages', comingSoon: true, phase: 'Phase 6' },
      ],
    },
  ],
  CONTRACTOR: [
    {
      heading: 'Workspace',
      items: [
        { label: 'Overview', href: '/contractor' },
        { label: 'My Profile', href: '/contractor/profile' },
        { label: 'My Services', href: '/contractor/services' },
        { label: 'Service Areas', href: '/contractor/service-areas' },
        { label: 'Verification', href: '/contractor/verification' },
        { label: 'Notifications', href: '/contractor/notifications' },
        { label: 'Settings', href: '/contractor/settings' },
      ],
    },
    {
      heading: 'Business (later phases)',
      items: [
        { label: 'Job Requests', href: '/contractor/requests' },
        { label: 'Quotes', href: '/contractor#quotes', comingSoon: true, phase: 'Phase 6' },
        { label: 'Projects', href: '/contractor#projects', comingSoon: true, phase: 'Phase 6' },
        { label: 'Portfolio', href: '/contractor#portfolio', comingSoon: true, phase: 'Phase 4' },
        { label: 'Reviews', href: '/contractor#reviews', comingSoon: true, phase: 'Phase 5' },
        { label: 'Messages', href: '/contractor#messages', comingSoon: true, phase: 'Phase 6' },
      ],
    },
  ],
  CONSTRUCTION_COMPANY: [
    {
      heading: 'Workspace',
      items: [
        { label: 'Overview', href: '/company' },
        { label: 'Company Profile', href: '/company/profile' },
        { label: 'Service Areas', href: '/company/service-areas' },
        { label: 'Job Requests', href: '/company/requests' },
        { label: 'Verification', href: '/company/verification' },
        { label: 'Notifications', href: '/company/notifications' },
        { label: 'Settings', href: '/company/settings' },
      ],
    },
    {
      heading: 'Company operations (later phases)',
      items: [
        { label: 'Team', href: '/company#team', comingSoon: true, phase: 'Phase 6' },
        { label: 'Services', href: '/company#services', comingSoon: true, phase: 'Phase 6' },
        { label: 'Quotes', href: '/company#quotes', comingSoon: true, phase: 'Phase 6' },
        { label: 'Projects', href: '/company#projects', comingSoon: true, phase: 'Phase 6' },
        { label: 'Portfolio', href: '/company#portfolio', comingSoon: true, phase: 'Phase 6' },
        { label: 'Messages', href: '/company#messages', comingSoon: true, phase: 'Phase 6' },
      ],
    },
  ],
  SUPPLIER: [
    {
      heading: 'Workspace',
      items: [
        { label: 'Overview', href: '/supplier' },
        { label: 'Business Profile', href: '/supplier/profile' },
        { label: 'Service Areas', href: '/supplier/service-areas' },
        { label: 'Job Requests', href: '/supplier/requests' },
        { label: 'Notifications', href: '/supplier/notifications' },
        { label: 'Settings', href: '/supplier/settings' },
      ],
    },
    {
      heading: 'Commerce (later phases)',
      items: [
        { label: 'Products', href: '/supplier#products', comingSoon: true, phase: 'Phase 5' },
        { label: 'Orders', href: '/supplier#orders', comingSoon: true, phase: 'Phase 6' },
        { label: 'Customers', href: '/supplier#customers', comingSoon: true, phase: 'Phase 6' },
        { label: 'Delivery', href: '/supplier#delivery', comingSoon: true, phase: 'Phase 6' },
        { label: 'Reviews', href: '/supplier#reviews', comingSoon: true, phase: 'Phase 5' },
        { label: 'Messages', href: '/supplier#messages', comingSoon: true, phase: 'Phase 6' },
      ],
    },
  ],
  EQUIPMENT_PROVIDER: [
    {
      heading: 'Workspace',
      items: [
        { label: 'Overview', href: '/equipment' },
        { label: 'Profile', href: '/equipment/profile' },
        { label: 'Service Areas', href: '/equipment/service-areas' },
        { label: 'Job Requests', href: '/equipment/requests' },
        { label: 'Notifications', href: '/equipment/notifications' },
        { label: 'Settings', href: '/equipment/settings' },
      ],
    },
    {
      heading: 'Rental operations (later phases)',
      items: [
        { label: 'Equipment', href: '/equipment#equipment', comingSoon: true, phase: 'Phase 5' },
        { label: 'Rental Requests', href: '/equipment#rentals', comingSoon: true, phase: 'Phase 6' },
        { label: 'Availability', href: '/equipment#availability', comingSoon: true, phase: 'Phase 5' },
        { label: 'Customers', href: '/equipment#customers', comingSoon: true, phase: 'Phase 6' },
        { label: 'Messages', href: '/equipment#messages', comingSoon: true, phase: 'Phase 6' },
      ],
    },
  ],
  ADMIN: [
    {
      heading: 'Administration',
      items: [
        { label: 'Overview', href: '/admin' },
        { label: 'Users', href: '/admin/users' },
        { label: 'Audit Logs', href: '/admin/audit' },
      ],
    },
    {
      heading: 'Operations (later phases)',
      items: [
        { label: 'Businesses', href: '/admin#businesses', comingSoon: true, phase: 'Phase 4' },
        { label: 'Providers', href: '/admin#providers', comingSoon: true, phase: 'Phase 4' },
        { label: 'Categories', href: '/admin#categories', comingSoon: true, phase: 'Phase 4' },
        { label: 'Locations', href: '/admin#locations', comingSoon: true, phase: 'Phase 4' },
        { label: 'Verification', href: '/admin#verification', comingSoon: true, phase: 'Phase 5' },
        { label: 'Reports', href: '/admin#reports', comingSoon: true, phase: 'Phase 5' },
        { label: 'Settings', href: '/admin#settings', comingSoon: true, phase: 'Phase 5' },
      ],
    },
  ],
  SUPER_ADMIN: [
    {
      heading: 'Administration',
      items: [
        { label: 'Overview', href: '/admin' },
        { label: 'Users', href: '/admin/users' },
        { label: 'Audit Logs', href: '/admin/audit' },
      ],
    },
    {
      heading: 'Operations (later phases)',
      items: [
        { label: 'Businesses', href: '/admin#businesses', comingSoon: true, phase: 'Phase 4' },
        { label: 'Providers', href: '/admin#providers', comingSoon: true, phase: 'Phase 4' },
        { label: 'Categories', href: '/admin#categories', comingSoon: true, phase: 'Phase 4' },
        { label: 'Locations', href: '/admin#locations', comingSoon: true, phase: 'Phase 4' },
        { label: 'Verification', href: '/admin#verification', comingSoon: true, phase: 'Phase 5' },
        { label: 'Reports', href: '/admin#reports', comingSoon: true, phase: 'Phase 5' },
        { label: 'Settings', href: '/admin#settings', comingSoon: true, phase: 'Phase 5' },
      ],
    },
  ],
}
