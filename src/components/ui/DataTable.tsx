import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/i18n/LanguageContext'

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
  footer,
}: {
  rows: T[]
  columns: Array<Column<T>>
  getRowId: (row: T) => string
  pageSize?: number
  resetKey?: string
  emptyTitle: string
  emptyBody?: string
  footer?: ReactNode
}) {
  const { t } = useI18n()
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

  const visibleColumns = columns.filter((column) => !column.className?.includes('hidden'))

  return (
    <div className="glass-panel reveal-card overflow-hidden rounded-2xl">
      <div className="divide-y divide-line md:hidden">
        {visible.map((row) => (
          <article key={getRowId(row)} className="space-y-2 px-3 py-3">
            {visibleColumns.map((column, index) => (
              <div key={column.key} className={index === 0 ? 'font-semibold text-ink' : 'flex items-start justify-between gap-3 text-sm'}>
                {index > 0 && column.header ? <span className="shrink-0 text-stone-500">{column.header}</span> : null}
                <span className={index === 0 ? 'block' : 'min-w-0 text-right text-ink'}>{column.render(row)}</span>
              </div>
            ))}
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
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
          {footer ? <tfoot className="border-t-2 border-stone-300 bg-amber-50/80">{footer}</tfoot> : null}
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-3 text-sm text-stone-500 sm:px-4">
        <span className="min-w-0 truncate">
          {start + 1}–{Math.min(start + pageSize, sorted.length)} / {sorted.length}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" aria-label={t('tablePrev')} disabled={current === 1} onClick={() => setPage(current - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span>
            {current} / {pages}
          </span>
          <Button variant="secondary" size="sm" aria-label={t('tableNext')} disabled={current === pages} onClick={() => setPage(current + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
