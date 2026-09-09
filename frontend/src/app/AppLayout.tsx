import { Suspense, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AppSidebar } from '@/components/AppSidebar'
import { AppTopbar } from '@/components/AppTopbar'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { applyTheme, useUiStore } from '@/stores/ui-store'

function PageFallback() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

export function AppLayout() {
  const location = useLocation()
  const theme = useUiStore((s) => s.theme)
  const setViewerShellActive = useUiStore((s) => s.setViewerShellActive)
  const isViewer =
    location.pathname.startsWith('/viewer/') || location.pathname.startsWith('/viewer-cs3d/')

  // 阅片强制深色：离开阅片页后恢复用户主题
  useEffect(() => {
    if (isViewer) {
      applyTheme('dark')
      return () => applyTheme(useUiStore.getState().theme)
    }
    applyTheme(theme)
  }, [isViewer, theme])

  // #6: force collapsed chrome via non-persisted flag — never write sidebarCollapsed
  useEffect(() => {
    setViewerShellActive(isViewer)
    return () => setViewerShellActive(false)
  }, [isViewer, setViewerShellActive])

  return (
    <div className={cn('flex h-full min-h-0 bg-surface-0', isViewer && 'dark')}>
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {!isViewer && <AppTopbar />}
        <main className={cn('min-h-0 flex-1 overflow-auto', isViewer ? 'p-0' : 'p-6')}>
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
