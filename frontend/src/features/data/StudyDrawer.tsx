import { Link } from 'react-router-dom'
import { Scan, Sparkles } from 'lucide-react'
import { api } from '@/lib/api'
import { formatAge, formatDate, formatPatientName, formatPercent, formatSex } from '@/lib/format'
import { AbsoluteTime } from '@/components/AbsoluteTime'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/StatusBadge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ThumbnailImg } from '@/components/ThumbnailImg'
import type { StudySummary } from '@/types/api'

export function StudyDrawer({
  study,
  open,
  onClose,
}: {
  study: StudySummary | null
  open: boolean
  onClose: () => void
}) {
  const lt = study?.last_task

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle>{study ? formatPatientName(study.patient_name) : '检查详情'}</SheetTitle>
          <SheetDescription>
            {[
              study?.patient_id,
              study ? formatSex(study.patient_sex) : null,
              study ? formatAge(study.patient_age) : null,
            ]
              .filter((x) => x && x !== '—')
              .join(' · ') || '—'}
          </SheetDescription>
        </SheetHeader>

        {study && (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-muted">模态</dt>
                  <dd className="mt-0.5 text-fg">{study.modality || '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted">部位</dt>
                  <dd className="mt-0.5 text-fg">{study.body_part || '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted">检查日期</dt>
                  <dd className="mt-0.5 text-fg">{formatDate(study.study_date)}</dd>
                </div>
                <div>
                  <dt className="text-muted">入库时间</dt>
                  <dd className="mt-0.5 text-fg">
                    <AbsoluteTime value={study.created_at} />
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted">描述</dt>
                  <dd className="mt-0.5 text-fg">{study.study_description || '—'}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted">机构</dt>
                  <dd className="mt-0.5 text-fg">{study.institution || '—'}</dd>
                </div>
              </dl>

              <div className="rounded-lg border border-border p-3">
                <div className="mb-2 text-xs font-medium text-muted">最近 AI 任务</div>
                {!lt ? (
                  <p className="text-sm text-muted">尚未对该检查发起推理</p>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={lt.status} />
                      {(lt.status === 'queued' || lt.status === 'running') && (
                        <span className="text-xs tabular-nums text-muted">
                          {formatPercent(lt.progress, 0)}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted">
                      模型 <span className="text-fg">{lt.model_name || lt.model_id}</span>
                      {lt.created_at ? (
                        <>
                          {' · '}
                          <AbsoluteTime value={lt.created_at} />
                        </>
                      ) : null}
                    </div>
                    {lt.error_message && (
                      <p className="text-xs text-danger">{lt.error_message}</p>
                    )}
                    <Link
                      to={`/tasks/${encodeURIComponent(lt.task_id)}`}
                      className="inline-flex text-xs text-brand hover:underline"
                    >
                      查看任务详情
                    </Link>
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-xs font-medium text-muted">
                  序列 ({study.series?.length ?? 0})
                </h3>
                <div className="space-y-2">
                  {(study.series ?? []).map((s) => (
                    <div key={s.series_uid} className="flex gap-3 rounded-lg border border-border p-2">
                      <ThumbnailImg
                        src={api.thumbnailUrl(s.series_uid)}
                        alt={s.description || s.series_uid}
                        className="h-16 w-16 rounded-md bg-black object-contain"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-fg-strong">
                          {s.description || s.series_uid}
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          {s.modality} · {s.num_instances} 帧 · {s.rows}×{s.cols}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <SheetFooter className="flex-row gap-2 border-t border-border p-4 sm:justify-stretch">
              <Link
                to={`/viewer/${encodeURIComponent(study.study_uid)}`}
                className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 text-sm hover:bg-surface-3"
              >
                <Scan className="h-4 w-4" />
                打开阅片
              </Link>
              <Link
                to={`/viewer/${encodeURIComponent(study.study_uid)}?panel=ai`}
                data-testid="open-viewer-ai"
                className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-brand text-sm text-white hover:bg-brand-hover"
              >
                <Sparkles className="h-4 w-4" />
                送去分析
              </Link>
              <Button variant="outline" onClick={onClose}>
                关闭
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
