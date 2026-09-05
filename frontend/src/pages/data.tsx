import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, RefreshCw, Search } from 'lucide-react'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { StudiesTable } from '@/features/data/StudiesTable'
import { StudyDrawer } from '@/features/data/StudyDrawer'
import { UploadDialog } from '@/features/data/UploadDialog'
import type { StudySummary } from '@/types/api'

export function DataPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [modality, setModality] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selected, setSelected] = useState<StudySummary | null>(null)

  const studies = useQuery({
    queryKey: ['studies', page, query, modality],
    queryFn: () =>
      api.listStudies({
        page,
        page_size: 20,
        q: query || undefined,
        modality: modality || undefined,
      }),
  })

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((studies.data?.total ?? 0) / (studies.data?.page_size ?? 20))),
    [studies.data],
  )

  return (
    <div>
      <PageHeader
        title="数据中心"
        description="管理检查、序列与影像上传"
        actions={
          <>
            <Button variant="secondary" onClick={() => void studies.refetch()}>
              <RefreshCw className="h-4 w-4" />
              刷新
            </Button>
            <Button onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4" />
              上传影像
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            className="pl-9"
            placeholder="搜索患者 / Study UID / 描述"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setPage(1)
                setQuery(q.trim())
              }
            }}
          />
        </div>
        <Select
          className="w-36"
          value={modality}
          onChange={(e) => {
            setPage(1)
            setModality(e.target.value)
          }}
        >
          <option value="">全部模态</option>
          <option value="CT">CT</option>
          <option value="MR">MR</option>
          <option value="DR">DR</option>
        </Select>
        <Button
          variant="outline"
          onClick={() => {
            setPage(1)
            setQuery(q.trim())
          }}
        >
          搜索
        </Button>
      </div>

      {studies.isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-64" />
        </div>
      )}

      {studies.isError && (
        <EmptyState
          title="加载检查列表失败"
          description={(studies.error as Error).message}
          action={
            <Button onClick={() => void studies.refetch()}>
              <RefreshCw className="h-4 w-4" />
              重试
            </Button>
          }
        />
      )}

      {studies.data && studies.data.items.length === 0 && (
        <EmptyState
          title="暂无影像数据"
          description="上传 DICOM/ZIP，或一键生成演示胸部 CT。"
          action={
            <Button onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4" />
              上传 / 生成演示
            </Button>
          }
        />
      )}

      {studies.data && studies.data.items.length > 0 && (
        <>
          <StudiesTable
            data={studies.data.items}
            onOpen={setSelected}
            onAnalyze={(study) => navigate(`/viewer/${encodeURIComponent(study.study_uid)}`)}
          />
          <div className="mt-4 flex items-center justify-between text-xs text-muted">
            <span>
              共 {studies.data.total} 条 · 第 {page}/{totalPages} 页
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

      <StudyDrawer study={selected} open={!!selected} onClose={() => setSelected(null)} />
      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  )
}
