import type { ReactNode } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { formatPercent } from '@/lib/format'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { detectionColor } from '@/features/viewer/core'
import { cn } from '@/lib/utils'
import type { InferenceResult } from '@/types/api'

export type FindingKind = 'mask' | 'box' | 'prediction'
export type FindingReviewStatus = 'pending' | 'accepted' | 'rejected' | 'corrected'

export interface Finding {
  id: string
  kind: FindingKind
  label: string
  score: number
  scoreKind: 'dice' | 'confidence' | 'probability'
  color?: string
  sliceIndex?: number | null
  meta?: string
  maskLabelId?: number
}

const REVIEW_LABEL: Record<FindingReviewStatus, string> = {
  pending: '待审',
  accepted: '已接受',
  rejected: '已拒绝',
  corrected: '已修正',
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
      scoreKind: 'dice',
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
      scoreKind: 'confidence',
      color: detectionColor(b.label, items.length),
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
      scoreKind: 'probability',
      meta: '分类',
    })
  }

  return items.sort((a, b) => b.score - a.score)
}

function scoreCaption(kind: Finding['scoreKind']): string {
  if (kind === 'dice') return 'Dice'
  if (kind === 'confidence') return '置信度'
  return '概率'
}

export function FindingsList({
  findings,
  enabledMaskIds,
  onToggleMask,
  onJump,
  highlightedId,
  hoveredId,
  onHover,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  reviews,
  onReviewChange,
}: {
  findings: Finding[]
  enabledMaskIds: number[]
  onToggleMask: (labelId: number) => void
  onJump: (finding: Finding) => void
  highlightedId?: string | null
  hoveredId?: string | null
  onHover?: (id: string | null) => void
  selectedIds?: string[]
  onToggleSelect?: (id: string) => void
  onSelectAll?: (ids: string[]) => void
  reviews?: Record<string, FindingReviewStatus>
  onReviewChange?: (id: string, status: FindingReviewStatus) => void
}) {
  if (!findings.length) {
    return <p className="text-xs text-muted">暂无 findings</p>
  }

  const selectable = typeof onToggleSelect === 'function'
  const selected = new Set(selectedIds ?? [])
  const allSelected = findings.length > 0 && findings.every((f) => selected.has(f.id))
  const reviewable = typeof onReviewChange === 'function'

  return (
    <div className="space-y-2" data-testid="findings-list">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-fg-strong">Findings</div>
        {selectable && onSelectAll && (
          <button
            type="button"
            className="text-xs text-muted hover:text-fg"
            data-testid="findings-select-all"
            onClick={() => onSelectAll(allSelected ? [] : findings.map((f) => f.id))}
          >
            {allSelected ? '取消全选' : '全选'}
          </button>
        )}
      </div>
      {findings.map((f) => {
        const active = highlightedId === f.id
        const hovered = hoveredId === f.id
        const maskOn =
          f.kind === 'mask' && f.maskLabelId != null
            ? enabledMaskIds.includes(f.maskLabelId)
            : true
        const checked = selected.has(f.id)
        const review = reviews?.[f.id] ?? 'pending'
        return (
          <div
            key={f.id}
            className={cn(
              'rounded-lg border px-2 py-2 transition-colors',
              active ? 'border-brand bg-brand/10' : hovered ? 'border-brand/50 bg-surface-2' : 'border-border',
              review === 'rejected' && 'opacity-60',
            )}
            data-testid={`finding-${f.kind}`}
            data-review={review}
            onMouseEnter={() => onHover?.(f.id)}
            onMouseLeave={() => onHover?.(null)}
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
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {scoreCaption(f.scoreKind)} {formatPercent(f.score, 0)}
                  </span>
                </div>
                {f.meta && <div className="mt-0.5 text-xs text-muted">{f.meta}</div>}
                <Progress value={f.score} className="mt-1.5 h-1" />
              </button>
            </div>

            {reviewable && (
              <div className="mt-2 flex items-center gap-1" role="group" aria-label={`${f.label} 审阅`}>
                <ReviewButton
                  active={review === 'accepted'}
                  label="接受"
                  testId={`finding-accept-${f.id}`}
                  onClick={() => onReviewChange!(f.id, review === 'accepted' ? 'pending' : 'accepted')}
                  icon={<Check className="h-3 w-3" />}
                  tone="success"
                />
                <ReviewButton
                  active={review === 'rejected'}
                  label="拒绝"
                  testId={`finding-reject-${f.id}`}
                  onClick={() => onReviewChange!(f.id, review === 'rejected' ? 'pending' : 'rejected')}
                  icon={<X className="h-3 w-3" />}
                  tone="danger"
                />
                <ReviewButton
                  active={review === 'corrected'}
                  label="修正"
                  testId={`finding-correct-${f.id}`}
                  onClick={() =>
                    onReviewChange!(f.id, review === 'corrected' ? 'pending' : 'corrected')
                  }
                  icon={<Pencil className="h-3 w-3" />}
                  tone="warning"
                />
                <span className="ml-auto text-xs text-muted">{REVIEW_LABEL[review]}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ReviewButton({
  active,
  label,
  testId,
  onClick,
  icon,
  tone,
}: {
  active: boolean
  label: string
  testId: string
  onClick: () => void
  icon: ReactNode
  tone: 'success' | 'danger' | 'warning'
}) {
  const toneClass =
    tone === 'success'
      ? 'border-success/40 text-success data-[on=true]:bg-success/15'
      : tone === 'danger'
        ? 'border-danger/40 text-danger data-[on=true]:bg-danger/15'
        : 'border-warning/40 text-warning data-[on=true]:bg-warning/15'
  return (
    <button
      type="button"
      data-testid={testId}
      data-on={active}
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded border px-1.5 text-xs transition-colors',
        toneClass,
        !active && 'opacity-70 hover:opacity-100',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
