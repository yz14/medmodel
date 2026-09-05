import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { renderFrameToCanvas } from '@/features/viewer/dicom-decoder'
import { useFrameStack } from '@/features/viewer/useFrameStack'
import { clearMaskImageCache, paintMaskOverlay } from '@/features/viewer/maskComposite'
import { ViewportCorners, type ViewportMeta } from '@/features/viewer/ViewportCorners'
import {
  cameraCssTransform,
  clampImagePoint,
  fitCamera,
  niceScaleBarMm,
  oneToOneCamera,
  panBy,
  pixelDistanceMm,
  relativeZoom,
  screenToImage,
  zoomAt,
} from '@/features/viewer/core'
import { useViewerStore } from '@/stores/viewer-store'
import type { DetectionBox } from '@/types/api'
import { cn } from '@/lib/utils'

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
    camera: { scale: number; tx: number; ty: number }
    ww: number
    wc: number
  } | null>(null)
  /** Bump to force re-fit after reset / series change. */
  const [fitNonce, setFitNonce] = useState(0)
  const fittedKeyRef = useRef<string>('')

  const sliceIndex = useViewerStore((s) => s.sliceIndex)
  const setSliceCount = useViewerStore((s) => s.setSliceCount)
  const windowWidth = useViewerStore((s) => s.windowWidth)
  const windowCenter = useViewerStore((s) => s.windowCenter)
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
  const maskOpacity = useViewerStore((s) => s.maskOpacity)
  const enabledMaskIds = useViewerStore((s) => s.enabledMaskIds)
  const measurements = useViewerStore((s) => s.measurements)
  const draftLength = useViewerStore((s) => s.draftLength)
  const probeHu = useViewerStore((s) => s.probeHu)

  const { frame, error, loading } = useFrameStack(seriesUid, sliceIndex, sliceCount)

  // Keep store sliceCount in sync for Findings jumps (N-F2)
  useEffect(() => {
    setSliceCount(sliceCount)
  }, [sliceCount, setSliceCount])

  // Seed W/L once from DICOM
  useEffect(() => {
    if (!frame?.windowWidth || !frame.windowCenter) return
    const state = useViewerStore.getState()
    if (state.windowWidth === 1500 && state.windowCenter === -600) {
      state.setWindow(frame.windowWidth, frame.windowCenter)
    }
  }, [frame])

  useEffect(() => {
    if (!frame || !baseRef.current) return
    renderFrameToCanvas(baseRef.current, frame, windowWidth, windowCenter, invert)
  }, [frame, windowWidth, windowCenter, invert])

  // Fit-to-window when image size / series changes or user requests fit (N-F13).
  // Do NOT depend on `frame` identity — slice scroll must not reset the camera.
  const imageW = frame?.width ?? 0
  const imageH = frame?.height ?? 0
  useEffect(() => {
    const el = stageRef.current
    if (!el || !imageW || !imageH) return

    const imageKey = `${seriesUid}:${imageW}x${imageH}`

    const apply = (forceCamera: boolean) => {
      const rect = el.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return
      const cam = fitCamera(rect.width, rect.height, imageW, imageH)
      setFitScale(cam.scale)
      if (forceCamera || !fittedKeyRef.current.startsWith(imageKey)) {
        setCamera(cam)
        fittedKeyRef.current = `${imageKey}:${fitNonce}`
      }
    }

    apply(true)
    const ro = new ResizeObserver(() => apply(false))
    ro.observe(el)
    return () => ro.disconnect()
  }, [imageW, imageH, seriesUid, fitNonce, setCamera, setFitScale])

  // Mask cache dispose on task/series change (N-F4)
  useEffect(() => {
    clearMaskImageCache()
    return () => clearMaskImageCache()
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
  }, [frame, showMasks, activeTaskId, result, enabledMaskIds, maskOpacity, sliceIndex])

  const boxesOnSlice = useMemo(() => {
    if (!showBoxes || !result?.boxes?.length) return [] as DetectionBox[]
    return result.boxes.filter((b) => b.slice_index == null || b.slice_index === sliceIndex)
  }, [result, showBoxes, sliceIndex])

  const sliceMeasurements = useMemo(
    () => measurements.filter((m) => m.sliceIndex === sliceIndex),
    [measurements, sliceIndex],
  )

  const spacingRow = spacing?.[1] ?? 1
  const scaleBarMm = niceScaleBarMm(camera.scale, spacingRow || 1)
  const scaleBarPx = (scaleBarMm / (spacingRow || 1)) * camera.scale
  const zoomPct = relativeZoom(camera, fitScale || camera.scale)

  // Expose fit / 1:1 for toolbar via custom events (avoids prop drilling)
  useEffect(() => {
    const onFit = () => setFitNonce((n) => n + 1)
    const onOneToOne = () => {
      const el = stageRef.current
      const fr = frame
      if (!el || !fr) return
      const rect = el.getBoundingClientRect()
      const cam = oneToOneCamera(rect.width, rect.height, fr.width, fr.height)
      setCamera(cam)
      // keep fitScale as last fit for relative % display
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

  // Wheel: scroll / zoom-at-cursor (N-F3)
  useEffect(() => {
    const el = stageRef.current
    if (!el) return

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
  }, [sliceCount])

  // Pointer: deps only tool + frame presence (N-F5) — live values via getState()
  useEffect(() => {
    const el = stageRef.current
    if (!el || !frame) return

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

    const onDown = (e: PointerEvent) => {
      const st = useViewerStore.getState()
      const t = st.tool

      // Middle = pan; right = wwwc (PACS convention)
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
        const draft = st.draftLength
        if (!draft) {
          st.setDraftLength(pt)
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

      if (st.tool === 'probe' || (!drag && (e.buttons === 0 || st.tool === 'scroll'))) {
        // Live HU probe when probe tool, or soft probe on hover for scroll tool
        if (st.tool === 'probe') {
          const pt = imagePointFromEvent(e)
          const hu = sampleHu(pt.x, pt.y)
          st.setProbe(hu, pt)
        }
      }

      if (!drag?.mode) return
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      if (drag.mode === 'pan') {
        // Screen-space pan (already in screen px — correct at any zoom) (N-F3)
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
  }, [frame, tool])

  // Keyboard: tools, slices, flip, reset (R9)
  useEffect(() => {
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
        setFitNonce((n) => n + 1)
        return
      }
      if (e.key === 'r' || e.key === 'R') {
        st.resetViewTransform()
        st.clearMeasurements()
        setFitNonce((n) => n + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const cursor =
    tool === 'pan'
      ? 'grab'
      : tool === 'wwwc'
        ? 'ns-resize'
        : tool === 'length' || tool === 'probe'
          ? 'crosshair'
          : tool === 'zoom'
            ? 'zoom-in'
            : 'default'

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
          <canvas
            ref={maskRef}
            className="pointer-events-none absolute left-0 top-0"
            style={{ width: frame.width, height: frame.height }}
          />
          <svg
            className="pointer-events-none absolute left-0 top-0"
            width={frame.width}
            height={frame.height}
            viewBox={`0 0 ${frame.width} ${frame.height}`}
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

            {draftLength && <circle cx={draftLength.x} cy={draftLength.y} r={4} fill="#38BDF8" />}
          </svg>
        </div>
      )}

      {/* Scale bar (screen space) */}
      {frame && scaleBarPx > 20 && (
        <div className="pointer-events-none absolute bottom-10 left-1/2 z-20 -translate-x-1/2">
          <div className="flex flex-col items-center gap-0.5 text-[10px] text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            <div className="h-0.5 bg-white/90" style={{ width: scaleBarPx }} />
            <div className="tabular-nums">{scaleBarMm} mm</div>
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
        flipH={flipH}
        flipV={flipV}
      />
    </div>
  )
}

