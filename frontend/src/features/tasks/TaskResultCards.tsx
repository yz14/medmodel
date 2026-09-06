import { formatPercent } from '@/lib/format'
import { buildFindings } from '@/features/viewer/FindingsList'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import type { InferenceResult } from '@/types/api'

const TYPE_LABEL: Record<string, string> = {
  segmentation: '分割',
  detection: '检测',
  classification: '分类',
  multi: '多任务',
}

export function TaskResultCards({ result }: { result: InferenceResult }) {
  const findings = buildFindings(result)
  const masks = result.masks?.length ?? 0
  const boxes = result.boxes?.length ?? 0
  const preds = result.predictions?.length ?? 0

  return (
    <div className="space-y-4" data-testid="task-result-cards">
      <div className="flex flex-wrap items-center gap-2">
        <Badge family="tag" variant="info">
          {TYPE_LABEL[result.type] ?? result.type}
        </Badge>
        {masks > 0 && (
          <Badge family="tag" variant="secondary">
            掩膜 {masks}
          </Badge>
        )}
        {boxes > 0 && (
          <Badge family="tag" variant="secondary">
            检测框 {boxes}
          </Badge>
        )}
        {preds > 0 && (
          <Badge family="tag" variant="secondary">
            分类 {preds}
          </Badge>
        )}
        <span className="text-xs text-muted">耗时 {result.runtime_ms} ms</span>
      </div>

      {result.summary && <p className="text-sm leading-relaxed text-fg">{result.summary}</p>}

      {findings.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted">检出摘要</div>
          <ul className="space-y-2">
            {findings.map((f) => (
              <li
                key={f.id}
                className="rounded-lg border border-border bg-surface-0 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-fg-strong">{f.label}</span>
                  <span className="text-xs tabular-nums text-muted">
                    {formatPercent(f.score, 0)}
                  </span>
                </div>
                {f.meta && <div className="mt-0.5 text-xs text-muted">{f.meta}</div>}
                <Progress value={f.score} className="mt-1.5 h-1" />
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="rounded-lg border border-border bg-surface-0">
        <summary className="cursor-pointer px-3 py-2 text-xs text-muted hover:text-fg">
          原始 JSON（折叠）
        </summary>
        <pre className="max-h-72 overflow-auto border-t border-border p-3 text-xs text-muted">
          {JSON.stringify(result, null, 2)}
        </pre>
      </details>
    </div>
  )
}

export function groupArtifacts<T extends { name: string; media_type?: string | null }>(
  artifacts: T[],
): Array<{ group: string; items: T[] }> {
  const buckets = new Map<string, T[]>()
  for (const a of artifacts) {
    const mt = (a.media_type || '').toLowerCase()
    const name = a.name.toLowerCase()
    let group = '其它'
    if (mt.includes('seg') || name.includes('seg')) group = 'SEG 分割'
    else if (mt.includes('sr') || name.includes('.sr') || name.includes('report')) group = 'SR 报告'
    else if (mt.includes('gsps') || name.includes('gsps')) group = 'GSPS'
    else if (name.includes('mask') || mt.includes('png') || mt.includes('image')) group = '掩膜 / 图像'
    const list = buckets.get(group) ?? []
    list.push(a)
    buckets.set(group, list)
  }
  const order = ['SEG 分割', 'SR 报告', 'GSPS', '掩膜 / 图像', '其它']
  return order
    .filter((g) => buckets.has(g))
    .map((g) => ({ group: g, items: buckets.get(g)! }))
}
