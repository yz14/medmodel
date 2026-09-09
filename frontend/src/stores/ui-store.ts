import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ViewportLayout } from '@/stores/viewer-store'

type Theme = 'dark' | 'light'
export type UiLocale = 'zh' | 'en'
export type WindowPresetId = 'lung' | 'mediastinum' | 'bone' | 'brain' | 'abdomen'

interface UiState {
  sidebarCollapsed: boolean
  /**
   * Non-persisted: while true, App chrome forces collapsed sidebar for viewer pages
   * without writing sidebarCollapsed to localStorage (#6).
   */
  viewerShellActive: boolean
  theme: Theme
  /** FE-5: interface language preference (terms currently zh-first). */
  locale: UiLocale
  /** Preferred W/L preset applied when opening a study. */
  defaultWindowPreset: WindowPresetId
  /** Preferred viewport grid when opening a study. */
  defaultViewportLayout: ViewportLayout
  /** N-F9: CS3D spike is evaluation-only; off by default. */
  experimentalCs3d: boolean
  toggleSidebar: () => void
  setSidebarCollapsed: (v: boolean) => void
  setViewerShellActive: (v: boolean) => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setLocale: (locale: UiLocale) => void
  setDefaultWindowPreset: (id: WindowPresetId) => void
  setDefaultViewportLayout: (layout: ViewportLayout) => void
  setExperimentalCs3d: (v: boolean) => void
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.classList.toggle('light', theme === 'light')
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      viewerShellActive: false,
      theme: 'dark',
      locale: 'zh',
      defaultWindowPreset: 'lung',
      defaultViewportLayout: '1x1',
      experimentalCs3d: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setViewerShellActive: (v) => set({ viewerShellActive: v }),
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },
      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark'
        applyTheme(next)
        set({ theme: next })
      },
      setLocale: (locale) => set({ locale }),
      setDefaultWindowPreset: (id) => set({ defaultWindowPreset: id }),
      setDefaultViewportLayout: (layout) => set({ defaultViewportLayout: layout }),
      setExperimentalCs3d: (v) => set({ experimentalCs3d: v }),
    }),
    {
      name: 'voxflow-ui',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
        locale: state.locale,
        defaultWindowPreset: state.defaultWindowPreset,
        defaultViewportLayout: state.defaultViewportLayout,
        experimentalCs3d: state.experimentalCs3d,
      }),
      onRehydrateStorage: () => (state) => {
        applyTheme(state?.theme ?? 'dark')
      },
    },
  ),
)
