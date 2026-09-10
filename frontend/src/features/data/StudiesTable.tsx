import { Link } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, Scan } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/StatusBadge'
import { DataTable } from '@/components/DataTable/DataTable'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  formatDate,
  formatDateTime,
  formatPatientName,
  formatPercent,
  formatRelative,
  shortUid,
} from '@/lib/format'
import { AbsoluteTime } from '@/components/AbsoluteTime'
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
        meta: { className: 'min-w-[8rem]' },
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            <div className="font-medium text-fg-strong">
              {formatPatientName(row.original.patient_name)}
            </div>
            <div className="text-xs text-muted">{row.original.patient_id || '—'}</div>
          </div>
        ),
      },
      {
        accessorKey: 'modality',
        header: '模态',
        meta: { className: 'whitespace-nowrap' },
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap tabular-nums">
            {(getValue<string | null>() as string) || '—'}
          </span>
        ),
      },
      {
        accessorKey: 'body_part',
        header: '部位',
        meta: { className: 'whitespace-nowrap' },
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap">{(getValue<string | null>() as string) || '—'}</span>
        ),
      },
      {
        id: 'ai_status',
        header: 'AI 状态',
        accessorFn: (r) => r.last_task?.created_at ?? '',
        cell: ({ row }) => {
          const lt = row.original.last_task
          if (!lt) {
            return <span className="whitespace-nowrap text-xs text-muted">未分析</span>
          }
          const inflight = lt.status === 'queued' || lt.status === 'running'
          const tip = [
            lt.model_name || lt.model_id,
            lt.created_at ? `${formatDateTime(lt.created_at)}（${formatRelative(lt.created_at)}）` : null,
            inflight ? formatPercent(lt.progress, 0) : null,
          ]
            .filter(Boolean)
            .join(' · ')

          return (
            <div className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    to={`/tasks/${encodeURIComponent(lt.task_id)}`}
                    className="inline-flex items-center gap-1.5"
                  >
                    <StatusBadge status={lt.status} />
                    {inflight && (
                      <span
                        className="relative inline-flex h-3.5 w-3.5"
                        aria-label={`进度 ${formatPercent(lt.progress, 0)}`}
                      >
                        <span
                          className="absolute inset-0 rounded-full border-2 border-brand/30"
                          aria-hidden
                        />
                        <span
                          className="absolute inset-0 rounded-full border-2 border-transparent border-t-brand animate-spin"
                          aria-hidden
                        />
                      </span>
                    )}
                  </Link>
                </TooltipTrigger>
                <TooltipContent>{tip}</TooltipContent>
              </Tooltip>
            </div>
          )
        },
      },
      {
        accessorKey: 'study_date',
        header: '检查日期',
        meta: { className: 'whitespace-nowrap' },
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap">{formatDate(getValue<string | null>())}</span>
        ),
      },
      {
        id: 'counts',
        header: '序列/实例',
        meta: { className: 'whitespace-nowrap' },
        accessorFn: (r) => r.num_series * 100000 + r.num_instances,
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums">
            {row.original.num_series} / {row.original.num_instances}
          </span>
        ),
      },
      {
        accessorKey: 'study_uid',
        header: '检查 UID',
        meta: { className: 'hidden min-w-[7rem] lg:table-cell' },
        cell: ({ getValue }) => (
          <span className="hidden font-mono text-xs text-muted lg:inline">
            {shortUid(getValue<string>())}
          </span>
        ),
      },
      {
        accessorKey: 'created_at',
        header: '入库',
        meta: { className: 'hidden whitespace-nowrap xl:table-cell' },
        cell: ({ getValue }) => (
          <span className="hidden whitespace-nowrap text-xs text-muted xl:inline">
            <AbsoluteTime value={getValue<string | null>()} />
          </span>
        ),
      },
      {
        id: 'actions',
        header: '操作',
        enableSorting: false,
        meta: { className: 'whitespace-nowrap' },
        cell: ({ row }) => {
          const study = row.original
          return (
            <div className="flex items-center gap-1 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
              <Link
                to={`/viewer/${encodeURIComponent(study.study_uid)}`}
                data-testid="open-viewer-row"
                className="inline-flex h-8 items-center gap-1 rounded-lg bg-brand px-2.5 text-xs text-white hover:bg-brand-hover"
              >
                <Scan className="h-3.5 w-3.5" />
                阅片
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-8 w-8 px-0" aria-label="更多操作">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onOpen(study)}>详情</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onAnalyze(study)}>送去分析</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
