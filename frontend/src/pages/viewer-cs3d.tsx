import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FlaskConical } from 'lucide-react'
import { api } from '@/lib/api'
import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { SeriesList } from '@/features/viewer/SeriesList'
import { Cs3dStackViewport } from '@/features/viewer/cs3d/Cs3dStackViewport'

/**
 * R7 Cornerstone3D dual-run spike — does NOT replace /viewer/:studyId.
 */
export function ViewerCs3dPage() {
  const { studyId = '' } = useParams()
  const [seriesUid, setSeriesUid] = useState<string | null>(null)

  const studyQuery = useQuery({
    queryKey: ['study', studyId],
    queryFn: () => api.getStudy(studyId),
    enabled: !!studyId,
  })

  useEffect(() => {
    const series = studyQuery.data?.series
    if (!series?.length) return
    if (!seriesUid || !series.some((s) => s.series_uid === seriesUid)) {
      setSeriesUid(series[0]!.series_uid)
    }
  }, [studyQuery.data, seriesUid])

  const instancesQuery = useQuery({
    queryKey: ['instances', seriesUid],
    queryFn: () => api.listInstances(seriesUid!),
    enabled: !!seriesUid,
  })

  if (studyQuery.isLoading) {
    return (
      <div className="grid h-full grid-cols-[200px_1fr]">
        <Skeleton className="h-full rounded-none" />
        <Skeleton className="h-full rounded-none" />
      </div>
    )
  }

  if (studyQuery.isError || !studyQuery.data) {
    return (
      <div className="p-6">
        <EmptyState
          title="无法打开检查（CS3D spike）"
          description={(studyQuery.error as Error)?.message || 'Study 不存在'}
          action={
            <Link to="/viewer" className="inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-sm text-white">
              返回阅片列表
            </Link>
          }
        />
      </div>
    )
  }

  const study = studyQuery.data
  const sliceCount = instancesQuery.data?.total ?? 0

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="viewer-cs3d-page">
      <div className="flex h-10 items-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-3">
        <FlaskConical className="h-3.5 w-3.5 text-amber-600" />
        <span className="text-xs font-medium text-amber-800 dark:text-amber-200">
          Cornerstone3D Spike（实验）· 主阅片路径未替换
        </span>
        <span className="text-border">|</span>
        <Link to={`/viewer/${encodeURIComponent(studyId)}`} className="text-xs text-muted hover:text-fg">
          打开正式阅片
        </Link>
        <span className="min-w-0 flex-1 truncate text-right text-xs text-muted">
          {study.patient_name || '未知患者'} · {study.modality || '—'}
        </span>
        <Link to="/viewer" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
          <ArrowLeft className="h-3.5 w-3.5" />
          列表
        </Link>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[200px_minmax(0,1fr)]">
        <SeriesList
          series={study.series ?? []}
          activeUid={seriesUid}
          onSelect={(uid) => setSeriesUid(uid)}
        />
        <div className="relative flex min-h-0 min-w-0 flex-col bg-black">
          <div className="flex h-9 items-center gap-2 border-b border-white/10 px-3 text-xs text-white/70">
            <span>滚轮切层 · 默认 CT 窗宽窗位</span>
            <span className="ml-auto tabular-nums">
              {seriesUid ? `${sliceCount} 帧` : '未选序列'}
            </span>
          </div>
          {seriesUid && sliceCount > 0 ? (
            <Cs3dStackViewport seriesUid={seriesUid} sliceCount={sliceCount} />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-white/60">
              {instancesQuery.isLoading ? '加载序列…' : '请选择序列'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
