import { api } from '@/lib/api'
import { ThumbnailImg } from '@/components/ThumbnailImg'
import { cn } from '@/lib/utils'
import type { SeriesSummary } from '@/types/api'

/**
 * Compact series rail (#39): 96px thumb + text, fits 5–10 series without huge scroll.
 * Selection is owned by the parent via onSelect (single source of truth).
 */
export function SeriesList({
  series,
  activeUid,
  onSelect,
}: {
  series: SeriesSummary[]
  activeUid: string | null
  onSelect: (uid: string) => void
}) {
  return (
    <div className="flex h-full flex-col border-r border-border bg-surface-1">
      <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted">
        序列
        <span className="ml-1 tabular-nums text-fg/50">({series.length})</span>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-1.5">
        {series.map((s) => {
          const active = s.series_uid === activeUid
          const title = s.description || `Series ${s.series_number ?? ''}` || '未命名序列'
          return (
            <button
              key={s.series_uid}
              type="button"
              onClick={() => onSelect(s.series_uid)}
              aria-pressed={active}
              className={cn(
                'flex w-full items-stretch gap-2 rounded-md border p-1.5 text-left transition-colors',
                active
                  ? 'border-brand bg-brand/10'
                  : 'border-transparent hover:border-border hover:bg-surface-2',
              )}
            >
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded bg-black">
                <ThumbnailImg
                  src={api.thumbnailUrl(s.series_uid)}
                  alt={title}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="min-w-0 flex-1 py-0.5">
                <div className="line-clamp-2 text-xs font-medium leading-snug text-fg-strong">
                  {title}
                </div>
                <div className="mt-1 text-[11px] tabular-nums text-muted">
                  {s.modality || '—'} · {s.num_instances} 帧
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
