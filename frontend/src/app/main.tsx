import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/index.css'
import { AppProviders } from '@/app/providers'
import { AppRouter } from '@/app/router'
import { useUiStore } from '@/stores/ui-store'

const bootTheme = useUiStore.getState().theme
document.documentElement.classList.toggle('dark', bootTheme === 'dark')
document.documentElement.classList.toggle('light', bootTheme === 'light')

useUiStore.persist.onFinishHydration((state) => {
  const theme = state?.theme ?? 'dark'
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.classList.toggle('light', theme === 'light')
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <AppRouter />
    </AppProviders>
  </StrictMode>,
)
