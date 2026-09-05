import { cn } from '@/lib/utils'

/** Tiny SVG sparkline for KPI cards (C-4). */
export function Sparkline({
  values,
  className,
  tone = 'brand',
}: {
  values: number[]
  className?: string
  tone?: 'brand' | 'success' | 'warning' | 'danger'
}) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const w = 64
  const h = 24
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w
      const y = h - ((v - min) / span) * (h - 2) - 1
      return `${x},${y}`
    })
    .join(' ')

  const stroke =
    tone === 'danger'
      ? 'var(--danger)'
      : tone === 'warning'
        ? 'var(--warning)'
        : tone === 'success'
          ? 'var(--success)'
          : 'var(--brand)'

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn('h-6 w-16', className)}
      aria-hidden
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts}
      />
    </svg>
  )
}

/** Deterministic decorative series from a seed value (demo when no history API). */
export function sparkSeriesFromValue(seed: number, n = 8): number[] {
  const base = Math.max(0, seed)
  const out: number[] = []
  let x = base + 1
  for (let i = 0; i < n; i++) {
    x = (x * 17 + 23 + i * 3) % 97
    out.push(base * 0.85 + (x / 97) * Math.max(base * 0.3, 1))
  }
  out[out.length - 1] = base
  return out
}
