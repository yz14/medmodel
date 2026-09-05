import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Database, Boxes, ListTodo, Target, ArrowRight, RefreshCw } from 'lucide-react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
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
      columnHelper.accessor('model_id', { header: '模型' }),
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
  const modelDistribution = data.model_distribution ?? {}
  const queue = data.queue ?? { queued: 0, running: 0, max_concurrency: 0 }
  const modelMetrics = data.model_metrics ?? []
  const chartData = Object.entries(modelDistribution).map(([key, value]) => ({
    name: DIST_LABEL[key] ?? key,
    value,
  }))

  const queueLoad = queue.queued + queue.running
  const queueTone =
    queueLoad > queue.max_concurrency
      ? 'danger'
      : queueLoad >= Math.max(1, queue.max_concurrency)
        ? 'warning'
        : 'default'

  return (
    <div>
      <PageHeader
        title="总览"
        description="模型运营与推理队列一览"
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
          title="标注/检查病例"
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
          title="今日推理任务"
          value={formatNumber(data.kpis.today_tasks)}
          hint={`队列 ${queue.queued}/${queue.running}`}
          icon={<ListTodo className="h-5 w-5" />}
          tone={queueTone}
        />
        <KpiCard
          title="平均 Dice"
          value={formatNumber(data.kpis.avg_dice, 3)}
          hint="分割模型均值"
          icon={<Target className="h-5 w-5" />}
          tone={data.kpis.avg_dice > 0 && data.kpis.avg_dice < 0.8 ? 'warning' : 'success'}
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>模型评估指标</CardTitle>
            <Link to="/models" className="text-xs text-brand hover:underline">
              查看全部
            </Link>
          </CardHeader>
          <CardContent>
            {modelMetrics.length === 0 ? (
              <EmptyState title="暂无分割模型指标" className="py-10" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>模型</TableHead>
                    <TableHead>Dice</TableHead>
                    <TableHead>IoU</TableHead>
                    <TableHead>HD95</TableHead>
                    <TableHead>ASD</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modelMetrics.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <Link to={`/models/${m.id}`} className="text-fg-strong hover:text-brand">
                          {m.name}
                        </Link>
                      </TableCell>
                      <TableCell className="tabular-nums">{formatNumber(m.dice, 3)}</TableCell>
                      <TableCell className="tabular-nums">{formatNumber(m.iou, 3)}</TableCell>
                      <TableCell className="tabular-nums">{formatNumber(m.hd95, 2)}</TableCell>
                      <TableCell className="tabular-nums">{formatNumber(m.asd, 2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader>
            <CardTitle>模型应用分布</CardTitle>
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

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>近期任务</CardTitle>
          <Link to="/tasks" className="text-xs text-brand hover:underline">
            任务中心
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
