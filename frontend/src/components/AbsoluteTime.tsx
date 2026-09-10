import { formatDateTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Absolute timestamp with relative time on hover (#38). */
export function AbsoluteTime({
  value,
  className,
}: {
  value?: string | null
  className?: string
}) {
  if (!value) return <span className={className}>—</span>
  return (
    <time
      dateTime={value}
      className={cn('tabular-nums', className)}
      title={formatRelative(value)}
    >
      {formatDateTime(value)}
    </time>
  )
}
