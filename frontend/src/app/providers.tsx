import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'

export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={300} skipDelayDuration={100}>
        {children}
      </TooltipProvider>
    </QueryClientProvider>
  )
}
