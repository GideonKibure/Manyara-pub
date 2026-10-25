import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Wallet, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { CogsExpenseLine } from '@/types'
import { cn } from '@/utils/cn'
import { dateKey, formatDate } from '@/utils/dates'

function monthCells(year: number, month: number) {
  const first = new Date(year, month, 1)
  const pad = (first.getDay() + 6) % 7
  const days = new Date(year, month + 1, 0).getDate()
  const cells: Array<{ key: string; day: number } | null> = []
  for (let index = 0; index < pad; index += 1) cells.push(null)
  for (let day = 1; day <= days; day += 1) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    cells.push({ key, day })
  }
  while (cells.length % 7) cells.push(null)
  return cells
}

function expenseLines(items?: CogsExpenseLine[]) {
  return (items ?? [])
    .filter((item) => item.description.trim().length >= 2 && item.amount >= 1)
    .sort((a, b) => b.amount - a.amount || a.description.localeCompare(b.description))
}

export function ExpensesCogsCalendar({
  onPickDay,
}: {
  onPickDay?: (day: string) => void
}) {
  const app = useApp()
  const { t } = useI18n()
  const [cursor, setCursor] = useState(() => new Date())
  const [selected, setSelected] = useState<string | null>(null)
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const today = dateKey()
  const title = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1))
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const cells = useMemo(() => monthCells(year, month), [month, year])
  const rowsByDay = useMemo(() => {
    const map = new Map<string, CogsExpenseLine[]>()
    for (const close of app.dayCloses ?? []) {
      if (close.submittedBy !== app.user?.id) continue
      const rows = expenseLines(close.expenseItems)
      if (!rows.length) continue
      map.set(close.day, rows)
    }
    return map
  }, [app.dayCloses, app.user?.id])
  const rows = selected ? rowsByDay.get(selected) ?? [] : []
  const total = rows.reduce((sum, item) => sum + item.amount, 0)

  useEffect(() => {
    if (!selected) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [selected])

  function openDay(day: string) {
    setSelected(day)
    onPickDay?.(day)
  }

  return (
    <section className="sales-cal-wrap expenses-cal-wrap">
      <div className="expenses-cal-glow" aria-hidden="true" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-900">
            <Wallet className="h-3.5 w-3.5" />
            {t('expensesCogsTitle')}
          </p>
          <h2 className="mt-1 font-display text-xl leading-tight text-ink sm:text-2xl">{t('expensesCogsHeading')}</h2>
          <p className="mt-1 text-sm text-stone-500">{t('expensesCogsBody')}</p>
        </div>
      </div>

      <div className="relative mt-4 flex items-center justify-between gap-3">
        <Button variant="secondary" size="sm" aria-label={t('tablePrev')} onClick={() => setCursor(new Date(year, month - 1, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="font-display text-lg text-ink sm:text-xl">{title}</h3>
        <Button variant="secondary" size="sm" aria-label={t('tableNext')} onClick={() => setCursor(new Date(year, month + 1, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="relative mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-emerald-900/70 sm:text-[11px]">
        {weekdays.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="sales-cal relative mt-1.5">
        {cells.map((cell, index) => {
          if (!cell) return <div key={`empty-${index}`} />
          const lines = rowsByDay.get(cell.key) ?? []
          const ready = lines.length > 0
          const future = cell.key > today
          const isToday = cell.key === today
          return (
            <button
              key={cell.key}
              type="button"
              disabled={future}
              onClick={() => openDay(cell.key)}
              className={cn(
                'sales-cal-day expenses-cal-day',
                ready && 'has-expenses',
                isToday && 'is-today',
                selected === cell.key && 'is-open',
                future && 'is-future',
              )}
              style={{ animationDelay: `${Math.min(index, 20) * 18}ms` }}
            >
              <span className="sales-cal-num">{cell.day}</span>
              {ready ? (
                <>
                  <span className="sales-cal-dot expenses-cal-dot" />
                  <span className="sales-cal-count expenses-cal-count">{lines.length}</span>
                </>
              ) : (
                <span className="sales-cal-idle" />
              )}
            </button>
          )
        })}
      </div>
      {!rowsByDay.size && <p className="relative mt-3 text-center text-sm text-stone-500">{t('expensesCogsNone')}</p>}

      {selected &&
        createPortal(
          <div className="sales-day-pop">
            <button type="button" className="sales-day-pop-scrim" aria-label={t('closeDialog')} onClick={() => setSelected(null)} />
            <div role="dialog" aria-modal="true" className="sales-day-pop-sheet">
              <header className="sales-day-pop-head expenses-day-pop-head">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200">{t('expensesCogsDay')}</p>
                  <h2 className="mt-0.5 font-display text-xl leading-tight text-white">{formatDate(selected)}</h2>
                  <p className="mt-1 text-sm text-emerald-100/85">
                    {rows.length} · {app.money(total)}
                  </p>
                </div>
                <button type="button" className="sales-day-pop-close" onClick={() => setSelected(null)} aria-label={t('close')}>
                  <X className="h-5 w-5" />
                </button>
              </header>
              <div className="sales-day-pop-body hide-scrollbar">
                {rows.map((item, index) => (
                  <article key={item.id ?? `${item.description}-${index}`} className="sales-day-card expenses-day-card" style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}>
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-900 text-white shadow-sm sm:h-16 sm:w-16">
                      <Wallet className="h-6 w-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-ink">{item.description}</p>
                      {item.notes ? <p className="mt-0.5 line-clamp-2 text-xs text-stone-500">{item.notes}</p> : null}
                      <p className="mt-1 text-sm font-semibold tabular-nums text-ink">{app.money(item.amount)}</p>
                    </div>
                  </article>
                ))}
                {!rows.length && (
                  <div className="sales-day-empty">
                    <Wallet className="mx-auto h-8 w-8 text-emerald-800/70" />
                    <p className="mt-3 text-sm text-stone-500">{t('expensesCogsEmpty')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </section>
  )
}
