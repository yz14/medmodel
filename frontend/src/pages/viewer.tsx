import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, PanelLeft, PanelRight, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SeriesList } from '@/features/viewer/SeriesList'
import { StackViewport } from '@/features/viewer/StackViewport'
import { ViewerToolbar } from '@/features/viewer/ViewerToolbar'
import { AiPanel } from '@/features/viewer/AiPanel'
import { useViewerStore } from '@/stores/viewer-store'
import { cn } from '@/lib/utils'

export function ViewerPage() {
  const { studyId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const seriesUid = useViewerStore((s) => s.seriesUid)
  const setSeriesUid = useViewerStore((s) => s.setSeriesUid)
  const resetViewer = useViewerStore((s) => s.resetViewer)

  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)')
    const apply = () => {
      const wantAi = searchParams.get('panel') === 'ai'
      if (mq.matches) {
        setLeftOpen(false)
        setRightOpen(wantAi)
      } else {
        setLeftOpen(true)
        setRightOpen(true)
      }
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [searchParams])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === '[') {
        e.preventDefault()
        setLeftOpen((v) => !v)
      }
      if (e.key === ']') {
        e.preventDefault()
        setRightOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const studyQuery = useQuery({
    queryKey: ['study', studyId],
    queryFn: () => api.getStudy(studyId),
    enabled: !!studyId,
  })

  useEffect(() => {
    resetViewer()
    return () => resetViewer()
  }, [studyId, resetViewer])

  useEffect(() => {
    const series = studyQuery.data?.series
    if (!series?.length) return
    if (!seriesUid || !series.some((s) => s.series_uid === seriesUid)) {
      setSeriesUid(series[0]!.series_uid)
    }
  }, [studyQuery.data, seriesUid, setSeriesUid])

  const instancesQuery = useQuery({
    queryKey: ['instances', seriesUid],
    queryFn: () => api.listInstances(seriesUid!),
    enabled: !!seriesUid,
  })

  if (studyQuery.isLoading) {
    return (
      <div className="grid h-full grid-cols-1 md:grid-cols-[220px_1fr_300px]">
        <Skeleton className="h-full rounded-none" />
        <Skeleton className="h-full rounded-none" />
        <Skeleton className="hidden h-full rounded-none md:block" />
      </div>
    )
  }

  if (studyQuery.isError || !studyQuery.data) {
    return (
      <div className="p-6">
        <EmptyState
          title="无法打开检查"
          description={(studyQuery.error as Error)?.message || 'Study 不存在'}
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void studyQuery.refetch()}>
                <RefreshCw className="h-4 w-4" />
                重试
              </Button>
              <Link to="/data" className="inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-sm text-white">
                返回数据中心
              </Link>
            </div>
          }
        />
      </div>
    )
  }

  const study = studyQuery.data
  const sliceCount = instancesQuery.data?.total ?? 0
  const activeSeries = study.series?.find((s) => s.series_uid === seriesUid) ?? study.series?.[0]
  const patientLabel = `${study.patient_name || '未知患者'} · ${study.modality || '—'} · ${study.study_description || study.study_uid}`
  const viewportMeta = {
    patientName: study.patient_name,
    patientId: study.patient_id,
    patientSex: study.patient_sex,
    patientAge: study.patient_age,
    studyDescription: study.study_description,
    seriesDescription: activeSeries?.description,
    modality: activeSeries?.modality ?? study.modality,
    sliceThickness: activeSeries?.spacing?.[0] ?? null,
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 items-center gap-2 border-b border-border bg-surface-1 px-3">
        <Link to="/data" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
          <ArrowLeft className="h-3.5 w-3.5" />
          数据中心
        </Link>
        <span className="text-border">|</span>
        <span className="min-w-0 flex-1 truncate text-xs text-fg">{patientLabel}</span>
        <Link to={`/viewer-cs3d/${encodeURIComponent(studyId)}`} className="text-xs text-muted hover:text-fg">
          CS3D Spike
        </Link>
        <Button
          variant="ghost"
          size="icon"
          aria-label={leftOpen ? '折叠序列面板' : '展开序列面板'}
          aria-pressed={leftOpen}
          title="快捷键 ["
          onClick={() => setLeftOpen((v) => !v)}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={rightOpen ? '折叠 AI 面板' : '展开 AI 面板'}
          aria-pressed={rightOpen}
          title="快捷键 ]"
          onClick={() => setRightOpen((v) => !v)}
        >
          <PanelRight className="h-4 w-4" />
        </Button>
      </div>
      <div
        className={cn(
          'grid min-h-0 flex-1',
          leftOpen && rightOpen && 'grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)_320px]',
          leftOpen && !rightOpen && 'grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)]',
          !leftOpen && rightOpen && 'grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]',
          !leftOpen && !rightOpen && 'grid-cols-1',
        )}
      >
        {leftOpen && (
          <SeriesList
            series={study.series ?? []}
            activeUid={seriesUid}
            onSelect={(uid) => setSeriesUid(uid)}
          />
        )}
        <div className="relative flex min-h-0 min-w-0 flex-col">
          <ViewerToolbar
            sliceCount={sliceCount}
            patientLabel={activeSeries ? `${activeSeries.modality || 'OT'} · ${activeSeries.description || activeSeries.series_uid.slice(-12)}` : undefined}
          />
          {seriesUid && sliceCount > 0 ? (
            <StackViewport
              seriesUid={seriesUid}
              sliceCount={sliceCount}
              meta={viewportMeta}
              spacing={activeSeries?.spacing}
              className="flex-1"
            />
          ) : (
            <div className="flex flex-1 items-center justify-center bg-black text-sm text-white/60">
              {instancesQuery.isLoading ? '加载序列…' : '请选择序列'}
            </div>
          )}
        </div>
        {rightOpen &&
          (seriesUid ? <AiPanel seriesUid={seriesUid} /> : <div className="border-l border-border bg-surface-1" />)}
      </div>
    </div>
  )
}
