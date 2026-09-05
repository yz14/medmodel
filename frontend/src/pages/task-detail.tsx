import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, RotateCcw, XCircle, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDateTime, formatMs, formatPercent } from '@/lib/format'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TaskLogsTimeline } from '@/features/tasks/TaskLogsTimeline'
import { StageGantt } from '@/features/tasks/StageGantt'
import { useTaskSSE } from '@/features/tasks/useTaskSSE'
import type { TaskStatus } from '@/types/api'

export function TaskDetailPage() {
  const { taskId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const task = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api.getTask(taskId),
    enabled: !!taskId,
    refetchInterval: (q) => {
      const status = q.state.data?.status as TaskStatus | undefined
      return status === 'queued' || status === 'running' ? 5000 : false
    },
  })

  useTaskSSE(
    taskId,
    !!taskId && (!task.data?.status || ['queued', 'running'].includes(task.data.status)),
  )

  const result = useQuery({
    queryKey: ['task-result', taskId],
    queryFn: () => api.getTaskResult(taskId),
    enabled: task.data?.status === 'succeeded',
  })

  const cancelMutation = useMutation({
    mutationFn: () => api.cancelTask(taskId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['task', taskId] }),
  })

  const retryMutation = useMutation({
    mutationFn: () => api.retryTask(taskId),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      navigate(`/tasks/${res.task_id}`)
    },
  })

  if (task.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (task.isError || !task.data) {
    return (
      <EmptyState
        title="任务不存在"
        description={(task.error as Error)?.message}
        action={
          <Button onClick={() => void task.refetch()}>
            <RefreshCw className="h-4 w-4" />
            重试
          </Button>
        }
      />
    )
  }

  const t = task.data
  const canCancel = t.status === 'queued' || t.status === 'running'
  const canRetry = t.status === 'failed' || t.status === 'canceled'
  const artifacts = t.artifacts ?? []
  const timings =
    t.stage_timings && typeof t.stage_timings === 'object'
      ? (t.stage_timings as Record<string, number>)
      : null

  return (
    <div>
      <PageHeader
        title={`任务 ${t.task_id.slice(0, 12)}…`}
        description={`${t.model_id} · series ${t.series_uid.slice(0, 18)}…`}
        actions={
          <>
            <Link
              to="/tasks"
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm hover:bg-surface-2"
            >
              <ArrowLeft className="h-4 w-4" />
              返回
            </Link>
            {t.study_uid && (
              <Link
                to={`/viewer/${encodeURIComponent(t.study_uid)}`}
                className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm hover:bg-surface-2"
              >
                打开阅片
              </Link>
            )}
            {canCancel && (
              <Button variant="outline" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
                <XCircle className="h-4 w-4" />
                取消
              </Button>
            )}
            {canRetry && (
              <Button onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending}>
                <RotateCcw className="h-4 w-4" />
                重试
              </Button>
            )}
          </>
        }
      />

      <Tabs defaultValue="overview" className="mt-2">
        <TabsList>
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="logs">日志</TabsTrigger>
          <TabsTrigger value="artifacts">产物</TabsTrigger>
          <TabsTrigger value="params">参数</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 xl:grid-cols-12">
            <Card className="xl:col-span-5">
              <CardHeader>
                <CardTitle>状态</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <StatusBadge status={t.status} />
                <Progress value={t.progress} />
                <p className="text-sm text-muted">
                  {formatPercent(t.progress, 0)} · {t.stage || '—'} · {t.message}
                </p>
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-muted">创建</dt>
                    <dd className="tabular-nums">{formatDateTime(t.created_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">开始</dt>
                    <dd className="tabular-nums">{formatDateTime(t.started_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">结束</dt>
                    <dd className="tabular-nums">{formatDateTime(t.finished_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">耗时</dt>
                    <dd className="tabular-nums">{formatMs(t.runtime_ms)}</dd>
                  </div>
                </dl>
                {t.error_message && <p className="text-xs text-danger">{t.error_message}</p>}
                {t.cache_hit && (
                  <p className="text-xs text-info">
                    命中幂等缓存{t.cached_from ? `（来自 ${t.cached_from.slice(0, 8)}）` : ''}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="xl:col-span-7">
              <CardHeader>
                <CardTitle>阶段耗时</CardTitle>
              </CardHeader>
              <CardContent>
                <StageGantt timings={timings} currentStage={t.stage} />
              </CardContent>
            </Card>

            {result.data && (
              <Card className="xl:col-span-12">
                <CardHeader>
                  <CardTitle>推理结果</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-muted">{result.data.summary}</p>
                  <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-surface-0 p-3 text-[11px] text-muted">
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>实时日志</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[28rem] overflow-y-auto rounded-lg border border-border bg-surface-0 p-3">
                <TaskLogsTimeline logs={t.logs} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="artifacts">
          <Card>
            <CardHeader>
              <CardTitle>产物</CardTitle>
            </CardHeader>
            <CardContent>
              {artifacts.length === 0 ? (
                <p className="text-sm text-muted">暂无产物</p>
              ) : (
                <ul className="space-y-2">
                  {artifacts.map((a) => (
                    <li
                      key={a.name}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm text-fg">{a.name}</div>
                        <div className="text-[11px] text-muted">
                          {a.media_type}
                          {a.size_bytes != null ? ` · ${(a.size_bytes / 1024).toFixed(1)} KB` : ''}
                        </div>
                      </div>
                      <a
                        href={a.url || api.artifactUrl(taskId, a.name)}
                        download={a.name}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs hover:bg-surface-2"
                      >
                        <Download className="h-3.5 w-3.5" />
                        下载
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="params">
          <Card>
            <CardHeader>
              <CardTitle>推理参数</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="overflow-auto rounded-lg border border-border bg-surface-0 p-3 text-[11px] text-muted">
                {JSON.stringify(t.params ?? {}, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
