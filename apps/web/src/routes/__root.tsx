import { lazy, Suspense } from 'react'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { useTheme } from '@/hooks/useTheme'
import { ReloadPrompt } from '@/components/pwa/ReloadPrompt'
import { InstallPrompt } from '@/components/pwa/InstallPrompt'

// Dev-only, LAZILY imported: the devtools are a devDependency, so a static
// import would break production bundling (where dev deps don't exist).
const TanStackRouterDevtools = import.meta.env.DEV
    ? lazy(() =>
          import('@tanstack/react-router-devtools').then((m) => ({
              default: m.TanStackRouterDevtools,
          })),
      )
    : null

function RootComponent() {
    // Initialize theme on app load
    useTheme()

    return (
        <>
            <Outlet />
            <ReloadPrompt />
            <InstallPrompt />
            {TanStackRouterDevtools !== null && (
                <Suspense fallback={null}>
                    <TanStackRouterDevtools />
                </Suspense>
            )}
        </>
    )
}

export const Route = createRootRoute({
    component: RootComponent,
})
