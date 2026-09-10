import { useMutation } from '@tanstack/react-query'
import { Copy, Download, FileText, Loader2, Printer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/sonner'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import type { ReportResponse } from '@/lib/api'
import type { FindingReviewStatus } from '@/features/viewer/FindingsList'
import { parseReportSections } from '@/features/viewer/findingLabels'
import { cn } from '@/lib/utils'

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
      toast.success('报告已生成', { duration: 2000 })
    },
    onError: (err) => toast.error(errorMessage(err, '生成报告失败')),
  })

  const sections = useMemo(
    () => (last?.text ? parseReportSections(last.text) : []),
    [last?.text],
  )
  const artifactLinks = useMemo(() => last?.artifacts ?? [], [last])

  const copyText = async () => {
    if (!last?.text) return
    try {
      await navigator.clipboard.writeText(last.text)
      toast.success('已复制报告全文', { duration: 2000 })
    } catch {
      toast.error('复制失败')
    }
  }

  const printReport = () => {
    if (!last?.text) return
    const w = window.open('', '_blank', 'noopener,noreferrer,width=720,height=900')
    if (!w) {
      toast.error('无法打开打印窗口')
      return
    }
    const escaped = last.text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    w.document.write(
      `<!doctype html><html><head><title>VoxFlow 报告</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:24px;line-height:1.5;color:#111}
        h1{font-size:16px;margin:0 0 12px}
        pre{white-space:pre-wrap;font-size:12px}
      </style></head><body>
      <h1>VoxFlow AI 结构化报告</h1>
      <pre>${escaped}</pre>
      <script>window.onload=()=>{window.print()}</script>
      </body></html>`,
    )
    w.document.close()
  }

  return (
    <div className="space-y-3" data-testid="report-panel">
      <div className="space-y-3 rounded-lg border border-border bg-surface-0 p-3">
        <div className="flex items-center justify-between gap-2 text-xs font-medium text-fg-strong">
          <span className="inline-flex items-center gap-2">
            <FileText className="h-3.5 w-3.5" />
            结构化报告
          </span>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          勾选检出并审阅后生成报告；DICOM 仅导出已接受与已修正项。
        </p>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">导出 SEG（分割）</span>
            <Switch checked={exportSeg} onCheckedChange={setExportSeg} aria-label="导出 SEG" />
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
          disabled={mutation.isPending}
          onClick={() => {
            if (findingIds.length === 0) {
              toast.error('请先勾选至少一个检出')
              return
            }
            mutation.mutate()
          }}
        >
          {mutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          生成报告（{findingIds.length}）
        </Button>
      </div>

      {last && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => void copyText()}>
              <Copy className="h-3 w-3" />
              复制
            </Button>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={printReport}>
              <Printer className="h-3 w-3" />
              打印
            </Button>
          </div>

          <div className="space-y-2" data-testid="report-text">
            {sections.map((sec) => (
              <section
                key={sec.id}
                className={cn(
                  'rounded-lg border border-border bg-surface-0 p-3',
                  sec.id === 'disclaimer' && 'border-warning/30 bg-warning/5',
                )}
              >
                <h3 className="text-xs font-medium text-fg-strong">{sec.title}</h3>
                <div className="mt-1.5 space-y-0.5 text-xs leading-relaxed text-muted">
                  {sec.lines
                    .filter((l) => l.trim())
                    .map((line, i) => (
                      <p key={i} className="whitespace-pre-wrap">
                        {line.replace(/^\s+/, '')}
                      </p>
                    ))}
                </div>
              </section>
            ))}
            {!sections.length && (
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-border bg-surface-0 p-2 text-xs">
                {last.text}
              </pre>
            )}
          </div>

          {artifactLinks.length > 0 && (
            <div className="space-y-1 rounded-lg border border-border bg-surface-0 p-3">
              <div className="text-xs font-medium text-fg-strong">导出文件</div>
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
          )}
        </div>
      )}
    </div>
  )
}
