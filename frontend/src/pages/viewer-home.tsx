import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Scan } from 'lucide-react'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'

export function ViewerHomePage() {
  const studies = useQuery({
    queryKey: ['studies', 'viewer-home'],
    queryFn: () => api.listStudies({ page: 1, page_size: 50 }),
  })

  return (
    <div>
      <PageHeader title="影像阅片" description="选择一个 Study 开始阅片与 AI 分析" />
      {studies.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : studies.isError ? (
        <EmptyState
          title="加载失败"
          description={(studies.error as Error).message}
          action={
            <Button variant="secondary" onClick={() => void studies.refetch()}>
              重试
            </Button>
          }
        />
      ) : !studies.data?.items.length ? (
        <EmptyState
          icon={<Scan className="h-5 w-5" />}
          title="暂无影像"
          description="请先在数据中心上传 DICOM 或生成演示数据"
          action={
            <Link
              to="/data"
              className="inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-sm text-white"
            >
              前往数据中心
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {studies.data.items.map((s) => (
            <Link
              key={s.study_uid}
              to={`/viewer/${encodeURIComponent(s.study_uid)}`}
              className="block rounded-xl border border-border bg-surface-1 p-4 transition hover:border-brand"
            >
              <p className="font-medium text-fg-strong">{s.patient_name || '匿名'}</p>
              <p className="mt-1 text-xs text-muted">
                {s.modality || '—'} · {s.num_series} 序列 · {s.study_description || s.study_uid}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
