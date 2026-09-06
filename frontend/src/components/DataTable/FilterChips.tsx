import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export interface FilterChip {
  key: string
  label: string
  value: string
}

export function FilterChips({
  chips,
  onClear,
  onClearAll,
}: {
  chips: FilterChip[]
  onClear: (key: string) => void
  onClearAll?: () => void
}) {
  if (!chips.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="filter-chips">
      {chips.map((c) => (
        <Badge key={c.key} family="tag" variant="secondary" className="gap-1 pr-1">
          <span>
            {c.label}: {c.value}
          </span>
          <button
            type="button"
            className="rounded p-0.5 hover:bg-surface-3"
            aria-label={`清除 ${c.label}`}
            onClick={() => onClear(c.key)}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      {onClearAll && (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onClearAll}>
          清除筛选
        </Button>
      )}
    </div>
  )
}
