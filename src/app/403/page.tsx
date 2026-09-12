/**
 * Dwellers — Access denied (PART 30).
 * Shown when an authenticated user reaches a route their role cannot access.
 * The server decided this — UI state never faked.
 */
import Link from 'next/link'
import { getAuthContext } from '@/lib/auth/session'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ShieldX } from 'lucide-react'

export const metadata = { title: 'Access denied' }

export default async function ForbiddenPage() {
  const auth = await getAuthContext()

  return (
    <main className="dw-hero-surface flex min-h-[calc(100vh-4rem)] flex-1 items-center justify-center px-4 py-12 sm:px-6">
      <Card className="w-full max-w-md" data-testid="forbidden-card">
        <CardHeader className="items-center text-center">
          <ShieldX className="mb-2 h-10 w-10 text-destructive" aria-hidden="true" />
          <CardTitle>Access denied</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center text-sm text-muted-foreground">
          <p>
            Your account ({auth?.email ?? 'unknown'}) does not have permission to open this area.
            This decision was made by the Dwellers server based on your role.
          </p>
          <p className="text-xs">
            If you believe this is a mistake, contact Dwellers support — staff can review your role.
          </p>
          <div className="flex justify-center gap-2">
            <Button asChild>
              <Link href="/">Back to home</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">My dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
