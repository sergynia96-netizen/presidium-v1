'use client'

/*
 * CHANGELOG (Codex)
 * 2026-04-17:
 * - Mounted RealtimeListener under providers tree.
 * - Purpose: initialize global realtime subscriptions once for the app lifecycle.
 */

import { ThemeProvider } from 'next-themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { MatrixThemeProvider } from '@/components/shared/matrix-theme-provider'
import { SessionProvider } from 'next-auth/react'
import { E2EProvider } from '@/components/providers/e2e-provider'
import { AccessibilityProvider } from '@/components/providers/accessibility-provider'
import { RealtimeListener } from '@/components/messenger/realtime-listener'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          themes={['light', 'dark', 'matrix']}
          disableTransitionOnChange
        >
          <MatrixThemeProvider>
            <AccessibilityProvider>
              <E2EProvider>
                <RealtimeListener />
                {children}
              </E2EProvider>
            </AccessibilityProvider>
          </MatrixThemeProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  )
}
