import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RotateCcw, XCircle, Eye } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDateTime, formatMs, formatPercent, shortUid } from '@/lib/format'
import { StatusBadge } from '@/components/StatusBadge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/sonner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { TaskSummary } from '@/types/api'

export function TaskList({ tasks }: { tasks: TaskSummary[] }) {
  const queryClient = useQueryClient()

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.cancelTask(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('已取消任务')
    },
    onError: (err) => toast.error((err as Error).message || '取消失败'),
  })

  const retryMutation = useMutation({
    mutationFn: (id: string) => api.retryTask(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('已重新提交任务')
    },
    onError: (err) => toast.error((err as Error).message || '重试失败'),
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
          {tasks.map((task) => {
            const cancelPending =
              cancelMutation.isPending && cancelMutation.variables === task.task_id
            const retryPending =
              retryMutation.isPending && retryMutation.variables === task.task_id

            return (
              <TableRow key={task.task_id}>
                <TableCell>
                  <Link
                    to={`/tasks/${task.task_id}`}
                    className="font-mono text-xs text-brand hover:underline"
                  >
                    {shortUid(task.task_id, 10, 4)}
                  </Link>
                  <div className="mt-0.5 text-xs text-muted">
                    series {shortUid(task.series_uid)}
                  </div>
                </TableCell>
                <TableCell className="text-sm">{task.model_id}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={task.status} />
                    {task.cache_hit && (
                      <Badge family="tag" variant="secondary" className="font-normal">
                        缓存
                      </Badge>
                    )}
                    {task.error_code && (
                      <Badge
                        family="status"
                        variant="danger"
                        className="max-w-[9rem] truncate font-mono font-normal"
                        title={task.error_message || task.error_code}
                        data-testid={`task-error-${task.task_id}`}
                      >
                        {task.error_code}
                      </Badge>
                    )}
                  </div>
                  {task.error_message && (
                    <div
                      className="mt-1 line-clamp-2 max-w-[14rem] text-xs text-danger/90"
                      title={task.error_message}
                    >
                      {task.error_message}
                    </div>
                  )}
                </TableCell>
                <TableCell className="min-w-36">
                  <div className="space-y-1">
                    <Progress value={task.progress} />
                    <div className="text-xs text-muted">
                      {formatPercent(task.progress, 0)} · {task.stage || '—'}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="tabular-nums text-sm">
                  {task.cache_hit ? (
                    <span className="text-muted">
                      缓存
                      {task.cached_from ? (
                        <>
                          {' · '}
                          <Link
                            to={`/tasks/${task.cached_from}`}
                            className="text-brand hover:underline"
                          >
                            {shortUid(task.cached_from, 6, 4)}
                          </Link>
                        </>
                      ) : null}
                    </span>
                  ) : (
                    formatMs(task.runtime_ms)
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted">
                  {formatDateTime(task.created_at)}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Link
                      to={`/tasks/${task.task_id}`}
                      aria-label="查看任务详情"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-2"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Link>
                    {(task.status === 'queued' || task.status === 'running') && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="取消任务"
                        onClick={() => cancelMutation.mutate(task.task_id)}
                        disabled={cancelPending}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {(task.status === 'failed' || task.status === 'canceled') && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="重试任务"
                        onClick={() => retryMutation.mutate(task.task_id)}
                        disabled={retryPending}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
