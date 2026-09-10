import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Cpu, Loader2, Play, Square } from 'lucide-react'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { formatMs } from '@/lib/format'
import { toast } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/EmptyState'
import { StatusBadge } from '@/components/StatusBadge'
import { ModelParamsForm } from '@/features/models/ModelParamsForm'
import { taskTypeLabel } from '@/features/models/metrics'
import {
  FindingsList,
  buildFindings,
  type Finding,
  type FindingReviewStatus,
} from '@/features/viewer/FindingsList'
import { ReportPanel } from '@/features/viewer/ReportPanel'
import { useTaskSSE } from '@/features/tasks/useTaskSSE'
import { stageLabel } from '@/features/tasks/stages'
import { useViewerStore } from '@/stores/viewer-store'
import { asJsonSchema, type TaskStatus } from '@/types/api'
import { modelCompatibility } from '@/features/viewer/modelCompatibility'

type AiTab = 'analyze' | 'findings' | 'layers' | 'report'

export function AiPanel({
  seriesUid,
  modality,
  bodyPart,
  numInstances,
}: {
  seriesUid: string
  modality?: string | null
  bodyPart?: string | null
  numInstances?: number | null
}) {
  const queryClient = useQueryClient()
  const selectedModelId = useViewerStore((s) => s.selectedModelId)
  const setSelectedModelId = useViewerStore((s) => s.setSelectedModelId)
  const activeTaskId = useViewerStore((s) => s.activeTaskId)
  const setActiveTaskId = useViewerStore((s) => s.setActiveTaskId)
  const result = useViewerStore((s) => s.result)
  const setResult = useViewerStore((s) => s.setResult)
  const sliceIndex = useViewerStore((s) => s.sliceIndex)
  const setSliceIndex = useViewerStore((s) => s.setSliceIndex)
  const showMasks = useViewerStore((s) => s.showMasks)
  const setShowMasks = useViewerStore((s) => s.setShowMasks)
  const showBoxes = useViewerStore((s) => s.showBoxes)
  const setShowBoxes = useViewerStore((s) => s.setShowBoxes)
  const showAnnotations = useViewerStore((s) => s.showAnnotations)
  const setShowAnnotations = useViewerStore((s) => s.setShowAnnotations)
  const showCam = useViewerStore((s) => s.showCam)
  const setShowCam = useViewerStore((s) => s.setShowCam)
  const camOpacity = useViewerStore((s) => s.camOpacity)
  const setCamOpacity = useViewerStore((s) => s.setCamOpacity)
  const maskOpacity = useViewerStore((s) => s.maskOpacity)
  const setMaskOpacity = useViewerStore((s) => s.setMaskOpacity)
  const enabledMaskIds = useViewerStore((s) => s.enabledMaskIds)
  const toggleMaskId = useViewerStore((s) => s.toggleMaskId)
  const highlightedFindingId = useViewerStore((s) => s.highlightedFindingId)
  const setHighlightedFindingId = useViewerStore((s) => s.setHighlightedFindingId)
  const hoveredFindingId = useViewerStore((s) => s.hoveredFindingId)
  const setHoveredFindingId = useViewerStore((s) => s.setHoveredFindingId)

  const [tab, setTab] = useState<AiTab>('analyze')
  const [selectedFindingIds, setSelectedFindingIds] = useState<string[]>([])
  const [reviews, setReviews] = useState<Record<string, FindingReviewStatus>>({})
  const seededResultKey = useRef<string | null>(null)
  const autoJumpedKey = useRef<string | null>(null)

  const modelsQuery = useQuery({
    queryKey: ['models', 'enabled'],
    queryFn: () => api.listModels(true),
  })

  const models = modelsQuery.data?.items ?? []
  const seriesMeta = useMemo(
    () => ({ modality, bodyPart, numInstances }),
    [modality, bodyPart, numInstances],
  )

  const compatibleEntries = useMemo(
    () =>
      models
        .map((m) => ({ model: m, compat: modelCompatibility(m, seriesMeta) }))
        .filter((e) => e.compat.ok),
    [models, seriesMeta],
  )
  const compatibleModels = useMemo(
    () => compatibleEntries.map((e) => e.model),
    [compatibleEntries],
  )
  const hasCompatible = compatibleModels.length > 0

  const selected = selectedModelId
    ? compatibleModels.find((m) => m.id === selectedModelId)
    : undefined

  // #12: only auto-pick a compatible model; never fall back to incompatible / models[0]
  useEffect(() => {
    if (!models.length) return
    if (selectedModelId && compatibleModels.some((m) => m.id === selectedModelId)) return
    const firstOk = compatibleModels[0]
    setSelectedModelId(firstOk ? firstOk.id : null)
  }, [models.length, selectedModelId, compatibleModels, setSelectedModelId])

  const [params, setParams] = useState<Record<string, unknown>>({})
  const [paramsValid, setParamsValid] = useState(true)
  const onParamsChange = useCallback((next: Record<string, unknown>) => setParams(next), [])

  useEffect(() => {
    if (!selected) {
      setParams({})
      setParamsValid(true)
      return
    }
    const defaults: Record<string, unknown> = { ...(selected.default_params ?? {}) }
    const props = asJsonSchema(selected.params_schema).properties ?? {}
    for (const [key, schema] of Object.entries(props)) {
      if (defaults[key] === undefined && schema.default !== undefined) defaults[key] = schema.default
    }
    setParams(defaults)
  }, [selected?.id])

  const { connected: sseConnected } = useTaskSSE(activeTaskId, !!activeTaskId)

  const taskQuery = useQuery({
    queryKey: ['task', activeTaskId],
    queryFn: () => api.getTask(activeTaskId!),
    enabled: !!activeTaskId,
    refetchInterval: (q) => {
      const status = q.state.data?.status as TaskStatus | undefined
      if (!(status === 'queued' || status === 'running')) return false
      return sseConnected ? false : 3000
    },
  })

  useEffect(() => {
    const status = taskQuery.data?.status
    if (!activeTaskId || status !== 'succeeded') return
    let cancelled = false
    void api
      .getTaskResult(activeTaskId)
      .then((res) => {
        if (!cancelled && useViewerStore.getState().activeTaskId === activeTaskId) {
          setResult(res)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.error(errorMessage(err, '加载推理结果失败'))
      })
    return () => {
      cancelled = true
    }
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
      setHighlightedFindingId(null)
      setHoveredFindingId(null)
      setSelectedFindingIds([])
      setReviews({})
      seededResultKey.current = null
      autoJumpedKey.current = null
      setActiveTaskId(res.task_id)
      setTab('analyze')
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['overview'] })
      toast.success('已创建推理任务', { duration: 2000 })
    },
    onError: (err) => {
      toast.error(errorMessage(err, '创建任务失败'))
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => api.cancelTask(activeTaskId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['task', activeTaskId] })
      toast.success('已取消任务', { duration: 2000 })
    },
    onError: (err) => {
      toast.error(errorMessage(err, '取消失败'))
    },
  })

  const task = taskQuery.data
  const busy = task?.status === 'queued' || task?.status === 'running'
  const findings = useMemo(() => buildFindings(result), [result])

  useEffect(() => {
    const key =
      activeTaskId && findings.length
        ? `${activeTaskId}:${findings.map((f) => f.id).join(',')}`
        : null
    if (!key || key === seededResultKey.current) return
    seededResultKey.current = key
    setSelectedFindingIds(findings.map((f) => f.id))
    setReviews({})
  }, [activeTaskId, findings])

  useEffect(() => {
    if (!activeTaskId || !result || !findings.length) return
    const key = `${activeTaskId}:${findings.map((f) => f.id).join(',')}`
    if (autoJumpedKey.current === key) return
    autoJumpedKey.current = key

    const preferred =
      findings.find((f) => f.kind === 'mask' && typeof f.sliceIndex === 'number') ??
      findings.find((f) => typeof f.sliceIndex === 'number') ??
      findings[0]!

    setShowMasks(true)
    setHighlightedFindingId(preferred.id)
    if (typeof preferred.sliceIndex === 'number') setSliceIndex(preferred.sliceIndex)
    setTab('findings')
  }, [
    activeTaskId,
    result,
    findings,
    setShowMasks,
    setHighlightedFindingId,
    setSliceIndex,
  ])

  const onJump = useCallback(
    (finding: Finding) => {
      setHighlightedFindingId(finding.id)
      if (typeof finding.sliceIndex === 'number') setSliceIndex(finding.sliceIndex)
    },
    [setHighlightedFindingId, setSliceIndex],
  )

  const onToggleSelect = useCallback((id: string) => {
    setSelectedFindingIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }, [])

  const onSelectAll = useCallback((ids: string[]) => {
    setSelectedFindingIds(ids)
  }, [])

  const onReviewChange = useCallback((id: string, status: FindingReviewStatus) => {
    setReviews((prev) => ({ ...prev, [id]: status }))
  }, [])

  const reviewSummary = useMemo(() => {
    let accepted = 0
    let rejected = 0
    let corrected = 0
    let pending = 0
    for (const f of findings) {
      const r = reviews[f.id] ?? 'pending'
      if (r === 'accepted') accepted++
      else if (r === 'rejected') rejected++
      else if (r === 'corrected') corrected++
      else pending++
    }
    return { accepted, rejected, corrected, pending }
  }, [findings, reviews])

  const modalityLabel = modality || '当前'

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border bg-surface-1" data-testid="ai-panel">
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as AiTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="border-b border-border px-2 py-2">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="analyze" className="px-1.5 text-xs">
              分析
            </TabsTrigger>
            <TabsTrigger value="findings" className="px-1.5 text-xs">
              检出
            </TabsTrigger>
            <TabsTrigger value="layers" className="px-1.5 text-xs" data-testid="ai-tab-layers">
              图层
            </TabsTrigger>
            <TabsTrigger value="report" className="px-1.5 text-xs">
              报告
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="analyze" className="mt-0 min-h-0 flex-1 overflow-y-auto p-3">
          <div className="space-y-4">
            {!modelsQuery.isLoading && !hasCompatible ? (
              <EmptyState
                icon={<Cpu className="h-5 w-5" />}
                title={`当前 ${modalityLabel} 序列暂无适用模型`}
                description="请切换到兼容模态的序列，或在模型仓库启用对应模型。"
                className="border border-dashed border-border py-8"
              />
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-xs text-muted" htmlFor="ai-model-select">
                    选择模型
                  </label>
                  <Select
                    value={selected?.id ?? undefined}
                    onValueChange={setSelectedModelId}
                    disabled={!hasCompatible}
                  >
                    <SelectTrigger
                      id="ai-model-select"
                      data-testid="model-select"
                      aria-label="选择模型"
                    >
                      <SelectValue placeholder="选择适用模型" />
                    </SelectTrigger>
                    <SelectContent>
                      {compatibleModels.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name} · {taskTypeLabel(m.task_type)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selected && (
                    <p className="text-xs leading-relaxed text-muted line-clamp-3">
                      {selected.description}
                    </p>
                  )}
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
                    disabled={!selected || runMutation.isPending || busy}
                    onClick={() => {
                      if (!selected) {
                        toast.error('请先选择模型')
                        return
                      }
                      if (!paramsValid) {
                        toast.error('请修正模型参数后再运行')
                        return
                      }
                      runMutation.mutate()
                    }}
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
              </>
            )}

            {task && (
              <div
                className="space-y-2 rounded-lg border border-border bg-surface-0 p-3"
                data-testid="task-progress"
              >
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge status={task.status} />
                  <span className="text-xs text-muted">{stageLabel(task.stage)}</span>
                </div>
                {(task.status === 'queued' || task.status === 'running') && (
                  <Progress value={task.progress} />
                )}
                <p className="text-xs text-muted">{task.message}</p>
              </div>
            )}

            {result && (
              <div className="rounded-lg border border-border bg-surface-0 p-3">
                <div className="text-xs font-medium text-fg-strong">结果摘要</div>
                <p className="mt-1 text-xs leading-relaxed text-muted">{result.summary}</p>
                <p className="mt-2 text-xs text-muted">耗时 {formatMs(result.runtime_ms)}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setTab('findings')}
                >
                  查看检出 ({findings.length})
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="findings" className="mt-0 min-h-0 flex-1 overflow-y-auto p-3">
          {result ? (
            <FindingsList
              findings={findings}
              currentSliceIndex={sliceIndex}
              enabledMaskIds={enabledMaskIds}
              onToggleMask={toggleMaskId}
              onJump={onJump}
              highlightedId={highlightedFindingId}
              hoveredId={hoveredFindingId}
              onHover={setHoveredFindingId}
              selectedIds={selectedFindingIds}
              onToggleSelect={onToggleSelect}
              onSelectAll={onSelectAll}
              reviews={reviews}
              onReviewChange={onReviewChange}
            />
          ) : (
            <p className="text-xs text-muted">运行推理后，检出结果将显示在此</p>
          )}
        </TabsContent>

        <TabsContent value="layers" className="mt-0 min-h-0 flex-1 overflow-y-auto p-3">
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">分割掩膜</span>
              <Switch
                checked={showMasks}
                onCheckedChange={setShowMasks}
                aria-label="显示分割掩膜"
                data-testid="show-masks"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">检测框</span>
              <Switch
                checked={showBoxes}
                onCheckedChange={setShowBoxes}
                aria-label="显示检测框"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">测量标注</span>
              <Switch
                checked={showAnnotations}
                onCheckedChange={setShowAnnotations}
                aria-label="显示测量标注"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">CAM 热图</span>
              <Switch
                checked={showCam}
                onCheckedChange={setShowCam}
                disabled={!result?.cam_overlay_uri}
                aria-label="显示 CAM 热图"
                data-testid="show-cam"
              />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs text-muted">
                <span>掩膜透明度</span>
                <span>{Math.round(maskOpacity * 100)}%</span>
              </div>
              <Slider
                min={0}
                max={1}
                step={0.05}
                value={[maskOpacity]}
                aria-label="掩膜叠加透明度"
                onValueChange={([v]) => setMaskOpacity(v ?? maskOpacity)}
              />
            </div>
            {result?.cam_overlay_uri && (
              <div>
                <div className="mb-1 flex justify-between text-xs text-muted">
                  <span>CAM 透明度</span>
                  <span>{Math.round(camOpacity * 100)}%</span>
                </div>
                <Slider
                  min={0}
                  max={1}
                  step={0.05}
                  value={[camOpacity]}
                  aria-label="CAM 叠加透明度"
                  onValueChange={([v]) => setCamOpacity(v ?? camOpacity)}
                />
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="report" className="mt-0 min-h-0 flex-1 overflow-y-auto p-3">
          {activeTaskId && result ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-surface-0 p-3 text-xs text-muted">
                审阅：接受 {reviewSummary.accepted} · 拒绝 {reviewSummary.rejected} · 修正{' '}
                {reviewSummary.corrected} · 待审 {reviewSummary.pending}
              </div>
              <ReportPanel
                taskId={activeTaskId}
                findingIds={selectedFindingIds}
                reviews={reviews}
              />
            </div>
          ) : (
            <p className="text-xs text-muted">完成推理并勾选检出后可生成结构化报告</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
