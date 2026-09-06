import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { TaskList } from '@/features/tasks/TaskList'

export function TasksPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [modelId, setModelId] = useState('')
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')

  const models = useQuery({
    queryKey: ['models'],
    queryFn: () => api.listModels(),
  })

  const modelOptions = useMemo(() => models.data?.items ?? [], [models.data])

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

      <div className="mb-4 flex flex-wrap items-center gap-2">
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
              if (e.key === 'Enter') {
                setPage(1)
                setQ(qInput.trim())
              }
            }}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setPage(1)
            setQ(qInput.trim())
          }}
        >
          搜索
        </Button>
        <Select
          className="w-40"
          value={status}
          aria-label="按状态筛选"
          onChange={(e) => {
            setPage(1)
            setStatus(e.target.value)
          }}
        >
          <option value="">全部状态</option>
          <option value="queued">排队中</option>
          <option value="running">运行中</option>
          <option value="succeeded">成功</option>
          <option value="failed">失败</option>
          <option value="canceled">已取消</option>
        </Select>
        <Select
          className="w-44"
          value={modelId}
          aria-label="按模型筛选"
          data-testid="tasks-model-filter"
          onChange={(e) => {
            setPage(1)
            setModelId(e.target.value)
          }}
        >
          <option value="">全部模型</option>
          {modelOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
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
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
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
