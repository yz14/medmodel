import { useMutation } from '@tanstack/react-query'
import { Download, FileText, Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'
import type { ReportResponse } from '@/lib/api'

export function ReportPanel({
  taskId,
  findingIds,
}: {
  taskId: string
  findingIds: string[]
}) {
  const [exportSeg, setExportSeg] = useState(true)
  const [exportSr, setExportSr] = useState(true)
  const [exportGsps, setExportGsps] = useState(true)
  const [last, setLast] = useState<ReportResponse | null>(null)

  const mutation = useMutation({
    mutationFn: () =>
      api.createReport(taskId, {
        finding_ids: findingIds,
        export_seg: exportSeg,
        export_sr: exportSr,
        export_gsps: exportGsps,
      }),
    onSuccess: setLast,
  })

  const canRun = findingIds.length > 0 && !mutation.isPending
  const artifactLinks = useMemo(() => last?.artifacts ?? [], [last])

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-0 p-3" data-testid="report-panel">
      <div className="flex items-center gap-2 text-xs font-medium text-fg-strong">
        <FileText className="h-3.5 w-3.5" />
        结构化报告
      </div>
      <p className="text-[11px] leading-relaxed text-muted">
        勾选 Findings 后生成中文报告，并可导出 DICOM SEG / SR-TID1500 / GSPS（写入模型身份）。
      </p>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted">导出 SEG（分割）</span>
          <Switch checked={exportSeg} onCheckedChange={setExportSeg} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted">导出 SR（测量）</span>
          <Switch checked={exportSr} onCheckedChange={setExportSr} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted">导出 GSPS（检出框）</span>
          <Switch checked={exportGsps} onCheckedChange={setExportGsps} />
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
            className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-border bg-surface-1 p-2 text-[10px] leading-relaxed text-fg"
            data-testid="report-text"
          >
            {last.text}
          </pre>
          <div className="space-y-1">
            {artifactLinks.map((a) => (
              <a
                key={a.name}
                className="flex items-center gap-1.5 text-[11px] text-brand hover:underline"
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
