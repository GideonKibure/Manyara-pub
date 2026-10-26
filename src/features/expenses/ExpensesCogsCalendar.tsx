import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Wallet, X } from 'lucide-react'
import { MonthCalendar } from '@/components/ui/MonthCalendar'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { CogsExpenseLine } from '@/types'
import { formatDate } from '@/utils/dates'

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
    <>
    <MonthCalendar
      icon={<Wallet className="h-3.5 w-3.5" />}
      eyebrow={t('expensesCogsTitle')}
      heading={t('expensesCogsHeading')}
      body={t('expensesCogsBody')}
      empty={!rowsByDay.size ? t('expensesCogsNone') : undefined}
      cursor={cursor}
      onCursorChange={setCursor}
      selected={selected}
      onSelect={openDay}
      markFor={(day) => ((rowsByDay.get(day) ?? []).length ? 'gold' : undefined)}
      countFor={(day) => (rowsByDay.get(day) ?? []).length}
    />

      {selected &&
        createPortal(
          <div className="sales-day-pop pop-center">
            <button type="button" className="sales-day-pop-scrim" aria-label={t('closeDialog')} onClick={() => setSelected(null)} />
            <div role="dialog" aria-modal="true" className="sales-day-pop-sheet">
              <header className="sales-day-pop-head">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200">{t('expensesCogsDay')}</p>
                  <h2 className="mt-0.5 font-display text-xl leading-tight text-white">{formatDate(selected)}</h2>
                  <p className="mt-1 text-sm text-amber-100/80">
                    {rows.length} · {app.money(total)}
                  </p>
                </div>
                <button type="button" className="sales-day-pop-close" onClick={() => setSelected(null)} aria-label={t('close')}>
                  <X className="h-5 w-5" />
                </button>
              </header>
              <div className="sales-day-pop-body hide-scrollbar">
                {rows.map((item, index) => (
                  <article key={item.id ?? `${item.description}-${index}`} className="sales-day-card" style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}>
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-500 to-amber-900 text-white shadow-sm sm:h-16 sm:w-16">
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
                    <Wallet className="mx-auto h-8 w-8 text-amber-700/70" />
                    <p className="mt-3 text-sm text-stone-500">{t('expensesCogsEmpty')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
