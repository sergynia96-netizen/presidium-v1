'use client'

import { useEffect } from 'react'
import { useSession, signIn as nextAuthSignIn } from 'next-auth/react'
import { useAppStore } from '@/store/use-app-store'
import type { User } from '@/types'

/**
 * Syncs Zustand auth state with NextAuth session.
 * When a NextAuth session exists, it updates the Zustand store
 * with the real user data from the server.
 */
export function useAuthSync() {
  const { data: session, status } = useSession()
  const isAuthenticated = useAppStore((s) => s.isAuthenticated)
  const user = useAppStore((s) => s.user)

  useEffect(() => {
    if (status === 'loading') return

    if (status === 'authenticated' && session?.user) {
      const zustandUser: User = {
        id: session.user.id as string,
        name: session.user.name || '',
        email: session.user.email || '',
        avatar: ((session.user as Record<string, unknown>).avatar as string) || '',
        status: 'online',
        pinEnabled: false,
      }

      // Only update if not already synced
      if (!isAuthenticated || user?.id !== zustandUser.id) {
        useAppStore.setState({
          isAuthenticated: true,
          user: zustandUser,
          currentView: 'chats',
          onboardingStep: 'welcome',
        })
      }
    }

    if (status === 'unauthenticated' && isAuthenticated) {
      // Session expired on server but client thinks it's authenticated
      // Only logout if there's no pending registration (user is mid-onboarding)
      const pending = useAppStore.getState().pendingRegistration
      if (!pending) {
        useAppStore.setState({
          isAuthenticated: false,
          user: null,
          currentView: 'onboarding',
          onboardingStep: 'welcome',
          activeChatId: null,
        })
      }
    }
  }, [session, status, isAuthenticated, user?.id])

  // Expose signIn function that uses NextAuth credentials provider
  const signInWithEmailPassword = async (email: string, password: string) => {
    const result = await nextAuthSignIn('credentials', {
      email,
      password,
      redirect: false,
    })
    return result
  }

  return { signInWithEmailPassword, session, status }
}
