'use client'

/**
 * Dwellers — Client session provider.
 *
 * Wraps the app in NextAuth's SessionProvider so client components can read
 * the session (useSession) and trigger sign-in/sign-out. Session content is
 * always produced server-side; the client can only read it.
 */
import { SessionProvider } from 'next-auth/react'

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider refetchOnWindowFocus={false}>{children}</SessionProvider>
}
