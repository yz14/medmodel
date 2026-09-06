import {
  Contrast,
  Crosshair,
  FlipHorizontal2,
  FlipVertical2,
  Hand,
  Maximize2,
  MoveHorizontal,
  Ratio,
  Ruler,
  RotateCcw,
  Rows3,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { WINDOW_PRESETS, relativeZoom, zoomAt } from '@/features/viewer/core'
import { useViewerStore, type ViewerTool } from '@/stores/viewer-store'
import { cn } from '@/lib/utils'

const TOOLS: Array<{ id: ViewerTool; label: string; icon: typeof Hand; hint: string }> = [
  { id: 'scroll', label: '卷帘', icon: Rows3, hint: '1 · 滚轮 / PageUp-Down' },
  { id: 'wwwc', label: '窗宽窗位', icon: Contrast, hint: '2 · 拖动 / 右键' },
  { id: 'pan', label: '平移', icon: Hand, hint: '3 · 拖动 / 中键' },
  { id: 'length', label: '测距', icon: Ruler, hint: '4 · 两点测距' },
  { id: 'zoom', label: '缩放', icon: MoveHorizontal, hint: '5 · Ctrl+滚轮 / 拖动' },
  { id: 'probe', label: '探针', icon: Crosshair, hint: '6 · HU 探针' },
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
  const flipH = useViewerStore((s) => s.flipH)
  const flipV = useViewerStore((s) => s.flipV)
  const toggleFlipH = useViewerStore((s) => s.toggleFlipH)
  const toggleFlipV = useViewerStore((s) => s.toggleFlipV)
  const camera = useViewerStore((s) => s.camera)
  const fitScale = useViewerStore((s) => s.fitScale)
  const updateCamera = useViewerStore((s) => s.updateCamera)
  const tool = useViewerStore((s) => s.tool)
  const setTool = useViewerStore((s) => s.setTool)
  const resetViewTransform = useViewerStore((s) => s.resetViewTransform)
  const clearMeasurements = useViewerStore((s) => s.clearMeasurements)

  const zoomPct = relativeZoom(camera, fitScale || camera.scale)

  const zoomAboutCenter = (factor: number) => {
    const stage = document.querySelector('[data-testid="stack-viewport"]')
    if (!(stage instanceof HTMLElement)) {
      updateCamera((cam) => zoomAt(cam, 0, 0, factor))
      return
    }
    const rect = stage.getBoundingClientRect()
    updateCamera((cam) => zoomAt(cam, rect.width / 2, rect.height / 2, factor))
  }

  return (
    <div className="flex h-12 items-center gap-2 border-b border-border bg-surface-1 px-3">
      <div className="min-w-0 flex-1 truncate text-xs text-muted">{patientLabel}</div>

      <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-0 p-0.5">
        {TOOLS.map((t) => {
          const Icon = t.icon
          return (
            <Tooltip key={t.id}>
              <TooltipTrigger asChild>
                <Button
                  variant={tool === t.id ? 'secondary' : 'ghost'}
                  size="icon"
                  aria-label={t.label}
                  className={cn('h-8 w-8', tool === t.id && 'bg-brand/15 text-brand')}
                  onClick={() => setTool(t.id)}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t.hint}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">层</span>
        <Slider
          className="w-28"
          min={0}
          max={Math.max(sliceCount - 1, 0)}
          step={1}
          value={[sliceIndex]}
          onValueChange={([v]) => setSliceIndex(v ?? 0)}
          aria-label="切片"
        />
        <span className="w-14 text-right text-xs tabular-nums text-fg">
          {sliceCount ? `${sliceIndex + 1}/${sliceCount}` : '—'}
        </span>
      </div>

      <div className="hidden items-center gap-1.5 lg:flex">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 max-w-[7.5rem]" aria-label="窗宽窗位预设">
              窗位预设
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {WINDOW_PRESETS.map((p) => (
              <DropdownMenuItem key={p.id} onSelect={() => setWindow(p.ww, p.wc)}>
                {p.label} ({p.ww}/{p.wc})
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="hidden items-center gap-2 xl:flex">
        <span className="text-xs text-muted">W</span>
        <Slider
          className="w-20"
          min={1}
          max={4000}
          step={1}
          value={[windowWidth]}
          onValueChange={([v]) => setWindow(v ?? windowWidth, windowCenter)}
          aria-label="窗宽"
        />
        <span className="text-xs text-muted">L</span>
        <Slider
          className="w-20"
          min={-1000}
          max={1000}
          step={1}
          value={[windowCenter]}
          onValueChange={([v]) => setWindow(windowWidth, v ?? windowCenter)}
          aria-label="窗位"
        />
      </div>

      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => zoomAboutCenter(0.9)}
          title="缩小"
          aria-label="缩小"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="hidden w-10 text-center text-xs tabular-nums text-muted sm:inline">
          {(zoomPct * 100).toFixed(0)}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => zoomAboutCenter(1.1)}
          title="放大"
          aria-label="放大"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="适应窗口 (F)"
          aria-label="适应窗口"
          onClick={() => window.dispatchEvent(new Event('voxflow:viewer-fit'))}
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="1:1 像素"
          aria-label="1比1"
          onClick={() => window.dispatchEvent(new Event('voxflow:viewer-1to1'))}
        >
          <Ratio className="h-4 w-4" />
        </Button>
        <Button
          variant={flipH ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => toggleFlipH()}
          title="水平翻转 (H)"
          aria-label="水平翻转"
        >
          <FlipHorizontal2 className="h-4 w-4" />
        </Button>
        <Button
          variant={flipV ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => toggleFlipV()}
          title="垂直翻转 (V)"
          aria-label="垂直翻转"
        >
          <FlipVertical2 className="h-4 w-4" />
        </Button>
        <Button
          variant={invert ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => setInvert(!invert)}
          title="反色 (I)"
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
            window.dispatchEvent(new Event('voxflow:viewer-reset-camera'))
          }}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
