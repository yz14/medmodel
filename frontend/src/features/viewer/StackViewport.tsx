import { useEffect, useMemo, useRef } from 'react'
import { api } from '@/lib/api'
import { renderFrameToCanvas } from '@/features/viewer/dicom-decoder'
import { useFrameStack } from '@/features/viewer/useFrameStack'
import { clearMaskImageCache, paintMaskOverlay } from '@/features/viewer/maskComposite'
import { ViewportCorners, type ViewportMeta } from '@/features/viewer/ViewportCorners'
import { useViewerStore } from '@/stores/viewer-store'
import type { DetectionBox } from '@/types/api'
import { cn } from '@/lib/utils'

function clientToImageCoords(
  el: HTMLElement,
  clientX: number,
  clientY: number,
  imageW: number,
  imageH: number,
): { x: number; y: number } {
  const rect = el.getBoundingClientRect()
  const x = ((clientX - rect.left) / rect.width) * imageW
  const y = ((clientY - rect.top) / rect.height) * imageH
  return { x, y }
}

function pixelDistanceMm(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  spacing?: Array<number | null> | null,
): number {
  const sy = spacing?.[1] ?? 1
  const sx = spacing?.[2] ?? spacing?.[1] ?? 1
  const dx = (x2 - x1) * (sx || 1)
  const dy = (y2 - y1) * (sy || 1)
  return Math.hypot(dx, dy)
}

export function StackViewport({
  seriesUid,
  sliceCount,
  meta,
  spacing,
  className,
}: {
  seriesUid: string
  sliceCount: number
  meta?: ViewportMeta
  spacing?: Array<number | null> | null
  className?: string
}) {
  const baseRef = useRef<HTMLCanvasElement>(null)
  const maskRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    mode: 'pan' | 'wwwc' | 'zoom' | null
    startX: number
    startY: number
    panX: number
    panY: number
    ww: number
    wc: number
    zoom: number
  } | null>(null)

  const sliceIndex = useViewerStore((s) => s.sliceIndex)
  const setSliceIndex = useViewerStore((s) => s.setSliceIndex)
  const windowWidth = useViewerStore((s) => s.windowWidth)
  const windowCenter = useViewerStore((s) => s.windowCenter)
  const setWindow = useViewerStore((s) => s.setWindow)
  const invert = useViewerStore((s) => s.invert)
  const zoom = useViewerStore((s) => s.zoom)
  const setZoom = useViewerStore((s) => s.setZoom)
  const panX = useViewerStore((s) => s.panX)
  const panY = useViewerStore((s) => s.panY)
  const setPan = useViewerStore((s) => s.setPan)
  const zoomOriginX = useViewerStore((s) => s.zoomOriginX)
  const zoomOriginY = useViewerStore((s) => s.zoomOriginY)
  const setZoomOrigin = useViewerStore((s) => s.setZoomOrigin)
  const tool = useViewerStore((s) => s.tool)
  const result = useViewerStore((s) => s.result)
  const activeTaskId = useViewerStore((s) => s.activeTaskId)
  const showBoxes = useViewerStore((s) => s.showBoxes)
  const showMasks = useViewerStore((s) => s.showMasks)
  const maskOpacity = useViewerStore((s) => s.maskOpacity)
  const enabledMaskIds = useViewerStore((s) => s.enabledMaskIds)
  const measurements = useViewerStore((s) => s.measurements)
  const draftLength = useViewerStore((s) => s.draftLength)
  const setDraftLength = useViewerStore((s) => s.setDraftLength)
  const addMeasurement = useViewerStore((s) => s.addMeasurement)

  const { frame, error, loading } = useFrameStack(seriesUid, sliceIndex, sliceCount)

  // Seed W/L once from DICOM
  useEffect(() => {
    if (!frame?.windowWidth || !frame.windowCenter) return
    const state = useViewerStore.getState()
    if (state.windowWidth === 1500 && state.windowCenter === -600) {
      setWindow(frame.windowWidth, frame.windowCenter)
    }
  }, [frame, setWindow])

  useEffect(() => {
    if (!frame || !baseRef.current) return
    renderFrameToCanvas(baseRef.current, frame, windowWidth, windowCenter, invert)
  }, [frame, windowWidth, windowCenter, invert])

  // Pixel mask overlay (A-6)
  useEffect(() => {
    clearMaskImageCache()
  }, [activeTaskId, seriesUid])

  useEffect(() => {
    const canvas = maskRef.current
    if (!canvas || !frame) return
    let cancelled = false

    async function run() {
      if (!showMasks || !activeTaskId || !result?.masks?.length || !enabledMaskIds.length) {
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
      })
      if (cancelled) return
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [
    frame,
    showMasks,
    activeTaskId,
    result,
    enabledMaskIds,
    maskOpacity,
    sliceIndex,
  ])

  const boxesOnSlice = useMemo(() => {
    if (!showBoxes || !result?.boxes?.length) return [] as DetectionBox[]
    return result.boxes.filter((b) => b.slice_index == null || b.slice_index === sliceIndex)
  }, [result, showBoxes, sliceIndex])

  const sliceMeasurements = useMemo(
    () => measurements.filter((m) => m.sliceIndex === sliceIndex),
    [measurements, sliceIndex],
  )

  // Wheel: scroll slices (functional update); Ctrl/Meta+wheel = zoom toward cursor
  useEffect(() => {
    const el = stageRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey || tool === 'zoom') {
        const rect = el.getBoundingClientRect()
        setZoomOrigin((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height)
        const factor = e.deltaY > 0 ? 0.9 : 1.1
        setZoom(useViewerStore.getState().zoom * factor)
        return
      }
      if (!sliceCount) return
      const delta = e.deltaY > 0 ? 1 : -1
      setSliceIndex((prev) => Math.max(0, Math.min(sliceCount - 1, prev + delta)))
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [sliceCount, setSliceIndex, setZoom, setZoomOrigin, tool])

  // Pointer interactions: pan / wwwc / zoom / length
  useEffect(() => {
    const el = stageRef.current
    if (!el || !frame) return

    const onDown = (e: PointerEvent) => {
      if (e.button === 1 || tool === 'pan' || (e.button === 0 && e.shiftKey)) {
        dragRef.current = {
          mode: 'pan',
          startX: e.clientX,
          startY: e.clientY,
          panX,
          panY,
          ww: windowWidth,
          wc: windowCenter,
          zoom,
        }
        el.setPointerCapture(e.pointerId)
        return
      }
      if (tool === 'wwwc' && e.button === 0) {
        dragRef.current = {
          mode: 'wwwc',
          startX: e.clientX,
          startY: e.clientY,
          panX,
          panY,
          ww: windowWidth,
          wc: windowCenter,
          zoom,
        }
        el.setPointerCapture(e.pointerId)
        return
      }
      if (tool === 'zoom' && e.button === 0) {
        const rect = el.getBoundingClientRect()
        setZoomOrigin((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height)
        dragRef.current = {
          mode: 'zoom',
          startX: e.clientX,
          startY: e.clientY,
          panX,
          panY,
          ww: windowWidth,
          wc: windowCenter,
          zoom,
        }
        el.setPointerCapture(e.pointerId)
        return
      }
      if (tool === 'length' && e.button === 0) {
        const imgEl = baseRef.current
        if (!imgEl) return
        const pt = clientToImageCoords(imgEl, e.clientX, e.clientY, frame.width, frame.height)
        const draft = useViewerStore.getState().draftLength
        if (!draft) {
          setDraftLength(pt)
        } else {
          addMeasurement({
            id: `len-${Date.now()}`,
            sliceIndex,
            x1: draft.x,
            y1: draft.y,
            x2: pt.x,
            y2: pt.y,
          })
          setDraftLength(null)
        }
      }
    }

    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag?.mode) return
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      if (drag.mode === 'pan') {
        setPan(drag.panX + dx, drag.panY + dy)
      } else if (drag.mode === 'wwwc') {
        setWindow(Math.max(1, drag.ww + dx * 2), drag.wc - dy * 2)
      } else if (drag.mode === 'zoom') {
        setZoom(drag.zoom * Math.exp(-dy * 0.01))
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

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
    }
  }, [
    frame,
    tool,
    panX,
    panY,
    windowWidth,
    windowCenter,
    zoom,
    sliceIndex,
    setPan,
    setWindow,
    setZoom,
    setZoomOrigin,
    setDraftLength,
    addMeasurement,
  ])

  // Keyboard shortcuts: 1-4 tools, R reset
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return
      }
      const map: Record<string, typeof tool> = {
        '1': 'scroll',
        '2': 'wwwc',
        '3': 'pan',
        '4': 'length',
      }
      if (map[e.key]) {
        useViewerStore.getState().setTool(map[e.key]!)
        return
      }
      if (e.key === 'r' || e.key === 'R') {
        useViewerStore.getState().resetViewTransform()
        useViewerStore.getState().clearMeasurements()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const cursor =
    tool === 'pan' ? 'grab' : tool === 'wwwc' ? 'ns-resize' : tool === 'length' ? 'crosshair' : tool === 'zoom' ? 'zoom-in' : 'default'

  return (
    <div
      ref={stageRef}
      className={cn('relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-black', className)}
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

      <div
        className="relative"
        style={{
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          transformOrigin: `${zoomOriginX * 100}% ${zoomOriginY * 100}%`,
        }}
      >
        <div className="relative inline-block leading-none">
          <canvas ref={baseRef} className="max-h-[min(70vh,100%)] max-w-full" />
          <canvas
            ref={maskRef}
            className="pointer-events-none absolute left-0 top-0 h-full w-full"
          />
          {frame && (
            <svg
              className="pointer-events-none absolute left-0 top-0 h-full w-full"
              viewBox={`0 0 ${frame.width} ${frame.height}`}
              preserveAspectRatio="xMidYMid meet"
            >
              {boxesOnSlice.map((box) => {
                const bbox = box.bbox
                if (!bbox || bbox.length < 4) return null
                const [x, y, w, h] = bbox
                return (
                  <g key={box.id}>
                    <rect
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      fill="none"
                      stroke="#F59E0B"
                      strokeWidth={Math.max(frame.width / 256, 1.5)}
                    />
                    <text
                      x={x}
                      y={Math.max(12, y - 4)}
                      fill="#F59E0B"
                      fontSize={Math.max(10, frame.width / 40)}
                    >
                      {box.label} {(box.confidence * 100).toFixed(0)}%
                    </text>
                  </g>
                )
              })}

              {sliceMeasurements.map((m) => {
                const dist = pixelDistanceMm(m.x1, m.y1, m.x2, m.y2, spacing)
                return (
                  <g key={m.id}>
                    <line x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} stroke="#38BDF8" strokeWidth={2} />
                    <circle cx={m.x1} cy={m.y1} r={3} fill="#38BDF8" />
                    <circle cx={m.x2} cy={m.y2} r={3} fill="#38BDF8" />
                    <text
                      x={(m.x1 + m.x2) / 2}
                      y={(m.y1 + m.y2) / 2 - 6}
                      fill="#38BDF8"
                      fontSize={Math.max(11, frame.width / 42)}
                      textAnchor="middle"
                    >
                      {dist.toFixed(1)} mm
                    </text>
                  </g>
                )
              })}

              {draftLength && (
                <circle cx={draftLength.x} cy={draftLength.y} r={4} fill="#38BDF8" />
              )}
            </svg>
          )}
        </div>
      </div>

      <ViewportCorners
        meta={meta}
        sliceIndex={sliceIndex}
        sliceCount={sliceCount}
        windowWidth={windowWidth}
        windowCenter={windowCenter}
        zoom={zoom}
      />
    </div>
  )
}
