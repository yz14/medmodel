import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Rows3 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

export type DataTableDensity = 'comfortable' | 'compact'

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[]
  data: TData[]
  getRowId?: (row: TData) => string
  enableRowSelection?: boolean
  rowSelection?: RowSelectionState
  onRowSelectionChange?: (selection: RowSelectionState) => void
  toolbar?: ReactNode
  onRowClick?: (row: TData) => void
  density?: DataTableDensity
  onDensityChange?: (d: DataTableDensity) => void
  emptyMessage?: string
  className?: string
}

export function DataTable<TData>({
  columns,
  data,
  getRowId,
  enableRowSelection = false,
  rowSelection,
  onRowSelectionChange,
  toolbar,
  onRowClick,
  density: densityProp,
  onDensityChange,
  emptyMessage = '暂无数据',
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [internalSelection, setInternalSelection] = useState<RowSelectionState>({})
  const [internalDensity, setInternalDensity] = useState<DataTableDensity>('comfortable')

  const density = densityProp ?? internalDensity
  const setDensity = onDensityChange ?? setInternalDensity
  const selection = rowSelection ?? internalSelection
  const setSelection = onRowSelectionChange ?? setInternalSelection

  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: {
      sorting,
      columnVisibility,
      columnFilters,
      rowSelection: selection,
    },
    enableRowSelection,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: (updater) => {
      const next = typeof updater === 'function' ? updater(selection) : updater
      setSelection(next)
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const cellPad = density === 'compact' ? 'py-1.5' : 'py-3'

  return (
    <div className={cn('space-y-3', className)} data-testid="data-table">
      <div className={cn('flex flex-wrap items-center gap-2', !toolbar && 'justify-end')}>
        {toolbar ? <div className="min-w-0 flex-1">{toolbar}</div> : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3 className="h-3.5 w-3.5" />
              列
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>显示列</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table
              .getAllColumns()
              .filter((c) => c.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(v) => column.toggleVisibility(!!v)}
                >
                  {typeof column.columnDef.header === 'string'
                    ? column.columnDef.header
                    : column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          size="sm"
          aria-label="切换行密度"
          onClick={() => setDensity(density === 'comfortable' ? 'compact' : 'comfortable')}
        >
          <Rows3 className="h-3.5 w-3.5" />
          {density === 'comfortable' ? '紧凑' : '舒适'}
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-surface-1">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()
                  return (
                    <TableHead key={header.id} className={cn(cellPad)}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 select-none hover:text-fg"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                          ) : (
                            <ChevronsUpDown
                              className="h-3.5 w-3.5 shrink-0 text-muted/60"
                              aria-hidden
                            />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className={cn(onRowClick && 'cursor-pointer')}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cn(cellPad)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-sm text-muted">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

/** Checkbox column helper for row selection. */
export function selectColumn<TData>(): ColumnDef<TData, unknown> {
  return {
    id: 'select',
    enableSorting: false,
    enableHiding: false,
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        aria-label="全选"
        onClick={(e) => e.stopPropagation()}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
        aria-label="选择行"
        onClick={(e) => e.stopPropagation()}
      />
    ),
  }
}
