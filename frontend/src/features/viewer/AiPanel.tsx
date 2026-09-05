import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Play, Square } from 'lucide-react'
import { api } from '@/lib/api'
import { formatMs } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { StatusBadge } from '@/components/StatusBadge'
import { ModelParamsForm } from '@/features/models/ModelParamsForm'
import { FindingsList, buildFindings, type Finding } from '@/features/viewer/FindingsList'
import { ReportPanel } from '@/features/viewer/ReportPanel'
import { useTaskSSE } from '@/features/tasks/useTaskSSE'
import { useViewerStore } from '@/stores/viewer-store'
import { asJsonSchema, type TaskStatus } from '@/types/api'

export function AiPanel({ seriesUid }: { seriesUid: string }) {
  const queryClient = useQueryClient()
  const selectedModelId = useViewerStore((s) => s.selectedModelId)
  const setSelectedModelId = useViewerStore((s) => s.setSelectedModelId)
  const activeTaskId = useViewerStore((s) => s.activeTaskId)
  const setActiveTaskId = useViewerStore((s) => s.setActiveTaskId)
  const result = useViewerStore((s) => s.result)
  const setResult = useViewerStore((s) => s.setResult)
  const setSliceIndex = useViewerStore((s) => s.setSliceIndex)
  const showMasks = useViewerStore((s) => s.showMasks)
  const setShowMasks = useViewerStore((s) => s.setShowMasks)
  const showBoxes = useViewerStore((s) => s.showBoxes)
  const setShowBoxes = useViewerStore((s) => s.setShowBoxes)
  const maskOpacity = useViewerStore((s) => s.maskOpacity)
  const setMaskOpacity = useViewerStore((s) => s.setMaskOpacity)
  const enabledMaskIds = useViewerStore((s) => s.enabledMaskIds)
  const toggleMaskId = useViewerStore((s) => s.toggleMaskId)

  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [selectedFindingIds, setSelectedFindingIds] = useState<string[]>([])

  const modelsQuery = useQuery({
    queryKey: ['models', 'enabled'],
    queryFn: () => api.listModels(true),
  })

  const models = modelsQuery.data?.items ?? []
  const selected = models.find((m) => m.id === selectedModelId) ?? models[0]

  useEffect(() => {
    if (!selectedModelId && models[0]) setSelectedModelId(models[0].id)
  }, [models, selectedModelId, setSelectedModelId])

  const [params, setParams] = useState<Record<string, unknown>>({})
  const [paramsValid, setParamsValid] = useState(true)
  const onParamsChange = useCallback((next: Record<string, unknown>) => setParams(next), [])

  useEffect(() => {
    if (!selected) return
    const defaults: Record<string, unknown> = { ...(selected.default_params ?? {}) }
    const props = asJsonSchema(selected.params_schema).properties ?? {}
    for (const [key, schema] of Object.entries(props)) {
      if (defaults[key] === undefined && schema.default !== undefined) defaults[key] = schema.default
    }
    setParams(defaults)
  }, [selected?.id])

  const taskQuery = useQuery({
    queryKey: ['task', activeTaskId],
    queryFn: () => api.getTask(activeTaskId!),
    enabled: !!activeTaskId,
    refetchInterval: (q) => {
      const status = q.state.data?.status as TaskStatus | undefined
      return status === 'queued' || status === 'running' ? 5000 : false
    },
  })

  useTaskSSE(
    activeTaskId,
    !!activeTaskId &&
      (!taskQuery.data?.status || ['queued', 'running'].includes(taskQuery.data.status)),
  )

  useEffect(() => {
    const status = taskQuery.data?.status
    if (!activeTaskId || status !== 'succeeded') return
    void api.getTaskResult(activeTaskId).then(setResult).catch(() => undefined)
  }, [activeTaskId, taskQuery.data?.status, setResult])

  const runMutation = useMutation({
    mutationFn: () =>
      api.createTask({
        series_uid: seriesUid,
        model_id: selected!.id,
        params,
      }),
    onSuccess: (res) => {
      setResult(null)
      setHighlightedId(null)
      setActiveTaskId(res.task_id)
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['overview'] })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => api.cancelTask(activeTaskId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['task', activeTaskId] })
    },
  })

  const task = taskQuery.data
  const busy = task?.status === 'queued' || task?.status === 'running'
  const findings = useMemo(() => buildFindings(result), [result])

  useEffect(() => {
    setSelectedFindingIds(findings.map((f) => f.id))
  }, [findings])

  const onJump = useCallback(
    (finding: Finding) => {
      setHighlightedId(finding.id)
      if (typeof finding.sliceIndex === 'number') setSliceIndex(finding.sliceIndex)
    },
    [setSliceIndex],
  )

  const onToggleSelect = useCallback((id: string) => {
    setSelectedFindingIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }, [])

  return (
    <div className="flex h-full flex-col border-l border-border bg-surface-1">
      <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted">AI 分析</div>
      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        <div className="space-y-2">
          <label className="text-xs text-muted">选择模型</label>
          <Select
            value={selected?.id ?? ''}
            onChange={(e) => setSelectedModelId(e.target.value)}
            disabled={!models.length}
            data-testid="model-select"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.task_type}
              </option>
            ))}
          </Select>
          {selected && <p className="text-[11px] leading-relaxed text-muted">{selected.description}</p>}
        </div>

        {selected && (
          <ModelParamsForm
            key={selected.id}
            schema={asJsonSchema(selected.params_schema)}
            values={params}
            onChange={onParamsChange}
            onValidityChange={setParamsValid}
          />
        )}

        <div className="flex gap-2">
          <Button
            className="flex-1"
            data-testid="run-inference"
            disabled={!selected || !paramsValid || runMutation.isPending || busy}
            onClick={() => runMutation.mutate()}
          >
            {runMutation.isPending || busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            运行推理
          </Button>
          {busy && activeTaskId && (
            <Button
              variant="outline"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              <Square className="h-4 w-4" />
            </Button>
          )}
        </div>

        {runMutation.isError && (
          <p className="text-xs text-danger">
            {(runMutation.error as Error).message || '创建任务失败'}
          </p>
        )}

        {task && (
          <div className="space-y-2 rounded-lg border border-border bg-surface-0 p-3" data-testid="task-progress">
            <div className="flex items-center justify-between gap-2">
              <StatusBadge status={task.status} />
              <span className="text-[11px] text-muted">{task.stage}</span>
            </div>
            <Progress value={task.progress} />
            <p className="text-[11px] text-muted">{task.message}</p>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-surface-0 p-3">
              <div className="text-xs font-medium text-fg-strong">结果摘要</div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">{result.summary}</p>
              <p className="mt-2 text-[11px] text-muted">耗时 {formatMs(result.runtime_ms)}</p>
            </div>

            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">显示分割掩膜</span>
                <Switch checked={showMasks} onCheckedChange={setShowMasks} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">显示检测框</span>
                <Switch checked={showBoxes} onCheckedChange={setShowBoxes} />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[11px] text-muted">
                  <span>叠加透明度</span>
                  <span>{Math.round(maskOpacity * 100)}%</span>
                </div>
                <Slider
                  min={0}
                  max={1}
                  step={0.05}
                  value={maskOpacity}
                  aria-label="掩膜叠加透明度"
                  onChange={(e) => setMaskOpacity(Number(e.target.value))}
                />
              </div>
            </div>

            <FindingsList
              findings={findings}
              enabledMaskIds={enabledMaskIds}
              onToggleMask={toggleMaskId}
              onJump={onJump}
              highlightedId={highlightedId}
              selectedIds={selectedFindingIds}
              onToggleSelect={onToggleSelect}
            />

            {activeTaskId && (
              <ReportPanel taskId={activeTaskId} findingIds={selectedFindingIds} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
