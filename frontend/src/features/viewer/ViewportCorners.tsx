import { cn } from '@/lib/utils'

export interface ViewportMeta {
  patientName?: string | null
  patientId?: string | null
  patientSex?: string | null
  patientAge?: string | null
  studyDescription?: string | null
  seriesDescription?: string | null
  modality?: string | null
  sliceThickness?: number | null
}

export function ViewportCorners({
  meta,
  sliceIndex,
  sliceCount,
  windowWidth,
  windowCenter,
  zoom,
  className,
}: {
  meta?: ViewportMeta
  sliceIndex: number
  sliceCount: number
  windowWidth: number
  windowCenter: number
  zoom: number
  className?: string
}) {
  const corner = 'pointer-events-none absolute text-[11px] leading-relaxed text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]'

  return (
    <div className={cn('pointer-events-none absolute inset-0 z-20', className)}>
      {/* TL — patient */}
      <div className={cn(corner, 'left-3 top-3')}>
        <div className="font-medium">{meta?.patientName || 'Anonymous'}</div>
        <div className="text-white/70">
          {[meta?.patientId, meta?.patientSex, meta?.patientAge].filter(Boolean).join(' · ') || '—'}
        </div>
      </div>

      {/* TR — study / series */}
      <div className={cn(corner, 'right-3 top-3 text-right')}>
        <div>{meta?.modality || '—'}</div>
        <div className="max-w-[220px] truncate text-white/70">{meta?.studyDescription || 'Study'}</div>
        <div className="max-w-[220px] truncate text-white/70">{meta?.seriesDescription || 'Series'}</div>
      </div>

      {/* BL — W/L, zoom, thickness */}
      <div className={cn(corner, 'bottom-3 left-3')}>
        <div className="tabular-nums">
          W/L: {Math.round(windowWidth)} / {Math.round(windowCenter)}
        </div>
        <div className="tabular-nums">Zoom: {(zoom * 100).toFixed(0)}%</div>
        {meta?.sliceThickness != null && (
          <div className="tabular-nums text-white/70">Thk: {meta.sliceThickness.toFixed(2)} mm</div>
        )}
      </div>

      {/* BR — slice */}
      <div className={cn(corner, 'bottom-3 right-3 text-right tabular-nums')}>
        <div>
          Im: {sliceCount ? `${sliceIndex + 1} / ${sliceCount}` : '—'}
        </div>
      </div>
    </div>
  )
}
