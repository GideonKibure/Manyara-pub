import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  sortValue?: (row: T) => string | number
  className?: string
}

export function DataTable<T>({
  rows,
  columns,
  getRowId,
  pageSize = 8,
  resetKey = '',
  emptyTitle,
  emptyBody,
}: {
  rows: T[]
  columns: Array<Column<T>>
  getRowId: (row: T) => string
  pageSize?: number
  resetKey?: string
  emptyTitle: string
  emptyBody?: string
}) {
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    setPage(1)
  }, [resetKey])

  const sorted = useMemo(() => {
    if (!sortKey) return rows
    const column = columns.find((item) => item.key === sortKey && item.sortValue)
    if (!column?.sortValue) return rows
    return [...rows].sort((a, b) => {
      const left = column.sortValue!(a)
      const right = column.sortValue!(b)
      const compared = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right))
      return direction === 'asc' ? compared : -compared
    })
  }, [rows, columns, sortKey, direction])

  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
        <p className="font-semibold text-ink">{emptyTitle}</p>
        {emptyBody && <p className="mt-1 text-sm text-stone-500">{emptyBody}</p>}
      </div>
    )
  }

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const current = Math.min(page, pages)
  const start = (current - 1) * pageSize
  const visible = sorted.slice(start, start + pageSize)

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-stone-50 text-stone-500">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={`px-4 py-3 font-medium ${column.className ?? ''}`}>
                  {column.sortValue ? (
                    <button
                      className="inline-flex items-center gap-1 hover:text-ink"
                      onClick={() => {
                        setDirection(sortKey === column.key && direction === 'asc' ? 'desc' : 'asc')
                        setSortKey(column.key)
                      }}
                    >
                      {column.header}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={getRowId(row)} className="border-t border-line">
                {columns.map((column) => (
                  <td key={column.key} className={`px-4 py-3 align-middle text-ink ${column.className ?? ''}`}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-stone-500">
        <span>
          Showing {start + 1}–{Math.min(start + pageSize, sorted.length)} of {sorted.length}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" aria-label="Previous page" disabled={current === 1} onClick={() => setPage(current - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span>
            {current} / {pages}
          </span>
          <Button variant="secondary" size="sm" aria-label="Next page" disabled={current === pages} onClick={() => setPage(current + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
