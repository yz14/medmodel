import { formatDateTime } from '@/lib/format'
import type { TaskLog } from '@/types/api'

export function TaskLogsTimeline({ logs }: { logs?: TaskLog[] | null }) {
  if (!logs?.length) {
    return <p className="text-xs text-muted">暂无日志</p>
  }

  return (
    <ol className="space-y-3 border-l border-border pl-4">
      {logs.map((log, idx) => (
        <li key={`${log.created_at}-${idx}`} className="relative">
          <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full bg-brand" />
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted">
            <span>{formatDateTime(log.created_at)}</span>
            {log.stage ? (
              <span className="rounded bg-surface-2 px-1.5 py-0.5">{log.stage}</span>
            ) : null}
            <span className="uppercase">{log.level}</span>
          </div>
          <p className="mt-1 text-sm text-fg">{log.message}</p>
        </li>
      ))}
    </ol>
  )
}
