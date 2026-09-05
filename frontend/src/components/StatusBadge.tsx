import { Badge } from '@/components/ui/badge'
import type { TaskStatus } from '@/types/api'

const STATUS_MAP: Record<
  TaskStatus,
  { label: string; variant: 'secondary' | 'info' | 'success' | 'danger' | 'warning' }
> = {
  queued: { label: '排队中', variant: 'secondary' },
  running: { label: '运行中', variant: 'info' },
  succeeded: { label: '成功', variant: 'success' },
  failed: { label: '失败', variant: 'danger' },
  canceled: { label: '已取消', variant: 'warning' },
}

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_MAP[status as TaskStatus] ?? {
    label: status,
    variant: 'secondary' as const,
  }
  return <Badge variant={meta.variant}>{meta.label}</Badge>
}
