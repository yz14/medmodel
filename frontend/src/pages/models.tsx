import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { ModelCard } from '@/features/models/ModelCard'

export function ModelsPage() {
  const queryClient = useQueryClient()
  const models = useQuery({
    queryKey: ['models'],
    queryFn: () => api.listModels(false),
  })

  const patchMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patchModel(id, { enabled }),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['models'] })
      void queryClient.invalidateQueries({ queryKey: ['overview'] })
      toast.success(vars.enabled ? '模型已启用' : '模型已停用')
    },
    onError: (err) => toast.error((err as Error).message || '更新失败'),
  })

  return (
    <div>
      <PageHeader
        title="模型仓库"
        description="自研 AI 模型注册、启停与能力浏览"
        actions={
          <Button variant="secondary" onClick={() => void models.refetch()}>
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
        }
      />

      {models.isLoading && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      )}

      {models.isError && (
        <EmptyState
          title="无法加载模型列表"
          description={(models.error as Error).message}
          action={
            <Button onClick={() => void models.refetch()}>
              <RefreshCw className="h-4 w-4" />
              重试
            </Button>
          }
        />
      )}

      {models.data && models.data.items.length === 0 && (
        <EmptyState title="暂无已注册模型" description="请确认后端模型插件已加载。" />
      )}

      {models.data && models.data.items.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {models.data.items.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              toggling={patchMutation.isPending}
              onToggle={(enabled) => patchMutation.mutate({ id: model.id, enabled })}
            />
          ))}
        </div>
      )}
    </div>
  )
}
