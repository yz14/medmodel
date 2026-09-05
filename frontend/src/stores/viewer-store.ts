import { create } from 'zustand'
import type { InferenceResult } from '@/types/api'

export type ViewerTool = 'scroll' | 'wwwc' | 'pan' | 'zoom' | 'length'

export interface LengthMeasurement {
  id: string
  sliceIndex: number
  x1: number
  y1: number
  x2: number
  y2: number
}

interface ViewerState {
  seriesUid: string | null
  sliceIndex: number
  windowWidth: number
  windowCenter: number
  invert: boolean
  zoom: number
  panX: number
  panY: number
  zoomOriginX: number
  zoomOriginY: number
  tool: ViewerTool
  maskOpacity: number
  showMasks: boolean
  showBoxes: boolean
  enabledMaskIds: number[]
  measurements: LengthMeasurement[]
  draftLength: { x: number; y: number } | null
  selectedModelId: string | null
  activeTaskId: string | null
  result: InferenceResult | null
  setSeriesUid: (uid: string | null) => void
  setSliceIndex: (idx: number | ((prev: number) => number)) => void
  setWindow: (width: number, center: number) => void
  setInvert: (v: boolean) => void
  setZoom: (z: number) => void
  setPan: (x: number, y: number) => void
  setZoomOrigin: (x: number, y: number) => void
  setTool: (t: ViewerTool) => void
  setMaskOpacity: (v: number) => void
  setShowMasks: (v: boolean) => void
  setShowBoxes: (v: boolean) => void
  setEnabledMaskIds: (ids: number[]) => void
  toggleMaskId: (id: number) => void
  addMeasurement: (m: LengthMeasurement) => void
  setDraftLength: (p: { x: number; y: number } | null) => void
  clearMeasurements: () => void
  setSelectedModelId: (id: string | null) => void
  setActiveTaskId: (id: string | null) => void
  setResult: (result: InferenceResult | null) => void
  resetViewTransform: () => void
  resetViewer: () => void
}

const defaults = {
  seriesUid: null as string | null,
  sliceIndex: 0,
  windowWidth: 1500,
  windowCenter: -600,
  invert: false,
  zoom: 1,
  panX: 0,
  panY: 0,
  zoomOriginX: 0.5,
  zoomOriginY: 0.5,
  tool: 'scroll' as ViewerTool,
  maskOpacity: 0.45,
  showMasks: true,
  showBoxes: true,
  enabledMaskIds: [] as number[],
  measurements: [] as LengthMeasurement[],
  draftLength: null as { x: number; y: number } | null,
  selectedModelId: null as string | null,
  activeTaskId: null as string | null,
  result: null as InferenceResult | null,
}

export const useViewerStore = create<ViewerState>((set, get) => ({
  ...defaults,
  setSeriesUid: (uid) =>
    set({
      seriesUid: uid,
      sliceIndex: 0,
      panX: 0,
      panY: 0,
      zoom: 1,
      measurements: [],
      draftLength: null,
      result: null,
      activeTaskId: null,
      enabledMaskIds: [],
    }),
  setSliceIndex: (idx) =>
    set((state) => {
      const next = typeof idx === 'function' ? idx(state.sliceIndex) : idx
      return { sliceIndex: Math.max(0, next) }
    }),
  setWindow: (width, center) => set({ windowWidth: width, windowCenter: center }),
  setInvert: (v) => set({ invert: v }),
  setZoom: (z) => set({ zoom: Math.min(8, Math.max(0.25, z)) }),
  setPan: (x, y) => set({ panX: x, panY: y }),
  setZoomOrigin: (x, y) => set({ zoomOriginX: x, zoomOriginY: y }),
  setTool: (t) => set({ tool: t, draftLength: null }),
  setMaskOpacity: (v) => set({ maskOpacity: v }),
  setShowMasks: (v) => set({ showMasks: v }),
  setShowBoxes: (v) => set({ showBoxes: v }),
  setEnabledMaskIds: (ids) => set({ enabledMaskIds: ids }),
  toggleMaskId: (id) => {
    const cur = get().enabledMaskIds
    set({
      enabledMaskIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    })
  },
  addMeasurement: (m) => set((s) => ({ measurements: [...s.measurements, m] })),
  setDraftLength: (p) => set({ draftLength: p }),
  clearMeasurements: () => set({ measurements: [], draftLength: null }),
  setSelectedModelId: (id) => set({ selectedModelId: id }),
  setActiveTaskId: (id) => set({ activeTaskId: id }),
  setResult: (result) =>
    set({
      result,
      enabledMaskIds: result?.masks?.map((m) => m.label_id) ?? [],
    }),
  resetViewTransform: () =>
    set({
      zoom: 1,
      panX: 0,
      panY: 0,
      zoomOriginX: 0.5,
      zoomOriginY: 0.5,
      invert: false,
      windowWidth: 1500,
      windowCenter: -600,
    }),
  resetViewer: () => set({ ...defaults }),
}))
