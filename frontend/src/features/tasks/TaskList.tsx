import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RotateCcw, XCircle, Eye } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDateTime, formatMs, formatPercent, shortUid } from '@/lib/format'
import { StatusBadge } from '@/components/StatusBadge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { TaskSummary } from '@/types/api'

export function TaskList({ tasks }: { tasks: TaskSummary[] }) {
  const queryClient = useQueryClient()

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.cancelTask(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const retryMutation = useMutation({
    mutationFn: (id: string) => api.retryTask(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })

  return (
    <div className="rounded-xl border border-border bg-surface-1">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>任务</TableHead>
            <TableHead>模型</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>进度</TableHead>
            <TableHead>耗时</TableHead>
            <TableHead>创建时间</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => (
            <TableRow key={task.task_id}>
              <TableCell>
                <Link to={`/tasks/${task.task_id}`} className="font-mono text-xs text-brand hover:underline">
                  {shortUid(task.task_id, 10, 4)}
                </Link>
                <div className="mt-0.5 text-[10px] text-muted">series {shortUid(task.series_uid)}</div>
              </TableCell>
              <TableCell className="text-sm">{task.model_id}</TableCell>
              <TableCell>
                <StatusBadge status={task.status} />
              </TableCell>
              <TableCell className="min-w-36">
                <div className="space-y-1">
                  <Progress value={task.progress} />
                  <div className="text-[10px] text-muted">
                    {formatPercent(task.progress, 0)} · {task.stage || '—'}
                  </div>
                </div>
              </TableCell>
              <TableCell className="tabular-nums text-sm">{formatMs(task.runtime_ms)}</TableCell>
              <TableCell className="text-xs text-muted">{formatDateTime(task.created_at)}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Link
                    to={`/tasks/${task.task_id}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-2"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Link>
                  {(task.status === 'queued' || task.status === 'running') && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => cancelMutation.mutate(task.task_id)}
                      disabled={cancelMutation.isPending}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {(task.status === 'failed' || task.status === 'canceled') && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => retryMutation.mutate(task.task_id)}
                      disabled={retryMutation.isPending}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
