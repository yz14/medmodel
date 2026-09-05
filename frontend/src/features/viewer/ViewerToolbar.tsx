import {
  Contrast,
  FlipVertical2,
  Hand,
  MoveHorizontal,
  Ruler,
  RotateCcw,
  Rows3,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { useViewerStore, type ViewerTool } from '@/stores/viewer-store'
import { cn } from '@/lib/utils'

const TOOLS: Array<{ id: ViewerTool; label: string; icon: typeof Hand; hint: string }> = [
  { id: 'scroll', label: '卷帘', icon: Rows3, hint: '1 · 滚轮切层' },
  { id: 'wwwc', label: '窗宽窗位', icon: Contrast, hint: '2 · 拖动调 W/L' },
  { id: 'pan', label: '平移', icon: Hand, hint: '3 · 拖动平移' },
  { id: 'length', label: '测距', icon: Ruler, hint: '4 · 两点测距' },
  { id: 'zoom', label: '缩放', icon: MoveHorizontal, hint: 'Ctrl+滚轮 / 拖动' },
]

export function ViewerToolbar({
  sliceCount,
  patientLabel,
}: {
  sliceCount: number
  patientLabel?: string
}) {
  const sliceIndex = useViewerStore((s) => s.sliceIndex)
  const setSliceIndex = useViewerStore((s) => s.setSliceIndex)
  const windowWidth = useViewerStore((s) => s.windowWidth)
  const windowCenter = useViewerStore((s) => s.windowCenter)
  const setWindow = useViewerStore((s) => s.setWindow)
  const invert = useViewerStore((s) => s.invert)
  const setInvert = useViewerStore((s) => s.setInvert)
  const zoom = useViewerStore((s) => s.zoom)
  const setZoom = useViewerStore((s) => s.setZoom)
  const tool = useViewerStore((s) => s.tool)
  const setTool = useViewerStore((s) => s.setTool)
  const resetViewTransform = useViewerStore((s) => s.resetViewTransform)
  const clearMeasurements = useViewerStore((s) => s.clearMeasurements)

  return (
    <div className="flex h-12 items-center gap-2 border-b border-border bg-surface-1 px-3">
      <div className="min-w-0 flex-1 truncate text-xs text-muted">{patientLabel}</div>

      <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-0 p-0.5">
        {TOOLS.map((t) => {
          const Icon = t.icon
          return (
            <Button
              key={t.id}
              variant={tool === t.id ? 'secondary' : 'ghost'}
              size="icon"
              title={t.hint}
              aria-label={t.label}
              className={cn('h-8 w-8', tool === t.id && 'bg-brand/15 text-brand')}
              onClick={() => setTool(t.id)}
            >
              <Icon className="h-4 w-4" />
            </Button>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted">层</span>
        <Slider
          className="w-28"
          min={0}
          max={Math.max(sliceCount - 1, 0)}
          value={sliceIndex}
          onChange={(e) => setSliceIndex(Number(e.target.value))}
          aria-label="切片"
        />
        <span className="w-14 text-right text-[11px] tabular-nums text-fg">
          {sliceCount ? `${sliceIndex + 1}/${sliceCount}` : '—'}
        </span>
      </div>

      <div className="hidden items-center gap-2 lg:flex">
        <span className="text-[11px] text-muted">W</span>
        <Slider
          className="w-20"
          min={1}
          max={4000}
          value={windowWidth}
          onChange={(e) => setWindow(Number(e.target.value), windowCenter)}
          aria-label="窗宽"
        />
        <span className="text-[11px] text-muted">L</span>
        <Slider
          className="w-20"
          min={-1000}
          max={1000}
          value={windowCenter}
          onChange={(e) => setWindow(windowWidth, Number(e.target.value))}
          aria-label="窗位"
        />
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => setZoom(zoom - 0.1)} title="缩小" aria-label="缩小">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setZoom(zoom + 0.1)} title="放大" aria-label="放大">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant={invert ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => setInvert(!invert)}
          title="反色"
          aria-label="反色"
        >
          <FlipVertical2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="重置视图 (R)"
          aria-label="重置"
          onClick={() => {
            resetViewTransform()
            clearMeasurements()
          }}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
