import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { buildFindings } from '@/features/viewer/FindingsList'
import { useViewerStore } from '@/stores/viewer-store'
import { cn } from '@/lib/utils'

/**
 * OHIF-style vertical slice scrubber (#5).
 * Click / drag to navigate; findings appear as color ticks on their layers.
 */
export function SliceScrollbar({
  sliceCount,
  className,
}: {
  sliceCount: number
  className?: string
}) {
  const sliceIndex = useViewerStore((s) => s.sliceIndex)
  const setSliceIndex = useViewerStore((s) => s.setSliceIndex)
  const result = useViewerStore((s) => s.result)
  const setHighlightedFindingId = useViewerStore((s) => s.setHighlightedFindingId)
  const trackRef = useRef<HTMLDivElement>(null)

  const markers = useMemo(() => {
    const findings = buildFindings(result)
    const bySlice = new Map<number, { id: string; color: string }[]>()
    for (const f of findings) {
      if (typeof f.sliceIndex !== 'number' || f.sliceIndex < 0) continue
      const list = bySlice.get(f.sliceIndex) ?? []
      list.push({ id: f.id, color: f.color ?? '#38BDF8' })
      bySlice.set(f.sliceIndex, list)
    }
    return bySlice
  }, [result])

  if (sliceCount <= 1) return null

  const indexFromClientY = (clientY: number) => {
    const el = trackRef.current
    if (!el) return sliceIndex
    const rect = el.getBoundingClientRect()
    const t = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    return Math.round(t * (sliceCount - 1))
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    setSliceIndex(indexFromClientY(e.clientY))
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    setSliceIndex(indexFromClientY(e.clientY))
  }

  const thumbTop = sliceCount > 1 ? (sliceIndex / (sliceCount - 1)) * 100 : 0

  return (
    <div
      className={cn(
        'relative flex h-full w-7 shrink-0 flex-col items-center border-l border-border/60 bg-surface-1/80',
        className,
      )}
      data-testid="slice-scrollbar"
    >
      <div
        ref={trackRef}
        role="slider"
        aria-label="层位"
        aria-valuemin={1}
        aria-valuemax={sliceCount}
        aria-valuenow={sliceIndex + 1}
        aria-orientation="vertical"
        tabIndex={0}
        className="relative mx-auto my-2 w-2.5 flex-1 cursor-ns-resize rounded-full bg-surface-3 outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'PageUp') {
            e.preventDefault()
            setSliceIndex((i) => i - 1)
          } else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
            e.preventDefault()
            setSliceIndex((i) => i + 1)
          } else if (e.key === 'Home') {
            e.preventDefault()
            setSliceIndex(0)
          } else if (e.key === 'End') {
            e.preventDefault()
            setSliceIndex(sliceCount - 1)
          }
        }}
      >
        {/* Finding ticks */}
        {[...markers.entries()].map(([idx, items]) => {
          const top = (idx / (sliceCount - 1)) * 100
          const color = items[0]?.color ?? '#38BDF8'
          return (
            <button
              key={idx}
              type="button"
              title={`层 ${idx + 1} · ${items.length} 检出`}
              aria-label={`跳转到第 ${idx + 1} 层检出`}
              className="absolute left-1/2 z-10 h-1.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-black/40"
              style={{ top: `${top}%`, backgroundColor: color }}
              onClick={(e) => {
                e.stopPropagation()
                setSliceIndex(idx)
                setHighlightedFindingId(items[0]?.id ?? null)
              }}
            />
          )
        })}

        {/* Thumb */}
        <div
          className="pointer-events-none absolute left-1/2 z-20 h-3 w-4 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-brand shadow-sm ring-1 ring-white/30"
          style={{ top: `${thumbTop}%` }}
        />
      </div>

      <div className="pb-2 text-[10px] tabular-nums leading-none text-muted">
        {sliceIndex + 1}
      </div>
    </div>
  )
}
