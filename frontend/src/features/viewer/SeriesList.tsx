import { api } from '@/lib/api'
import { ThumbnailImg } from '@/components/ThumbnailImg'
import { cn } from '@/lib/utils'
import type { SeriesSummary } from '@/types/api'
import { useViewerStore } from '@/stores/viewer-store'

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
      <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted">序列</div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {series.map((s) => {
          const active = s.series_uid === activeUid
          return (
            <button
              key={s.series_uid}
              type="button"
              onClick={() => {
                onSelect(s.series_uid)
                useViewerStore.getState().setSeriesUid(s.series_uid)
              }}
              className={cn(
                'w-full rounded-lg border p-2 text-left transition-colors',
                active ? 'border-brand bg-brand/10' : 'border-border hover:bg-surface-2',
              )}
            >
              <div className="aspect-square overflow-hidden rounded-md bg-black">
                <ThumbnailImg
                  src={api.thumbnailUrl(s.series_uid)}
                  alt={s.description ?? s.series_uid}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="mt-2 truncate text-xs font-medium text-fg-strong">
                {s.description || `Series ${s.series_number ?? ''}`}
              </div>
              <div className="mt-0.5 text-[10px] text-muted">
                {s.modality || '—'} · {s.num_instances} 帧
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
