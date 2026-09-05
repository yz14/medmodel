import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { formatMs, formatNumber } from '@/lib/format'
import type { ModelSpec } from '@/types/api'

const TYPE_LABEL: Record<string, string> = {
  segmentation: '分割',
  detection: '检测',
  classification: '分类',
}

export function ModelCard({
  model,
  onToggle,
  toggling,
}: {
  model: ModelSpec
  onToggle: (enabled: boolean) => void
  toggling?: boolean
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>
              <Link to={`/models/${model.id}`} className="hover:text-brand">
                {model.name}
              </Link>
            </CardTitle>
            <CardDescription>
              {model.id} · v{model.version}
            </CardDescription>
          </div>
          <Switch checked={model.enabled} onCheckedChange={onToggle} disabled={toggling} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="info">{TYPE_LABEL[model.task_type] ?? model.task_type}</Badge>
          {model.modalities.map((m) => (
            <Badge key={m} variant="secondary">
              {m}
            </Badge>
          ))}
        </div>
        <p className="line-clamp-3 flex-1 text-xs leading-relaxed text-muted">{model.description}</p>
        <div className="grid grid-cols-2 gap-2 text-[11px] text-muted">
          <div>
            预期延迟
            <div className="text-sm text-fg tabular-nums">{formatMs(model.expected_latency_ms)}</div>
          </div>
          {model.metrics?.dice != null && (
            <div>
              Dice
              <div className="text-sm text-fg tabular-nums">{formatNumber(model.metrics.dice, 3)}</div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
