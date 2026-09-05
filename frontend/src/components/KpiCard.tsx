import type { ReactNode } from 'react'
import { TrendingUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Sparkline } from '@/components/Sparkline'
import { cn } from '@/lib/utils'

export function KpiCard({
  title,
  value,
  hint,
  icon,
  className,
  sparkline,
  tone = 'default',
}: {
  title: string
  value: ReactNode
  hint?: string
  icon?: ReactNode
  className?: string
  sparkline?: number[]
  tone?: 'default' | 'warning' | 'danger' | 'success'
}) {
  const hintTone =
    tone === 'danger'
      ? 'text-danger'
      : tone === 'warning'
        ? 'text-warning'
        : tone === 'success'
          ? 'text-success'
          : 'text-muted'

  const sparkTone =
    tone === 'danger' || tone === 'warning' || tone === 'success' ? tone : 'brand'

  return (
    <Card
      className={cn(
        'overflow-hidden',
        tone === 'danger' && 'border-danger/40',
        tone === 'warning' && 'border-warning/40',
        className,
      )}
    >
      <CardContent className="flex items-start justify-between gap-3 pt-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">{title}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-fg-strong tabular-nums">
            {value}
          </p>
          {hint && (
            <p className={cn('mt-1.5 flex items-center gap-1 text-xs', hintTone)}>
              <TrendingUp className="h-3 w-3" />
              {hint}
            </p>
          )}
          {sparkline && sparkline.length > 1 && (
            <div className="mt-2">
              <Sparkline values={sparkline} tone={sparkTone} />
            </div>
          )}
        </div>
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
            {icon}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
