import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { renderFrameToCanvas } from '@/features/viewer/dicom-decoder'
import { useFrameStack } from '@/features/viewer/useFrameStack'
import { clearMaskImageCache, paintMaskOverlay } from '@/features/viewer/maskComposite'
import { ViewportCorners, type ViewportMeta } from '@/features/viewer/ViewportCorners'
import { OverlayScreenLabels } from '@/features/viewer/OverlayScreenLabels'
import {
  cameraCssTransform,
  clampImagePoint,
  detectionColor,
  fitCamera,
  buildViewerLayers,
  imageToScreen,
  isCtLike,
  isLayerVisible,
  isNearFit,
  niceScaleBarMm,
  oneToOneCamera,
  panBy,
  relativeZoom,
  resolveInitialWindow,
  screenToImage,
  zoomAt,
} from '@/features/viewer/core'
import { useUiStore } from '@/stores/ui-store'
import { useViewerStore } from '@/stores/viewer-store'
import type { DetectionBox } from '@/types/api'
import { cn } from '@/lib/utils'

function distPointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-6) return Math.hypot(px - x1, py - y1)
  let t = ((px - x1) * dx + (py - y1) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

export function StackViewport({
  seriesUid,
  sliceCount,
  meta,
  spacing,
  className,
  interactive = true,
  compactCorners = false,
}: {
  seriesUid: string
  sliceCount: number
  meta?: ViewportMeta
  spacing?: Array<number | null> | null
  className?: string
  /** FE-3: only the active grid cell handles pointer / wheel. */
  interactive?: boolean
  /** Small multi-viewport cells: only Im + W/L. */
  compactCorners?: boolean
}) {
  const baseRef = useRef<HTMLCanvasElement>(null)
  const maskRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    mode: 'pan' | 'wwwc' | 'zoom' | null
    startX: number
    startY: number
    camera: { scale: number; tx: number; ty: number }
    ww: number
    wc: number
  } | null>(null)
  const [fitNonce, setFitNonce] = useState(0)
  const fittedKeyRef = useRef<string>('')

  const sliceIndex = useViewerStore((s) => s.sliceIndex)
  const setSliceCount = useViewerStore((s) => s.setSliceCount)
  const windowWidth = useViewerStore((s) => s.windowWidth)
  const windowCenter = useViewerStore((s) => s.windowCenter)
  const wlSeededFor = useViewerStore((s) => s.wlSeededFor)
  const markWlSeeded = useViewerStore((s) => s.markWlSeeded)
  const setWindow = useViewerStore((s) => s.setWindow)
  const invert = useViewerStore((s) => s.invert)
  const flipH = useViewerStore((s) => s.flipH)
  const flipV = useViewerStore((s) => s.flipV)
  const camera = useViewerStore((s) => s.camera)
  const fitScale = useViewerStore((s) => s.fitScale)
  const setCamera = useViewerStore((s) => s.setCamera)
  const setFitScale = useViewerStore((s) => s.setFitScale)
  const tool = useViewerStore((s) => s.tool)
  const result = useViewerStore((s) => s.result)
  const activeTaskId = useViewerStore((s) => s.activeTaskId)
  const showBoxes = useViewerStore((s) => s.showBoxes)
  const showMasks = useViewerStore((s) => s.showMasks)
  const showAnnotations = useViewerStore((s) => s.showAnnotations)
  const showCam = useViewerStore((s) => s.showCam)
  const camOpacity = useViewerStore((s) => s.camOpacity)
  const maskOpacity = useViewerStore((s) => s.maskOpacity)
  const enabledMaskIds = useViewerStore((s) => s.enabledMaskIds)
  const measurements = useViewerStore((s) => s.measurements)
  const selectedMeasurementId = useViewerStore((s) => s.selectedMeasurementId)
  const draftLength = useViewerStore((s) => s.draftLength)
  const probeHu = useViewerStore((s) => s.probeHu)
  const probeImagePos = useViewerStore((s) => s.probeImagePos)
  const highlightedFindingId = useViewerStore((s) => s.highlightedFindingId)
  const hoveredFindingId = useViewerStore((s) => s.hoveredFindingId)

  const emphasizeMaskId = useMemo(() => {
    const id = highlightedFindingId
    if (!id?.startsWith('mask-')) return null
    const n = Number(id.slice(5))
    return Number.isFinite(n) ? n : null
  }, [highlightedFindingId])

  const hoverMaskId = useMemo(() => {
    const id = hoveredFindingId
    if (!id?.startsWith('mask-')) return null
    const n = Number(id.slice(5))
    return Number.isFinite(n) ? n : null
  }, [hoveredFindingId])

  const emphasizeBoxId = highlightedFindingId?.startsWith('box-')
    ? highlightedFindingId.slice(4)
    : null
  const hoverBoxId = hoveredFindingId?.startsWith('box-') ? hoveredFindingId.slice(4) : null

  const layers = useMemo(
    () =>
      buildViewerLayers({
        showMasks,
        showBoxes,
        showAnnotations,
        showCam,
        maskOpacity,
        camOpacity,
      }),
    [showMasks, showBoxes, showAnnotations, showCam, maskOpacity, camOpacity],
  )
  const layerMaskOn = isLayerVisible(layers, 'mask')
  const layerBoxesOn = isLayerVisible(layers, 'overlay')
  const layerAnnOn = isLayerVisible(layers, 'annotation')
  const layerCamOn = isLayerVisible(layers, 'cam')

  const { frame, error, loading } = useFrameStack(seriesUid, sliceIndex, sliceCount)

  useEffect(() => {
    setSliceCount(sliceCount)
  }, [sliceCount, setSliceCount])

  // #2: W/L seed per series — DICOM → CT preset → percentile auto
  useEffect(() => {
    if (!frame || !seriesUid) return
    if (wlSeededFor === seriesUid) return
    const preferred = useUiStore.getState().defaultWindowPreset
    const resolved = resolveInitialWindow({
      frame,
      modality: meta?.modality,
      preferredPresetId: preferred,
    })
    setWindow(resolved.ww, resolved.wc)
    markWlSeeded(seriesUid)
  }, [frame, seriesUid, wlSeededFor, meta?.modality, setWindow, markWlSeeded])

  useEffect(() => {
    if (!frame || !baseRef.current) return
    renderFrameToCanvas(baseRef.current, frame, windowWidth, windowCenter, invert)
  }, [frame, windowWidth, windowCenter, invert])

  const imageW = frame?.width ?? 0
  const imageH = frame?.height ?? 0
  useEffect(() => {
    const el = stageRef.current
    if (!el || !imageW || !imageH) return

    const imageKey = `${seriesUid}:${imageW}x${imageH}`

    const apply = (forceCamera: boolean) => {
      const rect = el.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return
      const fitted = fitCamera(rect.width, rect.height, imageW, imageH)
      const state = useViewerStore.getState()
      const newImage = !fittedKeyRef.current.startsWith(imageKey)
      const shouldRefit = forceCamera || newImage || isNearFit(state.camera, state.fitScale)

      if (shouldRefit) {
        setCamera(fitted)
        setFitScale(fitted.scale)
        fittedKeyRef.current = `${imageKey}:${fitNonce}`
      }
    }

    apply(true)
    const ro = new ResizeObserver(() => apply(false))
    ro.observe(el)
    return () => ro.disconnect()
  }, [imageW, imageH, seriesUid, fitNonce, setCamera, setFitScale])

  useEffect(() => {
    clearMaskImageCache()
    return () => clearMaskImageCache()
  }, [activeTaskId, seriesUid])

  useEffect(() => {
    const canvas = maskRef.current
    if (!canvas || !frame) return
    let cancelled = false

    async function run() {
      if (!layerMaskOn || !activeTaskId || !result?.masks?.length || !enabledMaskIds.length) {
        const ctx = canvas!.getContext('2d')
        if (ctx) {
          canvas!.width = frame!.width
          canvas!.height = frame!.height
          ctx.clearRect(0, 0, frame!.width, frame!.height)
        }
        return
      }
      const url = api.maskFrameUrl(activeTaskId, sliceIndex)
      await paintMaskOverlay(canvas!, {
        url,
        width: frame!.width,
        height: frame!.height,
        masks: result!.masks ?? [],
        enabledIds: enabledMaskIds,
        opacity: maskOpacity,
        emphasizeLabelId: emphasizeMaskId,
        hoverLabelId: hoverMaskId,
        shouldCommit: () => !cancelled,
      })
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [
    frame,
    layerMaskOn,
    activeTaskId,
    result,
    enabledMaskIds,
    maskOpacity,
    sliceIndex,
    emphasizeMaskId,
    hoverMaskId,
  ])

  const boxesOnSlice = useMemo(() => {
    if (!layerBoxesOn || !result?.boxes?.length) return [] as DetectionBox[]
    return result.boxes.filter((b) => b.slice_index == null || b.slice_index === sliceIndex)
  }, [result, layerBoxesOn, sliceIndex])

  const sliceMeasurements = useMemo(
    () => (layerAnnOn ? measurements.filter((m) => m.sliceIndex === sliceIndex) : []),
    [measurements, sliceIndex, layerAnnOn],
  )

  const camUrl = useMemo(() => {
    if (!layerCamOn || !activeTaskId || !result?.cam_overlay_uri) return null
    const named = result.artifacts?.find((a) => /cam/i.test(a.name))?.name
    return api.artifactUrl(activeTaskId, named ?? 'cam.png')
  }, [layerCamOn, activeTaskId, result])

  // Horizontal scale bar uses column spacing (x), not row (y)
  const spacingCol = spacing?.[2] ?? spacing?.[1] ?? 1
  const scaleBarMm = niceScaleBarMm(camera.scale, spacingCol || 1)
  const scaleBarPx = (scaleBarMm / (spacingCol || 1)) * camera.scale
  const zoomPct = relativeZoom(camera, fitScale || camera.scale)

  const probeScreen = useMemo(() => {
    if (!probeImagePos || !frame) return null
    return imageToScreen(
      camera,
      probeImagePos.x,
      probeImagePos.y,
      frame.width,
      frame.height,
      flipH,
      flipV,
    )
  }, [probeImagePos, frame, camera, flipH, flipV])

  useEffect(() => {
    const onFit = () => setFitNonce((n) => n + 1)
    const onOneToOne = () => {
      const el = stageRef.current
      const fr = frame
      if (!el || !fr) return
      const rect = el.getBoundingClientRect()
      const cam = oneToOneCamera(rect.width, rect.height, fr.width, fr.height)
      setCamera(cam)
    }
    const onReset = () => {
      setFitNonce((n) => n + 1)
    }
    window.addEventListener('voxflow:viewer-fit', onFit)
    window.addEventListener('voxflow:viewer-1to1', onOneToOne)
    window.addEventListener('voxflow:viewer-reset-camera', onReset)
    return () => {
      window.removeEventListener('voxflow:viewer-fit', onFit)
      window.removeEventListener('voxflow:viewer-1to1', onOneToOne)
      window.removeEventListener('voxflow:viewer-reset-camera', onReset)
    }
  }, [frame, setCamera])

  useEffect(() => {
    const el = stageRef.current
    if (!el || !interactive) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const state = useViewerStore.getState()
      if (e.ctrlKey || e.metaKey || state.tool === 'zoom') {
        const rect = el.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        const factor = e.deltaY > 0 ? 0.9 : 1.1
        state.updateCamera((cam) => zoomAt(cam, mx, my, factor))
        return
      }
      if (!sliceCount) return
      const delta = e.deltaY > 0 ? 1 : -1
      state.setSliceIndex((prev) => prev + delta)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [sliceCount, interactive])

  useEffect(() => {
    const el = stageRef.current
    if (!el || !frame || !interactive) return

    const imagePointFromEvent = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      const st = useViewerStore.getState()
      const raw = screenToImage(
        st.camera,
        e.clientX - rect.left,
        e.clientY - rect.top,
        frame.width,
        frame.height,
        st.flipH,
        st.flipV,
      )
      return clampImagePoint(raw, frame.width, frame.height)
    }

    const sampleHu = (ix: number, iy: number) => {
      const x = Math.floor(ix)
      const y = Math.floor(iy)
      if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) return null
      return frame.pixels[y * frame.width + x] ?? null
    }

    const hitMeasurement = (ix: number, iy: number, st: ReturnType<typeof useViewerStore.getState>) => {
      const thresh = 8 / Math.max(st.camera.scale, 1e-6)
      let best: { id: string; d: number } | null = null
      for (const m of st.measurements) {
        if (m.sliceIndex !== st.sliceIndex) continue
        const d = distPointToSegment(ix, iy, m.x1, m.y1, m.x2, m.y2)
        if (d <= thresh && (!best || d < best.d)) best = { id: m.id, d }
      }
      return best?.id ?? null
    }

    const onDown = (e: PointerEvent) => {
      const st = useViewerStore.getState()
      const t = st.tool

      if (e.button === 1 || t === 'pan' || (e.button === 0 && e.shiftKey)) {
        dragRef.current = {
          mode: 'pan',
          startX: e.clientX,
          startY: e.clientY,
          camera: { ...st.camera },
          ww: st.windowWidth,
          wc: st.windowCenter,
        }
        el.setPointerCapture(e.pointerId)
        return
      }
      if (e.button === 2 || (t === 'wwwc' && e.button === 0)) {
        e.preventDefault()
        dragRef.current = {
          mode: 'wwwc',
          startX: e.clientX,
          startY: e.clientY,
          camera: { ...st.camera },
          ww: st.windowWidth,
          wc: st.windowCenter,
        }
        el.setPointerCapture(e.pointerId)
        return
      }
      if (t === 'zoom' && e.button === 0) {
        dragRef.current = {
          mode: 'zoom',
          startX: e.clientX,
          startY: e.clientY,
          camera: { ...st.camera },
          ww: st.windowWidth,
          wc: st.windowCenter,
        }
        el.setPointerCapture(e.pointerId)
        return
      }
      if (t === 'length' && e.button === 0) {
        const pt = imagePointFromEvent(e)
        const hit = hitMeasurement(pt.x, pt.y, st)
        if (hit && !st.draftLength) {
          st.setSelectedMeasurementId(hit)
          return
        }
        const draft = st.draftLength
        if (!draft) {
          st.setDraftLength(pt)
          st.setSelectedMeasurementId(null)
        } else {
          st.addMeasurement({
            id: `len-${Date.now()}`,
            sliceIndex: st.sliceIndex,
            x1: draft.x,
            y1: draft.y,
            x2: pt.x,
            y2: pt.y,
          })
          st.setDraftLength(null)
        }
        return
      }
      if (t === 'probe' && e.button === 0) {
        const pt = imagePointFromEvent(e)
        const hu = sampleHu(pt.x, pt.y)
        st.setProbe(hu, pt)
      }
    }

    const onMove = (e: PointerEvent) => {
      const st = useViewerStore.getState()
      const drag = dragRef.current

      if (st.tool === 'probe') {
        const pt = imagePointFromEvent(e)
        const hu = sampleHu(pt.x, pt.y)
        st.setProbe(hu, pt)
      }

      if (!drag?.mode) return
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      if (drag.mode === 'pan') {
        st.setCamera(panBy(drag.camera, dx, dy))
      } else if (drag.mode === 'wwwc') {
        st.setWindow(Math.max(1, drag.ww + dx * 2), drag.wc - dy * 2)
      } else if (drag.mode === 'zoom') {
        const rect = el.getBoundingClientRect()
        const mx = drag.startX - rect.left
        const my = drag.startY - rect.top
        const factor = Math.exp(-dy * 0.01)
        st.setCamera(zoomAt(drag.camera, mx, my, factor))
      }
    }

    const onUp = (e: PointerEvent) => {
      dragRef.current = null
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }

    const onContext = (e: Event) => e.preventDefault()

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('contextmenu', onContext)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('contextmenu', onContext)
    }
  }, [frame, tool, interactive])

  useEffect(() => {
    if (!interactive) return
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return
      }
      const st = useViewerStore.getState()
      const toolMap: Record<string, typeof tool> = {
        '1': 'scroll',
        '2': 'wwwc',
        '3': 'pan',
        '4': 'length',
        '5': 'zoom',
        '6': 'probe',
      }
      if (toolMap[e.key]) {
        st.setTool(toolMap[e.key]!)
        return
      }
      if (e.key === 'Escape') {
        st.setDraftLength(null)
        st.setSelectedMeasurementId(null)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && st.selectedMeasurementId) {
        e.preventDefault()
        st.removeMeasurement(st.selectedMeasurementId)
        return
      }
      if (e.key === 'PageDown' || e.key === 'ArrowDown') {
        e.preventDefault()
        st.setSliceIndex((p) => p + 1)
        return
      }
      if (e.key === 'PageUp' || e.key === 'ArrowUp') {
        e.preventDefault()
        st.setSliceIndex((p) => p - 1)
        return
      }
      if (e.key === 'Home') {
        e.preventDefault()
        st.setSliceIndex(0)
        return
      }
      if (e.key === 'End') {
        e.preventDefault()
        st.setSliceIndex(Math.max(0, st.sliceCount - 1))
        return
      }
      if (e.key === 'h' || e.key === 'H') {
        st.toggleFlipH()
        return
      }
      if (e.key === 'v' || e.key === 'V') {
        st.toggleFlipV()
        return
      }
      if (e.key === 'i' || e.key === 'I') {
        st.setInvert(!st.invert)
        return
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        setFitNonce((n) => n + 1)
        return
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        st.resetViewTransform()
        st.clearMeasurements()
        setFitNonce((n) => n + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [interactive])

  const cursor = !interactive
    ? 'default'
    : tool === 'pan'
      ? 'grab'
      : tool === 'wwwc'
        ? 'default'
        : tool === 'length' || tool === 'probe'
          ? 'crosshair'
          : tool === 'zoom'
            ? 'ns-resize'
            : 'default'

  const strokePx = (screenPx: number) => screenPx / Math.max(camera.scale, 1e-6)

  return (
    <div
      ref={stageRef}
      data-testid="stack-viewport"
      className={cn(
        'relative flex h-full min-h-0 w-full items-stretch justify-stretch overflow-hidden bg-black',
        className,
      )}
      style={{ cursor }}
    >
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 text-sm text-white/80">
          解码影像中…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-6 text-center text-sm text-danger">
          {error}
        </div>
      )}

      {frame && (
        <div
          className="absolute left-0 top-0"
          style={{
            width: frame.width,
            height: frame.height,
            transform: cameraCssTransform(camera, frame.width, frame.height, flipH, flipV),
            transformOrigin: '0 0',
            willChange: 'transform',
          }}
        >
          <canvas
            ref={baseRef}
            width={frame.width}
            height={frame.height}
            className="block"
            style={{ width: frame.width, height: frame.height }}
          />
          {camUrl && (
            <img
              src={camUrl}
              alt=""
              className="pointer-events-none absolute left-0 top-0"
              style={{
                width: frame.width,
                height: frame.height,
                opacity: camOpacity,
                mixBlendMode: 'screen',
              }}
              draggable={false}
            />
          )}
          <canvas
            ref={maskRef}
            className="pointer-events-none absolute left-0 top-0"
            style={{ width: frame.width, height: frame.height }}
          />
          {/* Image-space geometry only — labels are screen-space (#3) */}
          <svg
            className="pointer-events-none absolute left-0 top-0"
            width={frame.width}
            height={frame.height}
            viewBox={`0 0 ${frame.width} ${frame.height}`}
          >
            {boxesOnSlice.map((box, bi) => {
              const bbox = box.bbox
              if (!bbox || bbox.length < 4) return null
              const [x, y, w, h] = bbox
              const color = detectionColor(box.label, bi)
              const selected = emphasizeBoxId === box.id
              const hovered = hoverBoxId === box.id
              const dimmed = Boolean(emphasizeBoxId && !selected)
              const sw = strokePx(selected ? 2.5 : hovered ? 2 : 1.5)
              return (
                <g key={box.id} opacity={dimmed ? 0.35 : 1}>
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill={selected || hovered ? `${color}22` : 'none'}
                    stroke={color}
                    strokeWidth={sw}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              )
            })}

            {sliceMeasurements.map((m) => {
              const selected = selectedMeasurementId === m.id
              return (
                <g key={m.id}>
                  <line
                    x1={m.x1}
                    y1={m.y1}
                    x2={m.x2}
                    y2={m.y2}
                    stroke={selected ? '#FBBF24' : '#38BDF8'}
                    strokeWidth={strokePx(selected ? 2.5 : 2)}
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle
                    cx={m.x1}
                    cy={m.y1}
                    r={strokePx(3.5)}
                    fill={selected ? '#FBBF24' : '#38BDF8'}
                  />
                  <circle
                    cx={m.x2}
                    cy={m.y2}
                    r={strokePx(3.5)}
                    fill={selected ? '#FBBF24' : '#38BDF8'}
                  />
                </g>
              )
            })}

            {draftLength && layerAnnOn && (
              <circle cx={draftLength.x} cy={draftLength.y} r={strokePx(4)} fill="#38BDF8" />
            )}
          </svg>
        </div>
      )}

      {frame && (
        <OverlayScreenLabels
          camera={camera}
          imageW={frame.width}
          imageH={frame.height}
          flipH={flipH}
          flipV={flipV}
          boxes={boxesOnSlice}
          measurements={sliceMeasurements}
          selectedMeasurementId={selectedMeasurementId}
          spacing={spacing}
        />
      )}

      {/* Probe crosshair — screen space (#24) */}
      {tool === 'probe' && probeScreen && (
        <div
          className="pointer-events-none absolute z-[16]"
          style={{ left: probeScreen.x, top: probeScreen.y }}
        >
          <div className="absolute -left-3 top-0 h-px w-6 bg-sky-300/90" />
          <div className="absolute left-0 -top-3 h-6 w-px bg-sky-300/90" />
          <div className="absolute -left-1 -top-1 h-2 w-2 rounded-full border border-sky-200 bg-sky-400/40" />
        </div>
      )}

      {/* Scale bar — bottom-right above Im (#8) */}
      {frame && scaleBarPx > 20 && (
        <div className="pointer-events-none absolute bottom-12 right-3 z-20">
          <div className="flex flex-col items-end gap-0.5 rounded bg-black/45 px-1.5 py-1 backdrop-blur-[2px]">
            <div className="h-0.5 bg-white/90" style={{ width: scaleBarPx }} />
            <div className="text-[11px] tabular-nums text-white/95">{scaleBarMm} mm</div>
          </div>
        </div>
      )}

      <ViewportCorners
        meta={meta}
        sliceIndex={sliceIndex}
        sliceCount={sliceCount}
        windowWidth={windowWidth}
        windowCenter={windowCenter}
        zoom={zoomPct}
        probeHu={probeHu}
        probeLabel={isCtLike(meta?.modality) ? 'HU' : '值'}
        flipH={flipH}
        flipV={flipV}
        compact={compactCorners}
      />
    </div>
  )
}
