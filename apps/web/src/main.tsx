import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { Providers } from '@/components/Providers'
import { ErrorFallback } from '@/components/ErrorFallback'
import { routeTree } from './routeTree.gen'
import './index.css'

// Root error boundary (WP-125): any route crash renders a recoverable
// fallback, never a white screen.
const router = createRouter({ routeTree, defaultErrorComponent: ErrorFallback })

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
)
