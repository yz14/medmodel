import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Progress({
  value = 0,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { value?: number }) {
  const pct = Math.max(0, Math.min(100, value * (value <= 1 ? 100 : 1)))
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-3', className)} {...props}>
      <div
        className="h-full rounded-full bg-brand transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
