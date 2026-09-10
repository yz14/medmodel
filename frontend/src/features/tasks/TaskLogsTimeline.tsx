import { useEffect, useMemo, useRef, useState } from 'react'
import { AbsoluteTime } from '@/components/AbsoluteTime'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { stageLabel } from '@/features/tasks/stages'
import type { TaskLog } from '@/types/api'

type LevelFilter = 'all' | 'info' | 'warning' | 'error'

const LEVEL_META: Record<
  string,
  { label: string; dot: string; badge: 'secondary' | 'info' | 'warning' | 'danger' }
> = {
  info: { label: 'INFO', dot: 'bg-info', badge: 'info' },
  warning: { label: 'WARN', dot: 'bg-warning', badge: 'warning' },
  error: { label: 'ERROR', dot: 'bg-danger', badge: 'danger' },
  debug: { label: 'DEBUG', dot: 'bg-muted', badge: 'secondary' },
}

function normalizeLevel(level: string | null | undefined): string {
  return (level || 'info').toLowerCase()
}

export function TaskLogsTimeline({
  logs,
  className,
}: {
  logs?: TaskLog[] | null
  className?: string
}) {
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all')
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [follow, setFollow] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(0)

  const stagesInLogs = useMemo(() => {
    const set = new Set<string>()
    for (const log of logs ?? []) {
      if (log.stage) set.add(log.stage)
    }
    return Array.from(set)
  }, [logs])

  const filtered = useMemo(() => {
    const list = logs ?? []
    return list.filter((log) => {
      const level = normalizeLevel(log.level)
      if (levelFilter !== 'all' && level !== levelFilter) return false
      if (stageFilter !== 'all' && (log.stage || '') !== stageFilter) return false
      return true
    })
  }, [logs, levelFilter, stageFilter])

  useEffect(() => {
    if (stageFilter !== 'all' && !stagesInLogs.includes(stageFilter)) {
      setStageFilter('all')
    }
  }, [stagesInLogs, stageFilter])

  useEffect(() => {
    const grew = filtered.length > prevCountRef.current
    prevCountRef.current = filtered.length
    if (!follow || !grew) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [filtered.length, follow])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 56
    setFollow(nearBottom)
  }

  if (!logs?.length) {
    return <p className="text-sm text-muted">暂无日志</p>
  }

  return (
    <div className={cn('space-y-3', className)} data-testid="task-logs-timeline">
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={levelFilter}
          onValueChange={(v) => {
            if (v) setLevelFilter(v as LevelFilter)
          }}
          aria-label="按级别过滤"
        >
          <ToggleGroupItem value="all" aria-label="全部级别">
            全部
          </ToggleGroupItem>
          <ToggleGroupItem value="info" aria-label="仅 info">
            Info
          </ToggleGroupItem>
          <ToggleGroupItem value="warning" aria-label="仅 warning">
            Warn
          </ToggleGroupItem>
          <ToggleGroupItem value="error" aria-label="仅 error">
            Error
          </ToggleGroupItem>
        </ToggleGroup>

        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="h-8 w-40" aria-label="按阶段过滤">
            <SelectValue placeholder="阶段" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部阶段</SelectItem>
            {stagesInLogs.map((s) => (
              <SelectItem key={s} value={s}>
                {stageLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="ml-auto flex items-center gap-2 text-xs text-muted">
          <span>跟随最新</span>
          <Switch checked={follow} onCheckedChange={setFollow} aria-label="跟随最新日志" />
        </label>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="max-h-[28rem] overflow-y-auto rounded-lg border border-border bg-surface-0 p-3"
      >
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">当前筛选下无日志</p>
        ) : (
          <ol className="space-y-3 border-l border-border pl-4">
            {filtered.map((log, idx) => {
              const level = normalizeLevel(log.level)
              const meta = LEVEL_META[level] ?? LEVEL_META.info!
              return (
                <li key={`${log.created_at}-${log.message}-${idx}`} className="relative">
                  <span
                    className={cn(
                      'absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full ring-2 ring-surface-0',
                      meta.dot,
                    )}
                  />
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <AbsoluteTime value={log.created_at} />
                    {log.stage ? (
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 text-fg">
                        {stageLabel(log.stage)}
                      </span>
                    ) : null}
                    <Badge family="tag" variant={meta.badge} className="h-5 px-1.5 text-xs">
                      {meta.label}
                    </Badge>
                  </div>
                  <p
                    className={cn(
                      'mt-1 text-sm',
                      level === 'error' && 'text-danger',
                      level === 'warning' && 'text-warning',
                      level !== 'error' && level !== 'warning' && 'text-fg',
                    )}
                  >
                    {log.message}
                  </p>
                </li>
              )
            })}
          </ol>
        )}
        <div ref={bottomRef} aria-hidden className="h-px w-full" />
      </div>

      <p className="text-xs text-muted">
        显示 {filtered.length} / {logs.length} 条
      </p>
    </div>
  )
}
