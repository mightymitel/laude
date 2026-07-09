import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { useTheme } from '@/hooks/useTheme'

function RootComponent() {
    // Initialize theme on app load
    useTheme()

    return (
        <>
            <Outlet />
            {process.env.NODE_ENV === 'development' && <TanStackRouterDevtools />}
        </>
    )
}

export const Route = createRootRoute({
    component: RootComponent,
})
