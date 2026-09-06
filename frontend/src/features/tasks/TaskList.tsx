import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type ColumnDef, type RowSelectionState } from '@tanstack/react-table'
import { RotateCcw, XCircle, Eye } from 'lucide-react'
import { useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { formatDateTime, formatMs, formatPercent, shortUid } from '@/lib/format'
import { StatusBadge } from '@/components/StatusBadge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/sonner'
import { errorMessage } from '@/lib/errors'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DataTable, selectColumn } from '@/components/DataTable/DataTable'
import type { TaskSummary } from '@/types/api'

type BatchAction = 'cancel' | 'retry' | null

export function TaskList({ tasks }: { tasks: TaskSummary[] }) {
  const queryClient = useQueryClient()
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [confirm, setConfirm] = useState<{
    action: BatchAction
    ids: string[]
  }>({ action: null, ids: [] })
  const [busy, setBusy] = useState(false)

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.cancelTask(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('已取消任务')
    },
    onError: (err) => toast.error(errorMessage(err, '取消失败')),
  })

  const retryMutation = useMutation({
    mutationFn: (id: string) => api.retryTask(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('已重新提交任务')
    },
    onError: (err) => toast.error(errorMessage(err, '重试失败')),
  })

  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection],
  )

  const selectedTasks = useMemo(
    () => tasks.filter((t) => selectedIds.includes(t.task_id)),
    [tasks, selectedIds],
  )

  const canBatchCancel = selectedTasks.some(
    (t) => t.status === 'queued' || t.status === 'running',
  )
  const canBatchRetry = selectedTasks.some(
    (t) => t.status === 'failed' || t.status === 'canceled',
  )

  const runBatch = async () => {
    const { action, ids } = confirm
    if (!action || !ids.length) return
    setBusy(true)
    try {
      const results = await Promise.allSettled(
        ids.map((id) => (action === 'cancel' ? api.cancelTask(id) : api.retryTask(id))),
      )
      const ok = results.filter((r) => r.status === 'fulfilled').length
      const fail = results.length - ok
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setRowSelection({})
      if (fail === 0) toast.success(`已${action === 'cancel' ? '取消' : '重试'} ${ok} 个任务`)
      else toast.error(`${ok} 成功 · ${fail} 失败`)
    } finally {
      setBusy(false)
      setConfirm({ action: null, ids: [] })
    }
  }

  const columns = useMemo<ColumnDef<TaskSummary, unknown>[]>(
    () => [
      selectColumn<TaskSummary>(),
      {
        id: 'task',
        header: '任务',
        accessorKey: 'task_id',
        cell: ({ row }) => (
          <div>
            <Link
              to={`/tasks/${row.original.task_id}`}
              className="font-mono text-xs text-brand hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {shortUid(row.original.task_id, 10, 4)}
            </Link>
            <div className="mt-0.5 text-xs text-muted">
              series {shortUid(row.original.series_uid)}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'model_id',
        header: '模型',
        cell: ({ getValue }) => <span className="text-sm">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'status',
        header: '状态',
        cell: ({ row }) => {
          const task = row.original
          return (
            <div>
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
            </div>
          )
        },
      },
      {
        accessorKey: 'progress',
        header: '进度',
        cell: ({ row }) => (
          <div className="min-w-36 space-y-1">
            <Progress value={row.original.progress} />
            <div className="text-xs text-muted">
              {formatPercent(row.original.progress, 0)} · {row.original.stage || '—'}
            </div>
          </div>
        ),
      },
      {
        id: 'runtime',
        header: '耗时',
        accessorFn: (t) => t.runtime_ms ?? 0,
        cell: ({ row }) => {
          const task = row.original
          if (task.cache_hit) {
            return (
              <span className="text-muted">
                缓存
                {task.cached_from ? (
                  <>
                    {' · '}
                    <Link
                      to={`/tasks/${task.cached_from}`}
                      className="text-brand hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {shortUid(task.cached_from, 6, 4)}
                    </Link>
                  </>
                ) : null}
              </span>
            )
          }
          return <span className="tabular-nums text-sm">{formatMs(task.runtime_ms)}</span>
        },
      },
      {
        accessorKey: 'created_at',
        header: '创建时间',
        cell: ({ getValue }) => (
          <span className="text-xs text-muted">{formatDateTime(getValue<string | null>())}</span>
        ),
      },
      {
        id: 'actions',
        header: '操作',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const task = row.original
          const cancelPending =
            cancelMutation.isPending && cancelMutation.variables === task.task_id
          const retryPending =
            retryMutation.isPending && retryMutation.variables === task.task_id
          return (
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
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
                  onClick={() => setConfirm({ action: 'cancel', ids: [task.task_id] })}
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
                  onClick={() => setConfirm({ action: 'retry', ids: [task.task_id] })}
                  disabled={retryPending}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )
        },
      },
    ],
    [cancelMutation.isPending, cancelMutation.variables, retryMutation.isPending, retryMutation.variables],
  )

  return (
    <>
      <DataTable
        columns={columns}
        data={tasks}
        getRowId={(t) => t.task_id}
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        toolbar={
          selectedIds.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted">已选 {selectedIds.length}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={!canBatchCancel || busy}
                onClick={() =>
                  setConfirm({
                    action: 'cancel',
                    ids: selectedTasks
                      .filter((t) => t.status === 'queued' || t.status === 'running')
                      .map((t) => t.task_id),
                  })
                }
              >
                <XCircle className="h-3.5 w-3.5" />
                批量取消
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!canBatchRetry || busy}
                onClick={() =>
                  setConfirm({
                    action: 'retry',
                    ids: selectedTasks
                      .filter((t) => t.status === 'failed' || t.status === 'canceled')
                      .map((t) => t.task_id),
                  })
                }
              >
                <RotateCcw className="h-3.5 w-3.5" />
                批量重试
              </Button>
            </div>
          ) : null
        }
      />

      <AlertDialog
        open={confirm.action != null && confirm.ids.length > 0}
        onOpenChange={(open) => {
          if (!open) setConfirm({ action: null, ids: [] })
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm.action === 'cancel' ? '确认取消任务' : '确认重试任务'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              将对 {confirm.ids.length} 个任务执行
              {confirm.action === 'cancel' ? '取消' : '重试'}
              ，此操作不可撤销（重试会创建新任务）。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>返回</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                void runBatch()
              }}
            >
              {busy ? '处理中…' : '确认'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
