import { Link } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { Scan, Sparkles } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/StatusBadge'
import { DataTable } from '@/components/DataTable/DataTable'
import { formatDate, formatPercent, formatRelative, shortUid } from '@/lib/format'
import type { StudySummary } from '@/types/api'

export function StudiesTable({
  data,
  onOpen,
  onAnalyze,
}: {
  data: StudySummary[]
  onOpen: (study: StudySummary) => void
  onAnalyze: (study: StudySummary) => void
}) {
  const columns = useMemo<ColumnDef<StudySummary, unknown>[]>(
    () => [
      {
        accessorKey: 'patient_name',
        header: '患者',
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-fg-strong">{row.original.patient_name || '未命名'}</div>
            <div className="text-xs text-muted">{row.original.patient_id || '—'}</div>
          </div>
        ),
      },
      {
        accessorKey: 'modality',
        header: '模态',
        cell: ({ getValue }) => (
          <span className="tabular-nums">{(getValue<string | null>() as string) || '—'}</span>
        ),
      },
      {
        accessorKey: 'body_part',
        header: '部位',
        cell: ({ getValue }) => (getValue<string | null>() as string) || '—',
      },
      {
        id: 'ai_status',
        header: 'AI 状态',
        accessorFn: (r) => r.last_task?.created_at ?? '',
        cell: ({ row }) => {
          const lt = row.original.last_task
          if (!lt) {
            return <span className="text-xs text-muted">未分析</span>
          }
          return (
            <div className="min-w-[7rem]" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-1.5">
                <StatusBadge status={lt.status} />
                {(lt.status === 'queued' || lt.status === 'running') && (
                  <span className="text-xs tabular-nums text-muted">
                    {formatPercent(lt.progress, 0)}
                  </span>
                )}
              </div>
              <Link
                to={`/tasks/${encodeURIComponent(lt.task_id)}`}
                className="mt-0.5 block truncate text-xs text-brand hover:underline"
                title={lt.model_id}
              >
                {lt.model_id}
              </Link>
            </div>
          )
        },
      },
      {
        accessorKey: 'study_date',
        header: '检查日期',
        cell: ({ getValue }) => formatDate(getValue<string | null>()),
      },
      {
        id: 'counts',
        header: '序列/实例',
        accessorFn: (r) => r.num_series * 100000 + r.num_instances,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.num_series} / {row.original.num_instances}
          </span>
        ),
      },
      {
        accessorKey: 'study_uid',
        header: 'Study UID',
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-muted">{shortUid(getValue<string>())}</span>
        ),
      },
      {
        accessorKey: 'created_at',
        header: '入库',
        cell: ({ getValue }) => formatRelative(getValue<string | null>()),
      },
      {
        id: 'actions',
        header: '操作',
        enableSorting: false,
        cell: ({ row }) => {
          const study = row.original
          return (
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              <Button size="sm" variant="ghost" onClick={() => onOpen(study)}>
                详情
              </Button>
              <Button size="sm" variant="secondary" onClick={() => onAnalyze(study)}>
                <Sparkles className="h-3.5 w-3.5" />
                送去分析
              </Button>
              <Link
                to={`/viewer/${encodeURIComponent(study.study_uid)}`}
                data-testid="open-viewer-row"
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs hover:bg-surface-2"
              >
                <Scan className="h-3.5 w-3.5" />
                阅片
              </Link>
            </div>
          )
        },
      },
    ],
    [onAnalyze, onOpen],
  )

  return (
    <DataTable
      columns={columns}
      data={data}
      getRowId={(r) => r.study_uid}
      onRowClick={onOpen}
    />
  )
}
