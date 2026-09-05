import { useEffect, useRef, useState } from 'react'
import { buildWadoUriImageIds, ensureCornerstoneInit } from '@/features/viewer/cs3d/useCornerstoneInit'
import { cn } from '@/lib/utils'

const ENGINE_ID = 'voxflow-cs3d-engine'
const VIEWPORT_ID = 'voxflow-cs3d-stack'

type Props = {
  seriesUid: string
  sliceCount: number
  className?: string
}

type CsCore = typeof import('@cornerstonejs/core')

/**
 * Minimal CS3D Stack spike. Dynamic-imports core so the page shell can render
 * even if CS3D fails to boot (dev polyfill / WASM issues).
 */
export function Cs3dStackViewport({ seriesUid, sliceCount, className }: Props) {
  const elementRef = useRef<HTMLDivElement | null>(null)
  const engineRef = useRef<{ destroy: () => void; getViewport: (id: string) => unknown } | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [sliceIndex, setSliceIndex] = useState(0)

  useEffect(() => {
    let cancelled = false
    const el = elementRef.current
    if (!el || sliceCount <= 0) return

    const teardown = () => {
      if (engineRef.current) {
        engineRef.current.destroy()
        engineRef.current = null
      }
    }

    const run = async () => {
      setStatus('loading')
      setError(null)
      try {
        const cs: CsCore = await import('@cornerstonejs/core')
        await ensureCornerstoneInit()
        if (cancelled) return
        teardown()

        const renderingEngine = new cs.RenderingEngine(ENGINE_ID)
        engineRef.current = renderingEngine

        renderingEngine.enableElement({
          viewportId: VIEWPORT_ID,
          type: cs.Enums.ViewportType.STACK,
          element: el,
          defaultOptions: {
            background: [0, 0, 0] as [number, number, number],
          },
        })

        const viewport = renderingEngine.getViewport(VIEWPORT_ID) as {
          setStack: (ids: string[], idx: number) => Promise<void>
          setProperties: (p: unknown) => void
          render: () => void
          getCurrentImageIdIndex: () => number
          setImageIdIndex: (i: number) => Promise<void>
        }
        const imageIds = buildWadoUriImageIds(seriesUid, sliceCount)
        await viewport.setStack(imageIds, 0)
        viewport.setProperties({
          voiRange: { lower: -160, upper: 240 },
        })
        viewport.render()
        if (!cancelled) {
          setSliceIndex(0)
          setStatus('ready')
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('error')
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const engine = engineRef.current
      if (!engine) return
      try {
        const viewport = engine.getViewport(VIEWPORT_ID) as {
          getCurrentImageIdIndex: () => number
          setImageIdIndex: (i: number) => Promise<void>
        }
        const cur = viewport.getCurrentImageIdIndex()
        const next = Math.min(sliceCount - 1, Math.max(0, cur + (e.deltaY > 0 ? 1 : -1)))
        if (next !== cur) {
          void viewport.setImageIdIndex(next)
          setSliceIndex(next)
        }
      } catch {
        // ignore
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    void run()

    return () => {
      cancelled = true
      el.removeEventListener('wheel', onWheel)
      teardown()
    }
  }, [seriesUid, sliceCount])

  return (
    <div className={cn('relative min-h-0 flex-1 bg-black', className)} data-testid="cs3d-viewport">
      <div ref={elementRef} className="h-full w-full" onContextMenu={(e) => e.preventDefault()} />
      <div className="pointer-events-none absolute bottom-2 left-2 max-w-[90%] rounded bg-black/60 px-2 py-1 text-[10px] text-white/80">
        CS3D spike · {status === 'ready' ? `${sliceIndex + 1}/${sliceCount}` : status}
        {error ? ` · ${error}` : ''}
      </div>
    </div>
  )
}
