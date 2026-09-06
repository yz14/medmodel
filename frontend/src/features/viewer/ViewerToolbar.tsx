import {
  BoxSelect,
  Contrast,
  Crosshair,
  FlipHorizontal2,
  FlipVertical2,
  Grid2x2,
  Hand,
  LayoutGrid,
  Layers,
  Maximize2,
  MoveHorizontal,
  Ratio,
  RectangleVertical,
  Ruler,
  RotateCcw,
  Rows3,
  Scan,
  SunMoon,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { WINDOW_PRESETS, relativeZoom, zoomAt } from '@/features/viewer/core'
import { useViewerStore, type ViewerTool, type ViewportLayout } from '@/stores/viewer-store'
import { cn } from '@/lib/utils'

const TOOLS: Array<{ id: ViewerTool; label: string; icon: typeof Hand; hint: string }> = [
  { id: 'scroll', label: '卷帘', icon: Rows3, hint: '1 · 滚轮 / PageUp-Down' },
  { id: 'wwwc', label: '窗宽窗位', icon: Contrast, hint: '2 · 拖动 / 右键' },
  { id: 'pan', label: '平移', icon: Hand, hint: '3 · 拖动 / 中键' },
  { id: 'length', label: '测距', icon: Ruler, hint: '4 · 两点测距' },
  { id: 'zoom', label: '缩放', icon: MoveHorizontal, hint: '5 · Ctrl+滚轮 / 拖动' },
  { id: 'probe', label: '探针', icon: Crosshair, hint: '6 · HU 探针' },
]

function ToolBtn({
  label,
  hint,
  active,
  onClick,
  children,
}: {
  label: string
  hint?: string
  active?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? 'secondary' : 'ghost'}
          size="icon"
          aria-label={label}
          aria-pressed={active}
          className={cn('h-8 w-8', active && 'bg-brand/15 text-brand')}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{hint ?? label}</TooltipContent>
    </Tooltip>
  )
}

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
  const showMasks = useViewerStore((s) => s.showMasks)
  const showBoxes = useViewerStore((s) => s.showBoxes)
  const showAnnotations = useViewerStore((s) => s.showAnnotations)
  const setShowMasks = useViewerStore((s) => s.setShowMasks)
  const setShowBoxes = useViewerStore((s) => s.setShowBoxes)
  const setShowAnnotations = useViewerStore((s) => s.setShowAnnotations)
  const viewportLayout = useViewerStore((s) => s.viewportLayout)
  const setViewportLayout = useViewerStore((s) => s.setViewportLayout)

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
    <div className="flex h-12 items-center gap-1.5 overflow-x-auto border-b border-border bg-surface-1 px-3">
      <div className="min-w-0 max-w-[10rem] shrink truncate text-xs text-muted xl:max-w-[14rem]">
        {patientLabel}
      </div>

      {/* Tools */}
      <div
        className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-surface-0 p-0.5"
        role="group"
        aria-label="工具"
      >
        {TOOLS.map((t) => {
          const Icon = t.icon
          return (
            <ToolBtn
              key={t.id}
              label={t.label}
              hint={t.hint}
              active={tool === t.id}
              onClick={() => setTool(t.id)}
            >
              <Icon className="h-4 w-4" />
            </ToolBtn>
          )
        })}
      </div>

      <Separator orientation="vertical" className="mx-0.5 hidden h-6 sm:block" />

      {/* Slice nav */}
      <div className="flex shrink-0 items-center gap-2" aria-label="层导航">
        <span className="text-xs text-muted">层</span>
        <Slider
          className="w-24 sm:w-28"
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

      <Separator orientation="vertical" className="mx-0.5 hidden h-6 md:block" />

      {/* View */}
      <div
        className="flex shrink-0 items-center gap-0.5"
        role="group"
        aria-label="视图"
      >
        <div className="hidden items-center gap-1.5 lg:flex">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 max-w-[7.5rem]"
                aria-label="窗宽窗位预设"
              >
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

        <ToolBtn label="缩小" onClick={() => zoomAboutCenter(0.9)}>
          <ZoomOut className="h-4 w-4" />
        </ToolBtn>
        <span className="hidden w-10 text-center text-xs tabular-nums text-muted sm:inline">
          {(zoomPct * 100).toFixed(0)}%
        </span>
        <ToolBtn label="放大" onClick={() => zoomAboutCenter(1.1)}>
          <ZoomIn className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn
          label="适应窗口"
          hint="适应窗口 (F)"
          onClick={() => window.dispatchEvent(new Event('voxflow:viewer-fit'))}
        >
          <Maximize2 className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn
          label="1比1"
          hint="1:1 像素"
          onClick={() => window.dispatchEvent(new Event('voxflow:viewer-1to1'))}
        >
          <Ratio className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn label="水平翻转" hint="水平翻转 (H)" active={flipH} onClick={() => toggleFlipH()}>
          <FlipHorizontal2 className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn label="垂直翻转" hint="垂直翻转 (V)" active={flipV} onClick={() => toggleFlipV()}>
          <FlipVertical2 className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn label="反色" hint="反色 (I)" active={invert} onClick={() => setInvert(!invert)}>
          <SunMoon className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn
          label="重置"
          hint="重置视图 (R)"
          onClick={() => {
            resetViewTransform()
            clearMeasurements()
            window.dispatchEvent(new Event('voxflow:viewer-reset-camera'))
          }}
        >
          <RotateCcw className="h-4 w-4" />
        </ToolBtn>
      </div>

      <Separator orientation="vertical" className="mx-0.5 hidden h-6 lg:block" />

      {/* Hanging protocol / layout */}
      <div
        className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-surface-0 p-0.5"
        role="group"
        aria-label="视口布局"
      >
        {(
          [
            { id: '1x1' as ViewportLayout, label: '单视口', icon: RectangleVertical },
            { id: '1x2' as ViewportLayout, label: '1×2', icon: LayoutGrid },
            { id: '2x2' as ViewportLayout, label: '2×2', icon: Grid2x2 },
          ] as const
        ).map((item) => {
          const Icon = item.icon
          return (
            <ToolBtn
              key={item.id}
              label={item.label}
              hint={`挂片布局 ${item.label}`}
              active={viewportLayout === item.id}
              onClick={() => setViewportLayout(item.id)}
            >
              <Icon className="h-4 w-4" />
            </ToolBtn>
          )
        })}
      </div>

      <Separator orientation="vertical" className="mx-0.5 hidden h-6 lg:block" />

      {/* Layers */}
      <div
        className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-surface-0 p-0.5"
        role="group"
        aria-label="图层"
      >
        <span className="hidden px-1.5 text-xs text-muted sm:inline">
          <Layers className="inline h-3.5 w-3.5" />
        </span>
        <ToolBtn
          label="分割掩膜"
          hint="显示 / 隐藏分割掩膜"
          active={showMasks}
          onClick={() => setShowMasks(!showMasks)}
        >
          <Scan className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn
          label="检测框"
          hint="显示 / 隐藏检测框"
          active={showBoxes}
          onClick={() => setShowBoxes(!showBoxes)}
        >
          <BoxSelect className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn
          label="测量"
          hint="显示 / 隐藏测距标注"
          active={showAnnotations}
          onClick={() => setShowAnnotations(!showAnnotations)}
        >
          <Ruler className="h-4 w-4" />
        </ToolBtn>
      </div>
    </div>
  )
}
