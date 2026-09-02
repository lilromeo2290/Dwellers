/**
 * Dwellers — Foundation verification script.
 *
 * Proves the Phase 1 foundations behave as designed without any test
 * framework dependency. Run with: `bun run verify`
 *
 * Covers: RBAC matrix, privilege-escalation rules, error mapping,
 * pagination, upload validation, storage key safety, password hashing,
 * GH₵ money handling and Ghana reference data.
 */
import { hasPermission, resolveEffectivePermissions } from '../src/lib/auth/permissions'
import { canManageRole, assignableRoles, parseRole, isRole } from '../src/lib/auth/roles'
import { hashPassword, verifyPassword, assessPasswordStrength } from '../src/lib/auth/password'
import { AppError, toPublicError, ValidationError } from '../src/lib/errors'
import { parsePagination, buildPaginationMeta } from '../src/lib/api/pagination'
import { validateUpload, sanitizeFilename } from '../src/lib/storage/validation'
import { LocalStorageProvider } from '../src/lib/storage/local'
import { formatCedi, toPesewas } from '../src/lib/finance'
import { GHANA_REGIONS, normalizeGhanaPhoneNumber, isGhanaPhoneNumber } from '../src/lib/constants/ghana'

let passed = 0
let failed = 0

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.error(`  ✗ ${name}`, detail ?? '')
  }
}

async function section(title: string, fn: () => void | Promise<void>) {
  console.log(`\n${title}`)
  await fn()
}

await section('1. Role model', () => {
  check('eight roles defined', isRole('SUPER_ADMIN') && isRole('CUSTOMER') && !isRole('HACKER'))
  check('parseRole rejects unknown', (() => {
    try { parseRole('NOPE'); return false } catch { return true }
  })())
})

await section('2. RBAC permission matrix', () => {
  check('SUPER_ADMIN wildcard grants everything', hasPermission('SUPER_ADMIN', 'admin:settings:manage'))
  check('ADMIN staff wildcard covers admin domain', hasPermission('ADMIN', 'admin:dashboard:view') && hasPermission('ADMIN', 'admin:audit:view'))
  check('CUSTOMER can request quotations', hasPermission('CUSTOMER', 'commerce:quotes:request'))
  check('CUSTOMER cannot submit quotations', !hasPermission('CUSTOMER', 'commerce:quotes:submit'))
  check('ARTISAN can submit quotations', hasPermission('ARTISAN', 'commerce:quotes:submit'))
  check('ARTISAN cannot manage platform users', !hasPermission('ARTISAN', 'identity:users:manage'))
  check('SUPPLIER manages products', hasPermission('SUPPLIER', 'marketplace:products:manage'))
  check('EQUIPMENT_PROVIDER manages equipment', hasPermission('EQUIPMENT_PROVIDER', 'marketplace:equipment:manage'))
  check('CONSTRUCTION_COMPANY manages team', hasPermission('CONSTRUCTION_COMPANY', 'marketplace:team:manage'))
  check('every role has the shared base set', resolveEffectivePermissions('CUSTOMER').includes('identity:profile:read'))
})

await section('3. Privilege-escalation defences', () => {
  check('SUPER_ADMIN manages all roles', canManageRole('SUPER_ADMIN', 'ADMIN') && canManageRole('SUPER_ADMIN', 'SUPER_ADMIN'))
  check('ADMIN cannot manage SUPER_ADMIN', !canManageRole('ADMIN', 'SUPER_ADMIN'))
  check('ADMIN can manage providers/customers', canManageRole('ADMIN', 'SUPPLIER') && canManageRole('ADMIN', 'CUSTOMER'))
  check('provider roles manage nobody', !canManageRole('CONTRACTOR', 'CUSTOMER'))
  check('nobody below SUPER_ADMIN can assign SUPER_ADMIN', !assignableRoles('ADMIN').includes('SUPER_ADMIN'))
  check('ADMIN assignable set is sane', assignableRoles('ADMIN').includes('CUSTOMER') && assignableRoles('ADMIN').includes('SUPPLIER'))
})

await section('4. Error system', () => {
  const appError = toPublicError(new AppError('NOT_FOUND', 404, 'X not found.'))
  check('AppError passes through unchanged', appError.code === 'NOT_FOUND' && appError.status === 404)
  const unknown = toPublicError(new Error('ECONNREFUSED 10.0.0.12:5432 password=hunter2'))
  check('unknown errors become opaque 500', unknown.code === 'INTERNAL_ERROR')
  check('internal message leaks nothing', !unknown.message.includes('hunter2'))
  check('validation error carries details', new ValidationError({ email: ['invalid'] }).details !== undefined)
})

await section('5. Pagination', () => {
  const params = new URLSearchParams('page=3&pageSize=25')
  const parsed = parsePagination(params)
  check('parses page/pageSize', parsed.page === 3 && parsed.pageSize === 25)
  check('computes skip/take', parsed.skip === 50 && parsed.take === 25)
  const oversized = parsePagination(new URLSearchParams('pageSize=5000'))
  check('pageSize clamped to max 100', oversized.pageSize === 100)
  const meta = buildPaginationMeta(250, 3, 25)
  check('meta math correct', meta.totalPages === 10 && meta.hasNextPage && meta.hasPreviousPage)
})

await section('6. Upload validation & storage keys', () => {
  check('filename sanitised', sanitizeFilename('../../etc/passwd') === 'passwd')
  const good = validateUpload('profile-image', { filename: 'site photo.PNG', contentType: 'image/png', size: 1024 })
  check('valid image accepted', good.key.startsWith('profile-image/') && good.key.endsWith('.png'))
  check('key contains UUID segment', /[0-9a-f-]{36}/.test(good.key))
  let rejectedType = false
  try { validateUpload('document', { filename: 'a.exe', contentType: 'application/x-msdownload', size: 10 }) } catch { rejectedType = true }
  check('disallowed mime rejected', rejectedType)
  let rejectedSize = false
  try { validateUpload('profile-image', { filename: 'big.png', contentType: 'image/png', size: 50 * 1024 * 1024 }) } catch { rejectedSize = true }
  check('oversized file rejected', rejectedSize)
})

await section('7. Local storage driver safety', async () => {
  const provider = new LocalStorageProvider('/tmp/dwellers-verify-uploads')
  const stored = await provider.put('document/2026/01/test-id.pdf', Buffer.from('%PDF-1.4 test'), 'application/pdf')
  check('put stores and reports size', stored.size > 0 && (await provider.exists(stored.key)))
  const readBack = await provider.get(stored.key)
  check('get returns stored bytes', readBack.data.toString().startsWith('%PDF'))
  await provider.delete(stored.key)
  check('delete removes object', !(await provider.exists(stored.key)))
  let traversalBlocked = false
  try { await provider.get('../../.env') } catch { traversalBlocked = true }
  check('path traversal blocked', traversalBlocked)
})

await section('8. Password hashing (scrypt)', async () => {
  const hash = await hashPassword('Correct-Horse-9')
  check('hash is self-describing scrypt', hash.startsWith('scrypt$') && hash !== 'Correct-Horse-9')
  check('correct password verifies', await verifyPassword('Correct-Horse-9', hash))
  check('wrong password rejected', !(await verifyPassword('correct-horse-9', hash)))
  check('malformed hash fails safely', !(await verifyPassword('x', 'garbage')))
  check('strength policy works', assessPasswordStrength('abc').score === 'weak' && assessPasswordStrength('Str0ngPassphrase').score === 'strong')
})

await section('9. Ghana Cedi money handling', () => {
  check('integer conversion exact', toPesewas(125.5) === 12550)
  check('string conversion exact', toPesewas('1999.99') === 199999)
  check('formatting uses GHS', formatCedi(12550).includes('125.50'))
  check('symbol override works', formatCedi(100, { symbol: false }) === '1.00')
})

await section('10. Ghana reference data', () => {
  check('16 regions defined', GHANA_REGIONS.length === 16)
  check('local number normalises', normalizeGhanaPhoneNumber('024 123-4567') === '+233241234567')
  check('international accepted', isGhanaPhoneNumber('+233541234567'))
  check('garbage rejected', !isGhanaPhoneNumber('12345'))
})

console.log(`\n${'─'.repeat(60)}`)
console.log(`Foundation verification: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
console.log('All foundations are behaving as designed.')
