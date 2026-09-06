import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Database,
  Boxes,
  ListTodo,
  Activity,
  ArrowRight,
  RefreshCw,
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
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '@/lib/api'
import { formatMs, formatNumber, formatPercent, formatRelative, shortUid } from '@/lib/format'
import { PageHeader } from '@/components/PageHeader'
import { KpiCard } from '@/components/KpiCard'
import { StatusBadge } from '@/components/StatusBadge'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { primaryMetrics, taskTypeLabel } from '@/features/models/metrics'
import type { TaskSummary } from '@/types/api'

const DIST_LABEL: Record<string, string> = {
  segmentation: '分割',
  detection: '检测',
  classification: '分类',
}

/** Resolved once from CSS tokens so SVG fill works on dark first paint (N-F11). */
function readChartColors(): string[] {
  if (typeof window === 'undefined') {
    return ['#3b82f6', '#0ea5e9', '#22c55e', '#f59e0b']
  }
  const styles = getComputedStyle(document.documentElement)
  const keys = ['--brand', '--info', '--success', '--warning']
  const fallback = ['#3b82f6', '#0ea5e9', '#22c55e', '#f59e0b']
  return keys.map((k, i) => {
    const raw = styles.getPropertyValue(k).trim()
    return raw || fallback[i]
  })
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
  const [chartColors, setChartColors] = useState(readChartColors)

  useEffect(() => {
    setChartColors(readChartColors())
  }, [])

  const recentTasks = overview.data?.recent_tasks ?? []

  const columns = useMemo(
    () => [
      columnHelper.accessor('task_id', {
        header: '任务',
        cell: (info) => (
          <Link to={`/tasks/${info.getValue()}`} className="font-mono text-xs text-brand">
            {shortUid(info.getValue())}
          </Link>
        ),
      }),
      columnHelper.accessor('model_id', {
        header: '模型',
        cell: (info) => {
          const usage = overview.data?.model_usage?.find((u) => u.model_id === info.getValue())
          return usage?.name ?? info.getValue()
        },
      }),
      columnHelper.accessor('status', {
        header: '状态',
        cell: (info) => <StatusBadge status={info.getValue()} />,
      }),
      columnHelper.accessor('progress', {
        header: '进度',
        cell: (info) => (
          <span className="tabular-nums">{formatPercent(info.getValue(), 0)}</span>
        ),
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
        cell: (info) => (
          <span className="text-xs text-muted">{formatRelative(info.getValue())}</span>
        ),
      }),
    ],
    [overview.data?.model_usage],
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
  const modelDistribution = data.model_distribution ?? {}
  const queue = data.queue ?? { queued: 0, running: 0, max_concurrency: 0 }
  const modelMetrics = data.model_metrics ?? []
  const dailyTasks = data.daily_tasks ?? []
  const modelUsage = data.model_usage ?? []
  const chartData = Object.entries(modelDistribution).map(([key, value]) => ({
    name: DIST_LABEL[key] ?? key,
    value,
  }))
  const dailyChart = dailyTasks.map((d) => ({
    ...d,
    label: shortDate(d.date),
  }))
  const hasDailyActivity = dailyTasks.some((d) => d.total > 0)

  const queueLoad = queue.queued + queue.running
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
          hint="已入库 Study"
          icon={<Database className="h-5 w-5" />}
        />
        <KpiCard
          title="可用模型"
          value={formatNumber(data.kpis.model_count)}
          hint={`已注册 ${data.registered_models}`}
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
            <span className="text-xs text-muted">仅统计真实任务，无数据则留空</span>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'var(--muted)', fontSize: 12 }}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: 'var(--muted)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      color: 'var(--fg)',
                    }}
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload as { date?: string } | undefined
                      return row?.date ?? ''
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="succeeded"
                    name="成功"
                    stackId="a"
                    fill={chartColors[2]}
                    isAnimationActive={false}
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="failed"
                    name="失败"
                    stackId="a"
                    fill="var(--danger, #ef4444)"
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
            <CardTitle>模型类型分布</CardTitle>
          </CardHeader>
          <CardContent className="min-h-[16rem] h-64">
            {chartData.every((d) => d.value === 0) ? (
              <EmptyState title="暂无分布数据" className="py-10" />
            ) : (
              <ResponsiveContainer width="100%" height="100%" minHeight={220} debounce={50}>
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    isAnimationActive={false}
                  >
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={chartColors[i % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      color: 'var(--fg)',
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>按模型调用</CardTitle>
            <Link to="/tasks" className="text-xs text-brand hover:underline">
              任务中心
            </Link>
          </CardHeader>
          <CardContent>
            {modelUsage.length === 0 ? (
              <EmptyState title="暂无调用记录" className="py-10" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>模型</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>调用</TableHead>
                    <TableHead>成功</TableHead>
                    <TableHead>失败</TableHead>
                    <TableHead>均耗时</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modelUsage.map((u) => (
                    <TableRow key={u.model_id}>
                      <TableCell>
                        <Link
                          to={`/models/${u.model_id}`}
                          className="text-fg-strong hover:text-brand"
                        >
                          {u.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge family="tag" variant="secondary">
                          {taskTypeLabel(u.task_type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">{u.total}</TableCell>
                      <TableCell className="tabular-nums text-success">{u.succeeded}</TableCell>
                      <TableCell className="tabular-nums text-danger">{u.failed}</TableCell>
                      <TableCell className="tabular-nums">
                        {u.avg_runtime_ms != null ? formatMs(u.avg_runtime_ms) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-5">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>模型评估指标</CardTitle>
            <Link to="/models" className="text-xs text-brand hover:underline">
              查看全部
            </Link>
          </CardHeader>
          <CardContent>
            {modelMetrics.length === 0 ? (
              <EmptyState title="暂无模型指标" className="py-10" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>模型</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>主指标</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modelMetrics.map((m) => {
                    const entries = primaryMetrics(m.task_type, m.metrics, 2)
                    return (
                      <TableRow key={m.id}>
                        <TableCell>
                          <Link to={`/models/${m.id}`} className="text-fg-strong hover:text-brand">
                            {m.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge family="tag" variant="info">
                            {taskTypeLabel(m.task_type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted">
                          {entries.length === 0
                            ? '—'
                            : entries
                                .map((e) => `${e.label} ${formatNumber(e.value, 3)}`)
                                .join(' · ')}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

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
                    {hg.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className="cursor-pointer select-none"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? null}
                      </TableHead>
                    ))}
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
