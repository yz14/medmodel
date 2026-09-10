import { cn } from '@/lib/utils'
import { formatAge, formatPatientName, formatSex } from '@/lib/format'
import { isCtLike, isProjectionModality } from '@/features/viewer/core'

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

const chip =
  'rounded px-1.5 py-0.5 bg-black/45 backdrop-blur-[2px] text-[11px] leading-snug text-white/95'

export function ViewportCorners({
  meta,
  sliceIndex,
  sliceCount,
  windowWidth,
  windowCenter,
  zoom,
  probeHu,
  probeLabel = 'HU',
  flipH,
  flipV,
  compact = false,
  className,
}: {
  meta?: ViewportMeta
  sliceIndex: number
  sliceCount: number
  windowWidth: number
  windowCenter: number
  /** Relative to fit-to-window (1 = 100%). */
  zoom: number
  probeHu?: number | null
  /** CT → HU; MR/DX → 像素值 */
  probeLabel?: string
  flipH?: boolean
  flipV?: boolean
  /** Small grid cells: only Im + W/L (#4 deferred helper). */
  compact?: boolean
  className?: string
}) {
  const modality = meta?.modality
  const showThickness =
    !isProjectionModality(modality) && meta?.sliceThickness != null && Number.isFinite(meta.sliceThickness)
  const showProbe =
    probeHu != null && Number.isFinite(probeHu) && (isCtLike(modality) || !isProjectionModality(modality))

  const sexLabel = formatSex(meta?.patientSex)
  const ageLabel = formatAge(meta?.patientAge)
  const demographics = [
    meta?.patientId,
    sexLabel !== '—' ? sexLabel : null,
    ageLabel !== '—' ? ageLabel : null,
  ]
    .filter(Boolean)
    .join(' · ')

  if (compact) {
    return (
      <div className={cn('pointer-events-none absolute inset-0 z-20', className)}>
        <div className={cn(chip, 'absolute left-2 top-2 tabular-nums')}>
          W/L {Math.round(windowWidth)}/{Math.round(windowCenter)}
        </div>
        <div className={cn(chip, 'absolute bottom-2 right-2 tabular-nums')}>
          层 {sliceCount ? `${sliceIndex + 1}/${sliceCount}` : '—'}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('pointer-events-none absolute inset-0 z-20', className)}>
      <div className={cn('absolute left-3 top-3 space-y-0.5')}>
        <div className={cn(chip, 'font-medium')}>{formatPatientName(meta?.patientName)}</div>
        <div className={cn(chip, 'text-white/80')}>{demographics || '—'}</div>
      </div>

      <div className={cn('absolute right-3 top-3 space-y-0.5 text-right')}>
        <div className={chip}>{meta?.modality || '—'}</div>
        <div className={cn(chip, 'max-w-[220px] truncate text-white/80')}>
          {meta?.studyDescription || '检查'}
        </div>
        <div className={cn(chip, 'max-w-[220px] truncate text-white/80')}>
          {meta?.seriesDescription || '序列'}
        </div>
      </div>

      <div className={cn('absolute bottom-3 left-3 space-y-0.5')}>
        <div className={cn(chip, 'tabular-nums')}>
          W/L: {Math.round(windowWidth)} / {Math.round(windowCenter)}
        </div>
        <div className={cn(chip, 'tabular-nums')}>缩放: {(zoom * 100).toFixed(0)}%</div>
        {showThickness && (
          <div className={cn(chip, 'tabular-nums text-white/80')}>
            层厚: {meta!.sliceThickness!.toFixed(2)} mm
          </div>
        )}
        {(flipH || flipV) && (
          <div className={cn(chip, 'text-white/80')}>
            翻转 {[flipH && '水平', flipV && '垂直'].filter(Boolean).join('+')}
          </div>
        )}
        {showProbe && (
          <div className={cn(chip, 'tabular-nums text-sky-200')}>
            {isCtLike(modality) ? 'HU' : probeLabel}: {Math.round(probeHu!)}
          </div>
        )}
      </div>

      <div className={cn(chip, 'absolute bottom-3 right-3 tabular-nums')}>
        层: {sliceCount ? `${sliceIndex + 1} / ${sliceCount}` : '—'}
      </div>
    </div>
  )
}
