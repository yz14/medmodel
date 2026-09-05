/** Common CT W/L presets (PACS-style). */
export interface WindowPreset {
  id: string
  label: string
  ww: number
  wc: number
}

export const WINDOW_PRESETS: WindowPreset[] = [
  { id: 'lung', label: '肺窗', ww: 1500, wc: -600 },
  { id: 'mediastinum', label: '纵隔', ww: 350, wc: 40 },
  { id: 'bone', label: '骨窗', ww: 2000, wc: 300 },
  { id: 'brain', label: '脑窗', ww: 80, wc: 40 },
  { id: 'abdomen', label: '腹窗', ww: 400, wc: 40 },
]

export function pixelDistanceMm(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  spacing?: Array<number | null> | null,
): number {
  const sy = spacing?.[1] ?? 1
  const sx = spacing?.[2] ?? spacing?.[1] ?? 1
  const dx = (x2 - x1) * (sx || 1)
  const dy = (y2 - y1) * (sy || 1)
  return Math.hypot(dx, dy)
}

/** Choose a nice round scale-bar length in mm given current camera scale. */
export function niceScaleBarMm(camScale: number, spacingRowMm: number, targetPx = 80): number {
  const mmPerPx = (spacingRowMm || 1) / Math.max(camScale, 1e-6)
  const raw = targetPx * mmPerPx
  const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200]
  return nice.reduce((best, n) => (Math.abs(n - raw) < Math.abs(best - raw) ? n : best), nice[0]!)
}
