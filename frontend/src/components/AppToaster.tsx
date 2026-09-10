import { useLocation } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'

/** Viewer toasts sit bottom-center so they don't cover the AI panel tabs (#13). */
export function AppToaster() {
  const location = useLocation()
  const isViewer =
    location.pathname.startsWith('/viewer/') || location.pathname.startsWith('/viewer-cs3d/')

  return (
    <Toaster
      position={isViewer ? 'bottom-center' : 'top-right'}
      richColors
      closeButton
      duration={isViewer ? 2000 : 4000}
      offset={isViewer ? 16 : 16}
    />
  )
}
