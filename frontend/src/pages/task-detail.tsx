import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, RotateCcw, XCircle, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { formatMs, formatPatientName, formatPercent, shortUid } from '@/lib/format'
import { AbsoluteTime } from '@/components/AbsoluteTime'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/components/ui/sonner'
import { TaskLogsTimeline } from '@/features/tasks/TaskLogsTimeline'
import { StageGantt } from '@/features/tasks/StageGantt'
import { TaskResultCards, groupArtifacts } from '@/features/tasks/TaskResultCards'
import { useTaskSSE } from '@/features/tasks/useTaskSSE'
import { stageLabel } from '@/features/tasks/stages'
import type { TaskStatus } from '@/types/api'

export function TaskDetailPage() {
  const { taskId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { connected: sseConnected } = useTaskSSE(taskId, !!taskId)

  const task = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api.getTask(taskId),
    enabled: !!taskId,
    refetchInterval: (q) => {
      const status = q.state.data?.status as TaskStatus | undefined
      if (!(status === 'queued' || status === 'running')) return false
      return sseConnected ? false : 3000
    },
  })

  const result = useQuery({
    queryKey: ['task-result', taskId],
    queryFn: () => api.getTaskResult(taskId),
    enabled: task.data?.status === 'succeeded',
  })

  const cancelMutation = useMutation({
    mutationFn: () => api.cancelTask(taskId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['overview'] })
      toast.success('已取消任务', { duration: 2000 })
    },
    onError: (err) => toast.error(errorMessage(err, '取消失败')),
  })

  const retryMutation = useMutation({
    mutationFn: () => api.retryTask(taskId),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['overview'] })
      toast.success('已重新提交任务', { duration: 2000 })
      navigate(`/tasks/${res.task_id}`)
    },
    onError: (err) => toast.error(errorMessage(err, '重试失败')),
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

  const patientTitle = formatPatientName(t.patient_name)
  const modelLabel = t.model_name || t.model_id

  return (
    <div>
      <PageHeader
        title={`${patientTitle} · ${modelLabel}`}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <AbsoluteTime value={t.created_at} />
            {t.modality && <span>· {t.modality}</span>}
            {t.study_description && <span>· {t.study_description}</span>}
            <span className="font-mono text-muted">· {shortUid(t.task_id, 10, 4)}</span>
          </span>
        }
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
                  {formatPercent(t.progress, 0)} · {stageLabel(t.stage)} · {t.message}
                </p>
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-muted">创建</dt>
                    <dd>
                      <AbsoluteTime value={t.created_at} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">开始</dt>
                    <dd>
                      <AbsoluteTime value={t.started_at} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">结束</dt>
                    <dd>
                      <AbsoluteTime value={t.finished_at} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">耗时</dt>
                    <dd className="tabular-nums">{formatMs(t.runtime_ms)}</dd>
                  </div>
                </dl>
                {t.error_message && <p className="text-xs text-danger">{t.error_message}</p>}
                {t.cache_hit && (
                  <p className="text-xs text-info">
                    命中幂等缓存
                    {t.cached_from ? (
                      <>
                        （来自{' '}
                        <Link to={`/tasks/${t.cached_from}`} className="underline">
                          {t.cached_from.slice(0, 8)}…
                        </Link>
                        ）
                      </>
                    ) : null}
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
                <CardContent>
                  <TaskResultCards result={result.data} />
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
              <TaskLogsTimeline logs={t.logs} />
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
                <div className="space-y-4">
                  {groupArtifacts(artifacts).map(({ group, items }) => (
                    <div key={group}>
                      <div className="mb-2 text-xs font-medium text-muted">{group}</div>
                      <ul className="space-y-2">
                        {items.map((a) => (
                          <li
                            key={a.name}
                            className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm text-fg">{a.name}</div>
                              <div className="text-xs text-muted">
                                {a.media_type}
                                {a.size_bytes != null
                                  ? ` · ${(a.size_bytes / 1024).toFixed(1)} KB`
                                  : ''}
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
                    </div>
                  ))}
                </div>
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
              <pre className="overflow-auto rounded-lg border border-border bg-surface-0 p-3 text-xs text-muted">
                {JSON.stringify(t.params ?? {}, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
