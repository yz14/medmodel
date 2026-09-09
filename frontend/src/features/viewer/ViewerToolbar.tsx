import {
  BoxSelect,
  Contrast,
  Crosshair,
  FlipHorizontal2,
  FlipVertical2,
  Grid2x2,
  Hand,
  LayoutGrid,
  Maximize2,
  MoreHorizontal,
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
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
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
  { id: 'probe', label: '探针', icon: Crosshair, hint: '6 · 像素探针' },
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

/** Editable "current / total" slice field for precise CT navigation (#5). */
function SliceInput({ sliceCount }: { sliceCount: number }) {
  const sliceIndex = useViewerStore((s) => s.sliceIndex)
  const setSliceIndex = useViewerStore((s) => s.setSliceIndex)
  const [draft, setDraft] = useState(String(sliceIndex + 1))

  useEffect(() => {
    setDraft(String(sliceIndex + 1))
  }, [sliceIndex])

  const commit = () => {
    if (!sliceCount) return
    const n = Number.parseInt(draft.replace(/\D/g, ''), 10)
    if (!Number.isFinite(n)) {
      setDraft(String(sliceIndex + 1))
      return
    }
    setSliceIndex(Math.max(0, Math.min(sliceCount - 1, n - 1)))
  }

  return (
    <div className="flex shrink-0 items-center gap-1" aria-label="层导航">
      <input
        type="text"
        inputMode="numeric"
        aria-label="当前层号"
        disabled={!sliceCount}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
            ;(e.target as HTMLInputElement).blur()
          }
          if (e.key === 'Escape') {
            setDraft(String(sliceIndex + 1))
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        className="h-7 w-10 rounded-md border border-border bg-surface-0 px-1 text-center text-xs tabular-nums text-fg outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50"
      />
      <span className="text-xs text-muted">/</span>
      <span className="min-w-[1.75rem] text-xs tabular-nums text-muted">
        {sliceCount || '—'}
      </span>
    </div>
  )
}

export function ViewerToolbar({ sliceCount }: { sliceCount: number }) {
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
  const activePreset =
    WINDOW_PRESETS.find((p) => p.ww === windowWidth && p.wc === windowCenter)?.label ?? '自定义'

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
    <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-border bg-surface-1 px-2">
      {/* Primary tools — always visible */}
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

      <Separator orientation="vertical" className="mx-0.5 h-6" />

      <SliceInput sliceCount={sliceCount} />

      <Separator orientation="vertical" className="mx-0.5 h-6" />

      {/* W/L preset (no sliders — right-drag + corners cover continuous adjust) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 max-w-[7rem] shrink-0 gap-1 px-2 text-xs"
            aria-label="窗宽窗位预设"
          >
            <Contrast className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{activePreset}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel>窗宽窗位预设</DropdownMenuLabel>
          {WINDOW_PRESETS.map((p) => (
            <DropdownMenuItem key={p.id} onSelect={() => setWindow(p.ww, p.wc)}>
              {p.label}
              <span className="ml-auto text-xs text-muted">
                {p.ww}/{p.wc}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex shrink-0 items-center gap-0.5">
        <ToolBtn label="缩小" onClick={() => zoomAboutCenter(0.9)}>
          <ZoomOut className="h-4 w-4" />
        </ToolBtn>
        <span className="w-9 text-center text-xs tabular-nums text-muted">
          {(zoomPct * 100).toFixed(0)}%
        </span>
        <ToolBtn label="放大" onClick={() => zoomAboutCenter(1.1)}>
          <ZoomIn className="h-4 w-4" />
        </ToolBtn>
      </div>

      <div className="flex-1" />

      {/* Overflow: view ops / layout / layers (#1) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="更多视图选项">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>视图</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => window.dispatchEvent(new Event('voxflow:viewer-fit'))}>
            <Maximize2 className="mr-2 h-4 w-4" />
            适应窗口
            <span className="ml-auto text-xs text-muted">F</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => window.dispatchEvent(new Event('voxflow:viewer-1to1'))}>
            <Ratio className="mr-2 h-4 w-4" />
            1:1 像素
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => toggleFlipH()}
            className={cn(flipH && 'text-brand')}
          >
            <FlipHorizontal2 className="mr-2 h-4 w-4" />
            水平翻转
            <span className="ml-auto text-xs text-muted">H</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => toggleFlipV()}
            className={cn(flipV && 'text-brand')}
          >
            <FlipVertical2 className="mr-2 h-4 w-4" />
            垂直翻转
            <span className="ml-auto text-xs text-muted">V</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setInvert(!invert)}
            className={cn(invert && 'text-brand')}
          >
            <SunMoon className="mr-2 h-4 w-4" />
            反色
            <span className="ml-auto text-xs text-muted">I</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              resetViewTransform()
              clearMeasurements()
              window.dispatchEvent(new Event('voxflow:viewer-reset-camera'))
            }}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            重置视图
            <span className="ml-auto text-xs text-muted">R</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>挂片布局</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={viewportLayout}
            onValueChange={(v) => setViewportLayout(v as ViewportLayout)}
          >
            <DropdownMenuRadioItem value="1x1">
              <RectangleVertical className="mr-2 h-4 w-4" />
              单视口
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="1x2">
              <LayoutGrid className="mr-2 h-4 w-4" />
              1×2
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="2x2">
              <Grid2x2 className="mr-2 h-4 w-4" />
              2×2
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>图层</DropdownMenuLabel>
          <DropdownMenuCheckboxItem checked={showMasks} onCheckedChange={(v) => setShowMasks(!!v)}>
            <Scan className="mr-2 h-4 w-4" />
            分割掩膜
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={showBoxes} onCheckedChange={(v) => setShowBoxes(!!v)}>
            <BoxSelect className="mr-2 h-4 w-4" />
            检测框
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={showAnnotations}
            onCheckedChange={(v) => setShowAnnotations(!!v)}
          >
            <Ruler className="mr-2 h-4 w-4" />
            测距标注
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
