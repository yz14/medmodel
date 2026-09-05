import { Outlet, useLocation } from 'react-router-dom'
import { AppSidebar } from '@/components/AppSidebar'
import { AppTopbar } from '@/components/AppTopbar'
import { cn } from '@/lib/utils'

export function AppLayout() {
  const location = useLocation()
  const isViewer =
    location.pathname.startsWith('/viewer/') || location.pathname.startsWith('/viewer-cs3d/')

  return (
    <div className="flex h-full min-h-0 bg-surface-0">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {!isViewer && <AppTopbar />}
        <main className={cn('min-h-0 flex-1 overflow-auto', isViewer ? 'p-0' : 'p-6')}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
