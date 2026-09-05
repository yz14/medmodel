import { formatPercent } from '@/lib/format'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { InferenceResult } from '@/types/api'

export type FindingKind = 'mask' | 'box' | 'prediction'

export interface Finding {
  id: string
  kind: FindingKind
  label: string
  score: number
  color?: string
  sliceIndex?: number | null
  meta?: string
  maskLabelId?: number
}

/** Unify masks / boxes / predictions into a confidence-sorted findings list (C-2). */
export function buildFindings(result: InferenceResult | null | undefined): Finding[] {
  if (!result) return []
  const items: Finding[] = []

  for (const m of result.masks ?? []) {
    const mid = m.slice_indices?.[Math.floor((m.slice_indices.length || 1) / 2)]
    const sliceIndex = mid ?? m.slice_indices?.[0] ?? null
    const vol =
      typeof m.volume_mm3 === 'number' ? `${(m.volume_mm3 / 1000).toFixed(1)} mL` : undefined
    const layers = `${m.slice_indices?.length ?? 0} 层`
    items.push({
      id: `mask-${m.label_id}`,
      kind: 'mask',
      label: m.label_name,
      score: typeof m.dice === 'number' ? m.dice : 0.9,
      color: m.color,
      sliceIndex,
      meta: [vol, layers].filter(Boolean).join(' · '),
      maskLabelId: m.label_id,
    })
  }

  for (const b of result.boxes ?? []) {
    const diam = typeof b.diameter_mm === 'number' ? `⌀${b.diameter_mm.toFixed(1)} mm` : undefined
    const slice = typeof b.slice_index === 'number' ? `#${b.slice_index + 1}` : undefined
    items.push({
      id: `box-${b.id}`,
      kind: 'box',
      label: b.label,
      score: b.confidence,
      sliceIndex: b.slice_index,
      meta: [diam, slice].filter(Boolean).join(' · '),
    })
  }

  for (const p of result.predictions ?? []) {
    items.push({
      id: `pred-${p.label}`,
      kind: 'prediction',
      label: p.label,
      score: p.probability,
      meta: '分类',
    })
  }

  return items.sort((a, b) => b.score - a.score)
}

export function FindingsList({
  findings,
  enabledMaskIds,
  onToggleMask,
  onJump,
  highlightedId,
  selectedIds,
  onToggleSelect,
}: {
  findings: Finding[]
  enabledMaskIds: number[]
  onToggleMask: (labelId: number) => void
  onJump: (finding: Finding) => void
  highlightedId?: string | null
  selectedIds?: string[]
  onToggleSelect?: (id: string) => void
}) {
  if (!findings.length) {
    return <p className="text-[11px] text-muted">暂无 findings</p>
  }

  const selectable = typeof onToggleSelect === 'function'
  const selected = new Set(selectedIds ?? [])

  return (
    <div className="space-y-2" data-testid="findings-list">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-fg-strong">Findings</div>
        {selectable && (
          <button
            type="button"
            className="text-[10px] text-muted hover:text-fg"
            onClick={() => {
              const allSelected = findings.every((f) => selected.has(f.id))
              for (const f of findings) {
                const isOn = selected.has(f.id)
                if (allSelected ? isOn : !isOn) onToggleSelect!(f.id)
              }
            }}
          >
            {findings.every((f) => selected.has(f.id)) ? '取消全选' : '全选'}
          </button>
        )}
      </div>
      {findings.map((f) => {
        const active = highlightedId === f.id
        const maskOn =
          f.kind === 'mask' && f.maskLabelId != null
            ? enabledMaskIds.includes(f.maskLabelId)
            : true
        const checked = selected.has(f.id)
        return (
          <div
            key={f.id}
            className={cn(
              'rounded-lg border px-2 py-2 transition-colors',
              active ? 'border-brand bg-brand/10' : 'border-border',
            )}
            data-testid={`finding-${f.kind}`}
          >
            <div className="flex items-center gap-2">
              {selectable && (
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-[var(--brand)]"
                  checked={checked}
                  aria-label={`勾选 ${f.label}`}
                  data-testid={`finding-select-${f.id}`}
                  onChange={() => onToggleSelect!(f.id)}
                />
              )}
              {f.kind === 'mask' && f.maskLabelId != null ? (
                <Switch
                  checked={maskOn}
                  onCheckedChange={() => onToggleMask(f.maskLabelId!)}
                  aria-label={`显示 ${f.label}`}
                />
              ) : (
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: f.color ?? 'var(--brand)' }}
                  aria-hidden
                />
              )}
              <button
                type="button"
                className="min-w-0 flex-1 text-left hover:opacity-90"
                onClick={() => onJump(f)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-fg">{f.label}</span>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted">
                    {formatPercent(f.score, 0)}
                  </span>
                </div>
                {f.meta && <div className="mt-0.5 text-[10px] text-muted">{f.meta}</div>}
                <Progress value={f.score} className="mt-1.5 h-1" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
