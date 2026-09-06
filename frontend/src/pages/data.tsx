import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, RefreshCw, Search } from 'lucide-react'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { FilterChips } from '@/components/DataTable/FilterChips'
import { StudiesTable } from '@/features/data/StudiesTable'
import { StudyDrawer } from '@/features/data/StudyDrawer'
import { UploadDialog } from '@/features/data/UploadDialog'
import { useUrlFilters } from '@/hooks/useUrlFilters'
import type { StudySummary } from '@/types/api'

const DATA_DEFAULTS = { q: '', modality: '', page: '1' }

export function DataPage() {
  const navigate = useNavigate()
  const { filters, setFilters, clearFilter, clearAll } = useUrlFilters(DATA_DEFAULTS)
  const [qInput, setQInput] = useState(filters.q)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selected, setSelected] = useState<StudySummary | null>(null)

  useEffect(() => {
    setQInput(filters.q)
  }, [filters.q])

  const page = Math.max(1, Number(filters.page) || 1)
  const query = filters.q
  const modality = filters.modality

  const studies = useQuery({
    queryKey: ['studies', page, query, modality],
    queryFn: () =>
      api.listStudies({
        page,
        page_size: 20,
        q: query || undefined,
        modality: modality || undefined,
      }),
    refetchInterval: (q) => {
      const items = q.state.data?.items ?? []
      const active = items.some((s) => {
        const st = s.last_task?.status
        return st === 'queued' || st === 'running'
      })
      return active ? 5_000 : false
    },
  })

  useEffect(() => {
    if (!selected || !studies.data) return
    const fresh = studies.data.items.find((s) => s.study_uid === selected.study_uid)
    if (fresh && fresh !== selected) setSelected(fresh)
  }, [studies.data, selected])

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((studies.data?.total ?? 0) / (studies.data?.page_size ?? 20))),
    [studies.data],
  )

  const chips = useMemo(() => {
    const list = []
    if (query) list.push({ key: 'q', label: '搜索', value: query })
    if (modality) list.push({ key: 'modality', label: '模态', value: modality })
    return list
  }, [query, modality])

  const applySearch = () => {
    setQInput(qInput.trim())
    setFilters({ q: qInput.trim(), page: '1' })
  }

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
            <Button onClick={() => setUploadOpen(true)} data-testid="upload-open">
              <Upload className="h-4 w-4" />
              上传影像
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            className="pl-9"
            placeholder="搜索患者 / Study UID / 描述"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch()
            }}
          />
        </div>
        <Select
          value={modality || '__all__'}
          onValueChange={(v) => {
            setFilters({ modality: v === '__all__' ? '' : v, page: '1' })
          }}
        >
          <SelectTrigger className="w-36" aria-label="按模态筛选">
            <SelectValue placeholder="全部模态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">全部模态</SelectItem>
            <SelectItem value="CT">CT</SelectItem>
            <SelectItem value="MR">MR</SelectItem>
            <SelectItem value="DR">DR</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={applySearch}>
          搜索
        </Button>
      </div>

      <div className="mb-3">
        <FilterChips
          chips={chips}
          onClear={(key) => {
            if (key === 'q') setQInput('')
            clearFilter(key as 'q' | 'modality' | 'page')
            if (key !== 'page') setFilters({ page: '1' })
          }}
          onClearAll={() => {
            setQInput('')
            clearAll()
          }}
        />
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

      <StudyDrawer study={selected} open={!!selected} onClose={() => setSelected(null)} />
      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  )
}
