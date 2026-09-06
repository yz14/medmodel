import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { FilterChips } from '@/components/DataTable/FilterChips'
import { TaskList } from '@/features/tasks/TaskList'
import { useUrlFilters } from '@/hooks/useUrlFilters'

const TASK_DEFAULTS = { q: '', status: '', model_id: '', page: '1' }

export function TasksPage() {
  const { filters, setFilters, clearFilter, clearAll } = useUrlFilters(TASK_DEFAULTS)
  const [qInput, setQInput] = useState(filters.q)

  useEffect(() => {
    setQInput(filters.q)
  }, [filters.q])

  const page = Math.max(1, Number(filters.page) || 1)
  const status = filters.status
  const modelId = filters.model_id
  const q = filters.q

  const models = useQuery({
    queryKey: ['models'],
    queryFn: () => api.listModels(),
  })

  const modelOptions = useMemo(() => models.data?.items ?? [], [models.data])
  const modelName = useMemo(
    () => modelOptions.find((m) => m.id === modelId)?.name ?? modelId,
    [modelOptions, modelId],
  )

  const tasks = useQuery({
    queryKey: ['tasks', page, status, modelId, q],
    queryFn: () =>
      api.listTasks({
        page,
        page_size: 20,
        status: status || undefined,
        model_id: modelId || undefined,
        q: q || undefined,
      }),
    refetchInterval: 5000,
  })

  const totalPages = Math.max(1, Math.ceil((tasks.data?.total ?? 0) / (tasks.data?.page_size ?? 20)))

  const chips = useMemo(() => {
    const list = []
    if (q) list.push({ key: 'q', label: '搜索', value: q })
    if (status) list.push({ key: 'status', label: '状态', value: status })
    if (modelId) list.push({ key: 'model_id', label: '模型', value: modelName })
    return list
  }, [q, status, modelId, modelName])

  const applySearch = () => setFilters({ q: qInput.trim(), page: '1' })

  return (
    <div>
      <PageHeader
        title="推理任务"
        description="查看进度、日志、取消与重试"
        actions={
          <Button variant="secondary" onClick={() => void tasks.refetch()} aria-label="刷新任务列表">
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <Input
            className="pl-8"
            placeholder="搜索任务 / 序列 / 模型 / 错误码"
            value={qInput}
            aria-label="搜索任务"
            data-testid="tasks-search"
            onChange={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch()
            }}
          />
        </div>
        <Button variant="outline" size="sm" onClick={applySearch}>
          搜索
        </Button>
        <Select
          value={status || '__all__'}
          onValueChange={(v) => {
            setFilters({ status: v === '__all__' ? '' : v, page: '1' })
          }}
        >
          <SelectTrigger className="w-40" aria-label="按状态筛选">
            <SelectValue placeholder="全部状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">全部状态</SelectItem>
            <SelectItem value="queued">排队中</SelectItem>
            <SelectItem value="running">运行中</SelectItem>
            <SelectItem value="succeeded">成功</SelectItem>
            <SelectItem value="failed">失败</SelectItem>
            <SelectItem value="canceled">已取消</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={modelId || '__all__'}
          onValueChange={(v) => {
            setFilters({ model_id: v === '__all__' ? '' : v, page: '1' })
          }}
        >
          <SelectTrigger className="w-44" aria-label="按模型筛选" data-testid="tasks-model-filter">
            <SelectValue placeholder="全部模型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">全部模型</SelectItem>
            {modelOptions.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mb-3">
        <FilterChips
          chips={chips}
          onClear={(key) => {
            if (key === 'q') setQInput('')
            clearFilter(key as 'q' | 'status' | 'model_id' | 'page')
            if (key !== 'page') setFilters({ page: '1' })
          }}
          onClearAll={() => {
            setQInput('')
            clearAll()
          }}
        />
      </div>

      {tasks.isLoading && <Skeleton className="h-72" />}

      {tasks.isError && (
        <EmptyState
          title="加载任务失败"
          description={(tasks.error as Error).message}
          action={
            <Button onClick={() => void tasks.refetch()}>
              <RefreshCw className="h-4 w-4" />
              重试
            </Button>
          }
        />
      )}

      {tasks.data && tasks.data.items.length === 0 && (
        <EmptyState title="暂无任务" description="在阅片器中选择模型并运行推理后，任务会出现在这里。" />
      )}

      {tasks.data && tasks.data.items.length > 0 && (
        <>
          <TaskList tasks={tasks.data.items} />
          <div className="mt-4 flex items-center justify-between text-xs text-muted">
            <span>
              共 {tasks.data.total} 条 · 第 {page}/{totalPages} 页
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setFilters({ page: String(page - 1) })}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setFilters({ page: String(page + 1) })}
              >
                下一页
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
