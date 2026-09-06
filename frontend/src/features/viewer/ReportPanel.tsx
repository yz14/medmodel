import { useMutation } from '@tanstack/react-query'
import { Download, FileText, Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/sonner'
import { api } from '@/lib/api'
import type { ReportResponse } from '@/lib/api'
import type { FindingReviewStatus } from '@/features/viewer/FindingsList'

export function ReportPanel({
  taskId,
  findingIds,
  reviews = {},
}: {
  taskId: string
  findingIds: string[]
  reviews?: Record<string, FindingReviewStatus>
}) {
  const [exportSeg, setExportSeg] = useState(true)
  const [exportSr, setExportSr] = useState(true)
  const [exportGsps, setExportGsps] = useState(true)
  const [last, setLast] = useState<ReportResponse | null>(null)

  const reviewPayload = useMemo(
    () =>
      findingIds.map((finding_id) => ({
        finding_id,
        status: reviews[finding_id] ?? 'pending',
      })),
    [findingIds, reviews],
  )

  const mutation = useMutation({
    mutationFn: () =>
      api.createReport(taskId, {
        finding_ids: findingIds,
        reviews: reviewPayload,
        export_seg: exportSeg,
        export_sr: exportSr,
        export_gsps: exportGsps,
      }),
    onSuccess: (res) => {
      setLast(res)
      toast.success('报告已生成')
    },
    onError: (err) => toast.error((err as Error).message || '生成报告失败'),
  })

  const canRun = findingIds.length > 0 && !mutation.isPending
  const artifactLinks = useMemo(() => last?.artifacts ?? [], [last])

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-0 p-3" data-testid="report-panel">
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-fg-strong">
        <span className="inline-flex items-center gap-2">
          <FileText className="h-3.5 w-3.5" />
          结构化报告
        </span>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        勾选 Findings 并审阅（接受/拒绝/修正）后生成中文报告；DICOM 仅导出已接受与已修正项。
      </p>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">导出 SEG（分割）</span>
          <Switch
            checked={exportSeg}
            onCheckedChange={setExportSeg}
            aria-label="导出 SEG"
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">导出 SR（测量）</span>
          <Switch checked={exportSr} onCheckedChange={setExportSr} aria-label="导出 SR" />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">导出 GSPS（检出框）</span>
          <Switch
            checked={exportGsps}
            onCheckedChange={setExportGsps}
            aria-label="导出 GSPS"
          />
        </div>
      </div>

      <Button
        className="w-full"
        size="sm"
        data-testid="generate-report"
        disabled={!canRun}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
        生成报告（{findingIds.length}）
      </Button>

      {mutation.isError && (
        <p className="text-xs text-danger">{(mutation.error as Error).message || '生成失败'}</p>
      )}

      {last && (
        <div className="space-y-2">
          <pre
            className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-border bg-surface-1 p-2 text-xs leading-relaxed text-fg"
            data-testid="report-text"
          >
            {last.text}
          </pre>
          <div className="space-y-1">
            {artifactLinks.map((a) => (
              <a
                key={a.name}
                className="flex items-center gap-1.5 text-xs text-brand hover:underline"
                href={a.url || api.artifactUrl(taskId, a.name)}
                download={a.name}
              >
                <Download className="h-3 w-3" />
                {a.name}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
