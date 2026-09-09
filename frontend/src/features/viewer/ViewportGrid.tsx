import { StackViewport } from '@/features/viewer/StackViewport'
import type { ViewportMeta } from '@/features/viewer/ViewportCorners'
import { useViewerStore, type ViewportLayout } from '@/stores/viewer-store'
import { cn } from '@/lib/utils'

function layoutClass(layout: ViewportLayout): string {
  if (layout === '1x2') return 'grid-cols-2 grid-rows-1'
  if (layout === '2x2') return 'grid-cols-2 grid-rows-2'
  return 'grid-cols-1 grid-rows-1'
}

function cellCount(layout: ViewportLayout): number {
  if (layout === '1x2') return 2
  if (layout === '2x2') return 4
  return 1
}

/**
 * Simple hanging protocol (FE-3): 1×1 / 1×2 / 2×2 cells sharing the same series & store
 * overlays. Only the active cell receives pointer / wheel input.
 */
export function ViewportGrid({
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
  const layout = useViewerStore((s) => s.viewportLayout)
  const activeId = useViewerStore((s) => s.activeViewportId)
  const setActiveViewportId = useViewerStore((s) => s.setActiveViewportId)
  const n = cellCount(layout)

  return (
    <div
      className={cn('grid min-h-0 flex-1 gap-px bg-border', layoutClass(layout), className)}
      data-testid="viewport-grid"
      data-layout={layout}
    >
      {Array.from({ length: n }, (_, id) => {
        const active = id === activeId
        return (
          <div
            key={id}
            className={cn(
              'relative min-h-0 min-w-0 bg-black',
              n > 1 && active && 'ring-2 ring-brand ring-inset',
            )}
            data-testid={`viewport-cell-${id}`}
            data-active={active}
            onMouseDown={() => {
              if (!active) setActiveViewportId(id)
            }}
          >
            <StackViewport
              seriesUid={seriesUid}
              sliceCount={sliceCount}
              meta={meta}
              spacing={spacing}
              interactive={active}
              className="h-full w-full"
              compactCorners={n > 1}
            />
          </div>
        )
      })}
    </div>
  )
}
