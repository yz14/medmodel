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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/components/ui/sonner'
import { ModelParamsForm } from '@/features/models/ModelParamsForm'
import { asJsonSchema } from '@/types/api'

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
  }, [model.data?.id])

  const patchMutation = useMutation({
    mutationFn: () => api.patchModel(modelId, { enabled, default_params: params }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['model', modelId] })
      void queryClient.invalidateQueries({ queryKey: ['models'] })
      void queryClient.invalidateQueries({ queryKey: ['model-ready', modelId] })
      toast.success('模型配置已保存')
    },
    onError: (err) => toast.error((err as Error).message || '保存失败'),
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
  const constraints = m.input_constraints ?? {}

  return (
    <div>
      <PageHeader
        title={m.name}
        description={`${m.id} · v${m.version}`}
        actions={
          <>
            <Link to="/models" className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm hover:bg-surface-2">
              <ArrowLeft className="h-4 w-4" />
              返回
            </Link>
            <Button onClick={() => patchMutation.mutate()} disabled={patchMutation.isPending || !paramsValid}>
              <Save className="h-4 w-4" />
              保存
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant="info">{m.task_type}</Badge>
        {ready.data?.ready ? (
          <span className="inline-flex items-center gap-1 text-xs text-success" data-testid="model-ready">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Ready · {ready.data.message}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-warning">
            <XCircle className="h-3.5 w-3.5" />
            {ready.data?.message ?? '检查就绪状态…'}
          </span>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="inputs">输入约束</TabsTrigger>
          <TabsTrigger value="outputs">输出</TabsTrigger>
          <TabsTrigger value="metrics">指标</TabsTrigger>
          <TabsTrigger value="config">配置</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>模型卡</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-relaxed text-muted">{m.description}</p>
              <div className="flex flex-wrap gap-2">
                {m.modalities.map((x) => (
                  <Badge key={x} variant="secondary">
                    {x}
                  </Badge>
                ))}
                {m.body_parts.map((x) => (
                  <Badge key={x} variant="secondary">
                    {x}
                  </Badge>
                ))}
                {(m.tags ?? []).map((t) => (
                  <Badge key={t} variant="secondary">
                    {t}
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
                  <dt className="text-xs text-muted">版本历史</dt>
                  <dd className="text-muted">v{m.version}（当前）</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inputs">
          <Card>
            <CardHeader>
              <CardTitle>输入约束</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="overflow-auto rounded-lg border border-border bg-surface-0 p-3 text-xs text-muted">
                {JSON.stringify(constraints, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outputs">
          <Card>
            <CardHeader>
              <CardTitle>输出定义</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {(m.outputs ?? []).map((o) => (
                  <li key={o.name} className="rounded-lg border border-border px-3 py-2">
                    <div className="font-medium text-fg">{o.name}</div>
                    <div className="text-xs text-muted">
                      {o.result_type} · {o.description}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metrics">
          <Card>
            <CardHeader>
              <CardTitle>评估指标</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {Object.entries(m.metrics ?? {}).map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-border p-3">
                    <div className="text-xs uppercase text-muted">{k}</div>
                    <div className="mt-1 text-lg tabular-nums text-fg-strong">{formatNumber(v, 3)}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config">
          <Card>
            <CardHeader>
              <CardTitle>运行配置</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">启用模型</span>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>
              <ModelParamsForm
                key={m.id}
                schema={asJsonSchema(m.params_schema)}
                values={params}
                onChange={setParams}
                onValidityChange={setParamsValid}
              />
              {patchMutation.isSuccess && <p className="text-xs text-success">已保存</p>}
              {patchMutation.isError && (
                <p className="text-xs text-danger">{(patchMutation.error as Error).message}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
