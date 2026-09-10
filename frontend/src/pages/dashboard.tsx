import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Database,
  Boxes,
  ListTodo,
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChevronsUpDown,
  RefreshCw,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '@/lib/api'
import {
  formatMs,
  formatNumber,
  formatPatientName,
  formatPercent,
} from '@/lib/format'
import { AbsoluteTime } from '@/components/AbsoluteTime'
import { PageHeader } from '@/components/PageHeader'
import { KpiCard } from '@/components/KpiCard'
import { StatusBadge } from '@/components/StatusBadge'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { primaryMetrics, taskTypeLabel } from '@/features/models/metrics'
import type { TaskSummary } from '@/types/api'
import { cn } from '@/lib/utils'

function readToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function shortDate(iso: string): string {
  const parts = iso.split('-')
  if (parts.length < 3) return iso
  return `${parts[1]}-${parts[2]}`
}

const columnHelper = createColumnHelper<TaskSummary>()

export function DashboardPage() {
  const overview = useQuery({
    queryKey: ['overview'],
    queryFn: api.overview,
    refetchInterval: 15_000,
  })

  const [sorting, setSorting] = useState<SortingState>([{ id: 'created_at', desc: true }])
  const [chartStroke, setChartStroke] = useState(() => readToken('--color-surface-1', '#111827'))
  const [successFill, setSuccessFill] = useState(() => readToken('--color-success', '#22c55e'))

  useEffect(() => {
    setChartStroke(readToken('--color-surface-1', '#111827'))
    setSuccessFill(readToken('--color-success', '#22c55e'))
  }, [])

  const recentTasks = overview.data?.recent_tasks ?? []

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'patient',
        header: '检查',
        cell: (info) => {
          const t = info.row.original
          return (
            <div>
              <Link to={`/tasks/${t.task_id}`} className="text-sm text-fg-strong hover:text-brand">
                {formatPatientName(t.patient_name)}
              </Link>
              <div className="text-xs text-muted">
                {t.model_name || t.model_id}
                {t.modality ? ` · ${t.modality}` : ''}
              </div>
            </div>
          )
        },
      }),
      columnHelper.accessor('status', {
        header: '状态',
        cell: (info) => <StatusBadge status={info.getValue()} />,
      }),
      columnHelper.accessor('runtime_ms', {
        header: '耗时',
        cell: (info) => {
          const row = info.row.original
          if (row.cache_hit) {
            return (
              <Badge variant="secondary" className="font-normal">
                缓存
              </Badge>
            )
          }
          return <span className="tabular-nums">{formatMs(info.getValue())}</span>
        },
      }),
      columnHelper.accessor('created_at', {
        header: '时间',
        cell: (info) => <AbsoluteTime value={info.getValue()} className="text-xs text-muted" />,
      }),
    ],
    [],
  )

  const table = useReactTable({
    data: recentTasks,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (overview.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    )
  }

  if (overview.isError) {
    return (
      <EmptyState
        title="无法加载总览数据"
        description={(overview.error as Error).message}
        action={
          <Button onClick={() => void overview.refetch()}>
            <RefreshCw className="h-4 w-4" />
            重试
          </Button>
        }
      />
    )
  }

  const data = overview.data!
  const queue = data.queue ?? { queued: 0, running: 0, max_concurrency: 0 }
  const modelMetrics = data.model_metrics ?? []
  const dailyTasks = data.daily_tasks ?? []
  const modelUsage = data.model_usage ?? []
  const dailyChart = dailyTasks.map((d) => ({
    ...d,
    label: shortDate(d.date),
  }))
  const hasDailyActivity = dailyTasks.some((d) => d.total > 0)
  const todaySpark = dailyTasks.map((d) => d.total)

  const usageById = new Map(modelUsage.map((u) => [u.model_id, u]))
  const modelRows = modelMetrics.map((m) => {
    const u = usageById.get(m.id)
    const entries = primaryMetrics(m.task_type, m.metrics, 1)
    const failRate = u && u.total > 0 ? u.failed / u.total : 0
    return {
      id: m.id,
      name: m.name,
      task_type: m.task_type,
      enabled: m.enabled !== false,
      total: u?.total ?? 0,
      succeeded: u?.succeeded ?? 0,
      failed: u?.failed ?? 0,
      avg_runtime_ms: u?.avg_runtime_ms ?? null,
      primaryMetric: entries[0] ? `${entries[0].label} ${formatNumber(entries[0].value, 3)}` : '—',
      failRate,
    }
  })

  const queueLoad = queue.queued + queue.running
  const queueCapacity = Math.max(1, queue.max_concurrency)
  const queuePct = Math.min(100, Math.round((queue.running / queueCapacity) * 100))
  const queueTone =
    queueLoad > queue.max_concurrency
      ? 'danger'
      : queueLoad >= Math.max(1, queue.max_concurrency)
        ? 'warning'
        : 'default'

  const successRate = data.kpis.success_rate
  const successTone =
    successRate == null
      ? 'default'
      : successRate < 0.9
        ? 'danger'
        : successRate < 0.97
          ? 'warning'
          : 'success'

  const disabledCount = modelRows.filter((m) => !m.enabled).length
  const failingModels = modelRows.filter((m) => m.failRate >= 0.2 && m.total >= 2).length

  return (
    <div>
      <PageHeader
        title="总览"
        description="真实运营指标与推理队列一览"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void overview.refetch()}>
              <RefreshCw className="h-4 w-4" />
              刷新
            </Button>
            <Link
              to="/data"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-3.5 text-sm text-white hover:bg-brand-hover"
            >
              进入数据中心
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="入库检查"
          value={formatNumber(data.kpis.study_count)}
          hint="已入库检查"
          icon={<Database className="h-5 w-5" />}
        />
        <KpiCard
          title="可用模型"
          value={formatNumber(data.kpis.model_count)}
          hint={`已注册 ${data.registered_models}${disabledCount ? ` · 停用 ${disabledCount}` : ''}`}
          icon={<Boxes className="h-5 w-5" />}
        />
        <KpiCard
          title="今日推理"
          value={formatNumber(data.kpis.today_tasks)}
          hint={
            data.kpis.failed_today > 0
              ? `失败 ${data.kpis.failed_today} · 队列 ${queue.queued}/${queue.running}`
              : `队列 ${queue.queued}/${queue.running}`
          }
          icon={<ListTodo className="h-5 w-5" />}
          tone={data.kpis.failed_today > 0 ? 'warning' : queueTone}
          sparkline={todaySpark}
        />
        <KpiCard
          title="任务成功率"
          value={successRate == null ? '—' : formatPercent(successRate, 0)}
          hint={
            successRate == null
              ? '尚无已完成任务'
              : `分割模型 Dice 均值 ${formatNumber(data.kpis.avg_dice, 3)}`
          }
          icon={<Activity className="h-5 w-5" />}
          tone={successTone}
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>近 14 日任务量</CardTitle>
            <span className="text-xs text-muted">仅统计真实任务</span>
          </CardHeader>
          <CardContent className="min-h-[16rem] h-64">
            {!hasDailyActivity ? (
              <EmptyState
                title="暂无任务时序"
                description="发起推理后，将按日展示成功 / 失败数量。"
                className="py-10"
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%" minHeight={220} debounce={50}>
                <BarChart data={dailyChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
                    axisLine={{ stroke: 'var(--color-border)' }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                  />
                  <Tooltip
                    contentStyle={{
                      background: chartStroke,
                      border: '1px solid var(--color-border)',
                      borderRadius: 8,
                      color: 'var(--color-fg)',
                    }}
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload as { date?: string } | undefined
                      return row?.date ?? ''
                    }}
                  />
                  <Bar
                    dataKey="succeeded"
                    name="成功"
                    stackId="a"
                    fill={successFill}
                    stroke={chartStroke}
                    strokeWidth={0}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="failed"
                    name="失败"
                    stackId="a"
                    fill="var(--color-danger, #ef4444)"
                    stroke={chartStroke}
                    strokeWidth={0}
                    isAnimationActive={false}
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader>
            <CardTitle>队列与模型健康</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-muted">并发利用率</span>
                <span className="tabular-nums text-fg">
                  {queue.running} / {queue.max_concurrency}
                </span>
              </div>
              <Progress value={queuePct} />
              <p className="mt-1.5 text-xs text-muted">排队 {queue.queued} · 运行 {queue.running}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border bg-surface-0 px-3 py-2">
                <div className="text-[11px] text-muted">启用模型</div>
                <div className="mt-0.5 text-lg tabular-nums text-fg-strong">
                  {modelRows.filter((m) => m.enabled).length}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-surface-0 px-3 py-2">
                <div className="text-[11px] text-muted">高失败率</div>
                <div
                  className={cn(
                    'mt-0.5 text-lg tabular-nums',
                    failingModels > 0 ? 'text-warning' : 'text-fg-strong',
                  )}
                >
                  {failingModels}
                </div>
              </div>
            </div>

            <ul className="max-h-40 space-y-1.5 overflow-y-auto">
              {modelRows.map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-xs">
                  {m.enabled ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 shrink-0 text-muted" />
                  )}
                  <Link to={`/models/${m.id}`} className="min-w-0 flex-1 truncate hover:text-brand">
                    {m.name}
                  </Link>
                  <span className="shrink-0 tabular-nums text-muted">
                    {m.enabled ? `${m.succeeded}/${m.total || '—'}` : '已停用'}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>模型运行</CardTitle>
          <Link to="/models" className="text-xs text-brand hover:underline">
            模型仓库
          </Link>
        </CardHeader>
        <CardContent>
          {modelRows.length === 0 ? (
            <EmptyState title="暂无模型" className="py-10" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>模型</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>调用</TableHead>
                  <TableHead>成功</TableHead>
                  <TableHead>失败</TableHead>
                  <TableHead>均耗时</TableHead>
                  <TableHead>主指标</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {modelRows.map((m) => (
                  <TableRow key={m.id} className={cn(!m.enabled && 'opacity-60')}>
                    <TableCell>
                      <Link to={`/models/${m.id}`} className="text-fg-strong hover:text-brand">
                        {m.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge family="tag" variant="secondary">
                        {taskTypeLabel(m.task_type)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {m.enabled ? (
                        <span className="text-xs text-success">启用</span>
                      ) : (
                        <span className="text-xs text-muted">停用</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{m.total}</TableCell>
                    <TableCell className="tabular-nums text-success">{m.succeeded}</TableCell>
                    <TableCell className="tabular-nums text-danger">{m.failed}</TableCell>
                    <TableCell className="tabular-nums">
                      {m.avg_runtime_ms != null ? formatMs(m.avg_runtime_ms) : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted">{m.primaryMetric}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>近期任务</CardTitle>
          <Link to="/tasks" className="text-xs text-brand hover:underline">
            全部任务
          </Link>
        </CardHeader>
        <CardContent>
          {recentTasks.length === 0 ? (
            <EmptyState
              title="还没有推理任务"
              description="上传影像后，在阅片器中选择模型即可发起分析。"
              action={
                <Link
                  to="/data"
                  className="inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-sm text-white"
                >
                  前往数据中心
                </Link>
              }
              className="py-10"
            />
          ) : (
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((header) => {
                      const sorted = header.column.getIsSorted()
                      return (
                        <TableHead
                          key={header.id}
                          className="cursor-pointer select-none"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <span className="inline-flex items-center gap-1">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sorted === 'asc' ? (
                              <ArrowUp className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                            ) : sorted === 'desc' ? (
                              <ArrowDown className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                            ) : (
                              <ChevronsUpDown
                                className="h-3.5 w-3.5 shrink-0 text-muted/60"
                                aria-hidden
                              />
                            )}
                          </span>
                        </TableHead>
                      )
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
