import { cn } from '@/lib/utils'

const STAGES = ['preprocess', 'infer', 'postprocess', 'writing'] as const

const STAGE_LABEL: Record<string, string> = {
  preprocess: '预处理',
  infer: '推理',
  postprocess: '后处理',
  writing: '写回',
}

/** Horizontal stage timing bar (C-3 / GitHub Actions style). */
export function StageGantt({
  timings,
  currentStage,
  className,
}: {
  timings?: Record<string, number> | null
  currentStage?: string | null
  className?: string
}) {
  const values = STAGES.map((s) => Number(timings?.[s] ?? 0))
  const total = values.reduce((a, b) => a + b, 0) || 1

  return (
    <div className={cn('space-y-2', className)} data-testid="stage-gantt">
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-2">
        {STAGES.map((stage, i) => {
          const ms = values[i] ?? 0
          const pct = Math.max(ms > 0 ? (ms / total) * 100 : 0, ms > 0 ? 4 : 0)
          const active = currentStage === stage
          return (
            <div
              key={stage}
              title={`${STAGE_LABEL[stage]}: ${ms.toFixed(0)} ms`}
              className={cn(
                'h-full transition-all',
                active ? 'bg-brand' : 'bg-brand/40',
                i > 0 && 'border-l border-surface-0/40',
              )}
              style={{ width: `${pct}%` }}
            />
          )
        })}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STAGES.map((stage, i) => (
          <div key={stage} className="text-[11px]">
            <div
              className={cn(
                'text-muted',
                currentStage === stage && 'font-medium text-brand',
              )}
            >
              {STAGE_LABEL[stage]}
            </div>
            <div className="tabular-nums text-fg">
              {(values[i] ?? 0) > 0 ? `${(values[i] ?? 0).toFixed(0)} ms` : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
