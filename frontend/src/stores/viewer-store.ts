import { create } from 'zustand'
import { identityCamera, type Camera2D } from '@/features/viewer/core/camera'
import type { InferenceResult } from '@/types/api'

export type ViewerTool = 'scroll' | 'wwwc' | 'pan' | 'zoom' | 'length' | 'probe'

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
  /** Used to clamp setSliceIndex (N-F2). */
  sliceCount: number
  windowWidth: number
  windowCenter: number
  invert: boolean
  flipH: boolean
  flipV: boolean
  /** Absolute camera: image→screen = p*scale + t */
  camera: Camera2D
  /** Last fit-to-window scale (for relative zoom % display). */
  fitScale: number
  tool: ViewerTool
  maskOpacity: number
  showMasks: boolean
  showBoxes: boolean
  /** Length / ROI annotations on the viewport. */
  showAnnotations: boolean
  enabledMaskIds: number[]
  measurements: LengthMeasurement[]
  draftLength: { x: number; y: number } | null
  /** HU under cursor (probe). */
  probeHu: number | null
  probeImagePos: { x: number; y: number } | null
  selectedModelId: string | null
  activeTaskId: string | null
  result: InferenceResult | null
  setSeriesUid: (uid: string | null) => void
  setSliceCount: (n: number) => void
  setSliceIndex: (idx: number | ((prev: number) => number)) => void
  setWindow: (width: number, center: number) => void
  setInvert: (v: boolean) => void
  setFlipH: (v: boolean) => void
  setFlipV: (v: boolean) => void
  toggleFlipH: () => void
  toggleFlipV: () => void
  setCamera: (cam: Camera2D) => void
  updateCamera: (fn: (cam: Camera2D) => Camera2D) => void
  setFitScale: (s: number) => void
  setTool: (t: ViewerTool) => void
  setMaskOpacity: (v: number) => void
  setShowMasks: (v: boolean) => void
  setShowBoxes: (v: boolean) => void
  setShowAnnotations: (v: boolean) => void
  setEnabledMaskIds: (ids: number[]) => void
  toggleMaskId: (id: number) => void
  addMeasurement: (m: LengthMeasurement) => void
  setDraftLength: (p: { x: number; y: number } | null) => void
  clearMeasurements: () => void
  setProbe: (hu: number | null, pos: { x: number; y: number } | null) => void
  setSelectedModelId: (id: string | null) => void
  setActiveTaskId: (id: string | null) => void
  setResult: (result: InferenceResult | null) => void
  /** Soft reset: W/L + flips; camera re-fit is done by viewport. */
  resetViewTransform: () => void
  resetViewer: () => void
}

const defaults = {
  seriesUid: null as string | null,
  sliceIndex: 0,
  sliceCount: 0,
  windowWidth: 1500,
  windowCenter: -600,
  invert: false,
  flipH: false,
  flipV: false,
  camera: identityCamera(),
  fitScale: 1,
  tool: 'scroll' as ViewerTool,
  maskOpacity: 0.45,
  showMasks: true,
  showBoxes: true,
  showAnnotations: true,
  enabledMaskIds: [] as number[],
  measurements: [] as LengthMeasurement[],
  draftLength: null as { x: number; y: number } | null,
  probeHu: null as number | null,
  probeImagePos: null as { x: number; y: number } | null,
  selectedModelId: null as string | null,
  activeTaskId: null as string | null,
  result: null as InferenceResult | null,
}

function clampSlice(idx: number, sliceCount: number): number {
  if (!Number.isFinite(idx)) return 0
  if (sliceCount <= 0) return Math.max(0, Math.floor(idx))
  return Math.max(0, Math.min(sliceCount - 1, Math.floor(idx)))
}

export const useViewerStore = create<ViewerState>((set, get) => ({
  ...defaults,
  setSeriesUid: (uid) =>
    set({
      seriesUid: uid,
      sliceIndex: 0,
      camera: identityCamera(),
      fitScale: 1,
      flipH: false,
      flipV: false,
      measurements: [],
      draftLength: null,
      probeHu: null,
      probeImagePos: null,
      result: null,
      activeTaskId: null,
      enabledMaskIds: [],
    }),
  setSliceCount: (n) =>
    set((state) => {
      const sliceCount = Math.max(0, n)
      return {
        sliceCount,
        sliceIndex: clampSlice(state.sliceIndex, sliceCount),
      }
    }),
  setSliceIndex: (idx) =>
    set((state) => {
      const next = typeof idx === 'function' ? idx(state.sliceIndex) : idx
      return { sliceIndex: clampSlice(next, state.sliceCount) }
    }),
  setWindow: (width, center) => set({ windowWidth: width, windowCenter: center }),
  setInvert: (v) => set({ invert: v }),
  setFlipH: (v) => set({ flipH: v }),
  setFlipV: (v) => set({ flipV: v }),
  toggleFlipH: () => set((s) => ({ flipH: !s.flipH })),
  toggleFlipV: () => set((s) => ({ flipV: !s.flipV })),
  setCamera: (cam) => set({ camera: cam }),
  updateCamera: (fn) => set((s) => ({ camera: fn(s.camera) })),
  setFitScale: (s) => set({ fitScale: s }),
  setTool: (t) => set({ tool: t, draftLength: null }),
  setMaskOpacity: (v) => set({ maskOpacity: v }),
  setShowMasks: (v) => set({ showMasks: v }),
  setShowBoxes: (v) => set({ showBoxes: v }),
  setShowAnnotations: (v) => set({ showAnnotations: v }),
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
  setProbe: (hu, pos) => set({ probeHu: hu, probeImagePos: pos }),
  setSelectedModelId: (id) => set({ selectedModelId: id }),
  setActiveTaskId: (id) => set({ activeTaskId: id }),
  setResult: (result) =>
    set({
      result,
      enabledMaskIds: result?.masks?.map((m) => m.label_id) ?? [],
    }),
  resetViewTransform: () =>
    set({
      invert: false,
      flipH: false,
      flipV: false,
      windowWidth: 1500,
      windowCenter: -600,
      probeHu: null,
      probeImagePos: null,
      // camera re-fit is triggered by viewport (fitEpoch bump via identity reset)
      camera: identityCamera(),
      fitScale: 1,
    }),
  resetViewer: () => set({ ...defaults }),
}))
