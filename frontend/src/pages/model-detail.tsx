import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Save, CheckCircle2, XCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { formatMs, formatNumber } from '@/lib/format'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from '@/components/ui/sonner'
import { ModelParamsForm } from '@/features/models/ModelParamsForm'
import {
  constraintRows,
  orderedMetricEntries,
  taskTypeLabel,
} from '@/features/models/metrics'
import { asJsonSchema } from '@/types/api'
import { errorMessage } from '@/lib/errors'

export function ModelDetailPage() {
  const { modelId = '' } = useParams()
  const queryClient = useQueryClient()
  const model = useQuery({
    queryKey: ['model', modelId],
    queryFn: () => api.getModel(modelId),
    enabled: !!modelId,
  })
  const ready = useQuery({
    queryKey: ['model-ready', modelId],
    queryFn: () => api.getModelReady(modelId),
    enabled: !!modelId,
    refetchInterval: 30_000,
  })

  const [params, setParams] = useState<Record<string, unknown>>({})
  const [enabled, setEnabled] = useState(true)
  const [paramsValid, setParamsValid] = useState(true)

  useEffect(() => {
    if (!model.data) return
    setEnabled(model.data.enabled)
    const defaults: Record<string, unknown> = { ...(model.data.default_params ?? {}) }
    const props = asJsonSchema(model.data.params_schema).properties ?? {}
    for (const [key, schema] of Object.entries(props)) {
      if (defaults[key] === undefined && schema.default !== undefined) defaults[key] = schema.default
    }
    setParams(defaults)
  }, [model.data])

  const patchMutation = useMutation({
    mutationFn: () => api.patchModel(modelId, { enabled, default_params: params }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['model', modelId] })
      void queryClient.invalidateQueries({ queryKey: ['models'] })
      void queryClient.invalidateQueries({ queryKey: ['model-ready', modelId] })
      setEnabled(res.enabled)
      setParams({ ...(res.default_params ?? {}) })
      toast.success('模型配置已保存', { duration: 2000 })
    },
    onError: (err) => toast.error(errorMessage(err, '保存失败')),
  })

  if (model.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (model.isError || !model.data) {
    return (
      <EmptyState
        title="模型不存在"
        description={(model.error as Error)?.message}
        action={
          <Button onClick={() => void model.refetch()}>
            <RefreshCw className="h-4 w-4" />
            重试
          </Button>
        }
      />
    )
  }

  const m = model.data
  const constraints = constraintRows(m.input_constraints as Record<string, unknown> | undefined)
  const metricEntries = orderedMetricEntries(m.task_type, m.metrics)

  return (
    <div>
      <PageHeader
        title={m.name}
        description={`${m.id} · v${m.version}`}
        actions={
          <Link
            to="/models"
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm hover:bg-surface-2"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge family="tag" variant="info">
          {taskTypeLabel(m.task_type)}
        </Badge>
        {ready.data?.ready ? (
          <span className="inline-flex items-center gap-1 text-xs text-success" data-testid="model-ready">
            <CheckCircle2 className="h-3.5 w-3.5" />
            就绪 · {ready.data.message}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-warning">
            <XCircle className="h-3.5 w-3.5" />
            {ready.data?.message ?? '检查就绪状态…'}
          </span>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-7">
          <Card>
            <CardHeader>
              <CardTitle>模型卡</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-relaxed text-muted">{m.description}</p>
              <div className="flex flex-wrap gap-2">
                {m.modalities.map((x) => (
                  <Badge key={x} family="tag" variant="secondary">
                    {x}
                  </Badge>
                ))}
                {m.body_parts.map((x) => (
                  <Badge key={x} family="tag" variant="secondary">
                    {x}
                  </Badge>
                ))}
                {(m.tags ?? []).map((tag) => (
                  <Badge key={tag} family="tag" variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted">版本</dt>
                  <dd className="tabular-nums">{m.version}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">预期延迟</dt>
                  <dd className="tabular-nums">{formatMs(m.expected_latency_ms)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">启用</dt>
                  <dd>{m.enabled ? '是' : '否'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">任务类型</dt>
                  <dd>{taskTypeLabel(m.task_type)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>评估指标</CardTitle>
            </CardHeader>
            <CardContent>
              {metricEntries.length === 0 ? (
                <EmptyState title="暂无评估指标" className="py-8" />
              ) : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {metricEntries.map((e) => (
                    <div key={e.key} className="rounded-lg border border-border p-3">
                      <div className="text-xs text-muted">{e.label}</div>
                      <div className="mt-1 text-lg tabular-nums text-fg-strong">
                        {formatNumber(e.value, 3)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>输入约束</CardTitle>
              </CardHeader>
              <CardContent>
                {constraints.length === 0 ? (
                  <p className="text-xs text-muted">未声明输入约束</p>
                ) : (
                  <Table>
                    <TableBody>
                      {constraints.map((row) => (
                        <TableRow key={row.key}>
                          <TableCell className="text-fg">{row.label}</TableCell>
                          <TableCell className="tabular-nums text-muted">{row.value}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>输出定义</CardTitle>
              </CardHeader>
              <CardContent>
                {(m.outputs ?? []).length === 0 ? (
                  <p className="text-xs text-muted">未声明输出</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>名称</TableHead>
                        <TableHead>类型</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(m.outputs ?? []).map((o) => (
                        <TableRow key={o.name}>
                          <TableCell className="font-medium text-fg">{o.name}</TableCell>
                          <TableCell>
                            <Badge family="tag" variant="secondary">
                              {taskTypeLabel(String(o.result_type))}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="xl:col-span-5">
          <Card className="sticky top-4">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>运行配置</CardTitle>
              <Button
                size="sm"
                onClick={() => {
                  if (!paramsValid) {
                    toast.error('请修正模型参数后再保存')
                    return
                  }
                  patchMutation.mutate()
                }}
                disabled={patchMutation.isPending}
              >
                <Save className="h-4 w-4" />
                保存
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">启用模型</span>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>
              <ModelParamsForm
                key={`${m.id}:${JSON.stringify(m.default_params ?? {})}`}
                schema={asJsonSchema(m.params_schema)}
                values={params}
                onChange={setParams}
                onValidityChange={setParamsValid}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
