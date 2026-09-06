import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'dark' | 'light'

interface UiState {
  sidebarCollapsed: boolean
  theme: Theme
  /** N-F9: CS3D spike is evaluation-only; off by default. */
  experimentalCs3d: boolean
  toggleSidebar: () => void
  setSidebarCollapsed: (v: boolean) => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setExperimentalCs3d: (v: boolean) => void
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.classList.toggle('light', theme === 'light')
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      theme: 'dark',
      experimentalCs3d: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },
      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark'
        applyTheme(next)
        set({ theme: next })
      },
      setExperimentalCs3d: (v) => set({ experimentalCs3d: v }),
    }),
    {
      name: 'voxflow-ui',
      onRehydrateStorage: () => (state) => {
        applyTheme(state?.theme ?? 'dark')
      },
    },
  ),
)
