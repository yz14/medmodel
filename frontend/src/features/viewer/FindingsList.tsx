import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { Check, Eye, EyeOff, Pencil, X } from 'lucide-react'
import { formatPercent } from '@/lib/format'
import { findingLabelZh } from '@/features/viewer/findingLabels'
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
  /** Key quantity e.g. ⌀12.3 mm / 45.2 mL */
  metric?: string
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
      metric: vol,
      meta: layers,
      maskLabelId: m.label_id,
    })
  }

  for (const b of result.boxes ?? []) {
    const diam = typeof b.diameter_mm === 'number' ? `⌀${b.diameter_mm.toFixed(1)} mm` : undefined
    items.push({
      id: `box-${b.id}`,
      kind: 'box',
      label: b.label,
      score: b.confidence,
      scoreKind: 'confidence',
      color: detectionColor(b.id || b.label, 0),
      sliceIndex: b.slice_index,
      metric: diam,
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

function sortForSlice(findings: Finding[], currentSlice: number | null | undefined): Finding[] {
  if (currentSlice == null) return findings
  return [...findings].sort((a, b) => {
    const aOn = a.sliceIndex === currentSlice ? 0 : 1
    const bOn = b.sliceIndex === currentSlice ? 0 : 1
    if (aOn !== bOn) return aOn - bOn
    return b.score - a.score
  })
}

/** Dual probability strip for Benign / Malignant style pairs (#22/#17). */
function ClassificationStrip({ findings }: { findings: Finding[] }) {
  const preds = findings.filter((f) => f.kind === 'prediction')
  if (preds.length < 2) return null
  const benign = preds.find((p) => /benign|良性/i.test(p.label))
  const malignant = preds.find((p) => /malignant|恶性/i.test(p.label))
  if (!benign || !malignant) return null
  const b = Math.max(0, Math.min(1, benign.score))
  const m = Math.max(0, Math.min(1, malignant.score))
  const sum = b + m || 1
  const bPct = (b / sum) * 100
  const mPct = (m / sum) * 100

  return (
    <div
      className="rounded-lg border border-border bg-surface-0 p-2.5"
      data-testid="classification-strip"
    >
      <div className="mb-1.5 flex justify-between text-[11px] text-muted">
        <span>
          {findingLabelZh(benign.label)} {formatPercent(benign.score, 0)}
        </span>
        <span>
          {findingLabelZh(malignant.label)} {formatPercent(malignant.score, 0)}
        </span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="bg-emerald-500/80" style={{ width: `${bPct}%` }} />
        <div className="bg-rose-500/80" style={{ width: `${mPct}%` }} />
      </div>
    </div>
  )
}

export function FindingsList({
  findings,
  currentSliceIndex,
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
  /** Pin findings on this slice to the top (#17). */
  currentSliceIndex?: number | null
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
  const ordered = useMemo(
    () => sortForSlice(findings, currentSliceIndex),
    [findings, currentSliceIndex],
  )

  if (!findings.length) {
    return <p className="text-xs text-muted">暂无检出</p>
  }

  const selectable = typeof onToggleSelect === 'function'
  const selected = new Set(selectedIds ?? [])
  const allSelected = findings.length > 0 && findings.every((f) => selected.has(f.id))
  const reviewable = typeof onReviewChange === 'function'

  return (
    <div className="space-y-2" data-testid="findings-list">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-fg-strong">
          检出
          <span className="ml-1 tabular-nums text-muted">({findings.length})</span>
        </div>
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

      <ClassificationStrip findings={findings} />

      {ordered.map((f) => {
        const active = highlightedId === f.id
        const hovered = hoveredId === f.id
        const onCurrentSlice =
          currentSliceIndex != null && f.sliceIndex === currentSliceIndex
        const maskOn =
          f.kind === 'mask' && f.maskLabelId != null
            ? enabledMaskIds.includes(f.maskLabelId)
            : true
        const checked = selected.has(f.id)
        const review = reviews?.[f.id] ?? 'pending'
        const color = f.color ?? 'var(--brand)'
        const showActions = reviewable && (hovered || active || review !== 'pending')

        return (
          <div
            key={f.id}
            className={cn(
              'group relative overflow-hidden rounded-lg border transition-colors',
              active
                ? 'border-brand bg-brand/10'
                : onCurrentSlice
                  ? 'border-brand/40 bg-surface-0'
                  : hovered
                    ? 'border-border bg-surface-2'
                    : 'border-border bg-surface-0',
              review === 'rejected' && 'opacity-55',
            )}
            data-testid={`finding-${f.kind}`}
            data-review={review}
            onMouseEnter={() => onHover?.(f.id)}
            onMouseLeave={() => onHover?.(null)}
          >
            <div className="flex">
              <div className="w-1 shrink-0 self-stretch" style={{ background: color }} aria-hidden />
              <div className="min-w-0 flex-1 px-2 py-2">
                <div className="flex items-start gap-2">
                  {selectable && (
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--brand)]"
                      checked={checked}
                      aria-label={`勾选 ${findingLabelZh(f.label)}`}
                      data-testid={`finding-select-${f.id}`}
                      onChange={() => onToggleSelect!(f.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}

                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => onJump(f)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-medium text-fg-strong">
                        {findingLabelZh(f.label)}
                      </span>
                      {typeof f.sliceIndex === 'number' && (
                        <span
                          className={cn(
                            'shrink-0 rounded px-1 py-px text-[10px] tabular-nums',
                            onCurrentSlice
                              ? 'bg-brand/20 text-brand'
                              : 'bg-surface-2 text-muted',
                          )}
                        >
                          层 {f.sliceIndex + 1}
                        </span>
                      )}
                      {review !== 'pending' && (
                        <span className="shrink-0 text-[10px] text-muted">
                          {REVIEW_LABEL[review]}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                      {f.metric && <span className="tabular-nums text-fg/80">{f.metric}</span>}
                      <span className="tabular-nums">
                        {scoreCaption(f.scoreKind)} {formatPercent(f.score, 0)}
                      </span>
                      {f.meta && <span>{f.meta}</span>}
                    </div>
                  </button>

                  {f.kind === 'mask' && f.maskLabelId != null && (
                    <button
                      type="button"
                      className="shrink-0 rounded p-1 text-muted opacity-0 transition-opacity hover:bg-surface-2 hover:text-fg group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={maskOn ? `隐藏 ${findingLabelZh(f.label)}` : `显示 ${findingLabelZh(f.label)}`}
                      aria-pressed={maskOn}
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleMask(f.maskLabelId!)
                      }}
                    >
                      {maskOn ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>

                {showActions && (
                  <div
                    className="mt-1.5 flex items-center gap-1"
                    role="group"
                    aria-label={`${findingLabelZh(f.label)} 审阅`}
                  >
                    <ReviewButton
                      active={review === 'accepted'}
                      label="接受"
                      testId={`finding-accept-${f.id}`}
                      onClick={() =>
                        onReviewChange!(f.id, review === 'accepted' ? 'pending' : 'accepted')
                      }
                      icon={<Check className="h-3 w-3" />}
                      tone="success"
                    />
                    <ReviewButton
                      active={review === 'rejected'}
                      label="拒绝"
                      testId={`finding-reject-${f.id}`}
                      onClick={() =>
                        onReviewChange!(f.id, review === 'rejected' ? 'pending' : 'rejected')
                      }
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
                  </div>
                )}
              </div>
            </div>
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
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
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
