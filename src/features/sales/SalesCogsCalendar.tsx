import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Download, Sparkles, X } from 'lucide-react'
import { ProductThumb } from '@/components/ProductPicker'
import { Button } from '@/components/ui/Button'
import { useApp } from '@/context/AppContext'
import { cogsPdfLabels, downloadCogsDayPdf } from '@/features/reports/dayPdfs'
import { useI18n } from '@/i18n/LanguageContext'
import type { DayClose } from '@/types'
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

function soldLines(close?: DayClose) {
  return (close?.lines ?? []).filter((line) => line.sold > 0).sort((a, b) => b.sold - a.sold || b.amount - a.amount)
}

export function SalesCogsCalendar() {
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
  const closesByDay = useMemo(() => {
    const map = new Map<string, DayClose[]>()
    const mineOnly = app.user?.role !== 'admin'
    for (const close of app.dayCloses ?? []) {
      if (mineOnly && close.submittedBy !== app.user?.id) continue
      if (!soldLines(close).length && !(close.debts ?? []).length && !(close.expenseItems ?? []).length) continue
      map.set(close.day, [...(map.get(close.day) ?? []), close])
    }
    return map
  }, [app.dayCloses, app.user?.id, app.user?.role])
  const dayCloses = selected ? closesByDay.get(selected) ?? [] : []
  const rows = dayCloses.flatMap((close) => soldLines(close))
  const soldUnits = rows.reduce((sum, line) => sum + line.sold, 0)
  const revenue = rows.reduce((sum, line) => sum + line.amount, 0)

  useEffect(() => {
    if (!selected) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [selected])

  return (
    <section className="sales-cal-wrap">
      <div className="sales-cal-glow" aria-hidden="true" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">
            <Sparkles className="h-3.5 w-3.5" />
            {t('salesCogsTitle')}
          </p>
          <h2 className="mt-1 font-display text-xl leading-tight text-ink sm:text-2xl">{t('salesCogsHeading')}</h2>
          <p className="mt-1 text-sm text-stone-500">{t('salesCogsBody')}</p>
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

      <div className="relative mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-amber-900/70 sm:text-[11px]">
        {weekdays.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="sales-cal relative mt-1.5">
        {cells.map((cell, index) => {
          if (!cell) return <div key={`empty-${index}`} />
          const lines = (closesByDay.get(cell.key) ?? []).flatMap((close) => soldLines(close))
          const ready = lines.length > 0
          const future = cell.key > today
          const isToday = cell.key === today
          return (
            <button
              key={cell.key}
              type="button"
              disabled={future}
              onClick={() => setSelected(cell.key)}
              className={cn(
                'sales-cal-day',
                ready && 'has-sales',
                isToday && 'is-today',
                selected === cell.key && 'is-open',
                future && 'is-future',
              )}
              style={{ animationDelay: `${Math.min(index, 20) * 18}ms` }}
            >
              <span className="sales-cal-num">{cell.day}</span>
              {ready ? (
                <>
                  <span className="sales-cal-dot" />
                  <span className="sales-cal-count">{lines.length}</span>
                </>
              ) : (
                <span className="sales-cal-idle" />
              )}
            </button>
          )
        })}
      </div>
      {!closesByDay.size && <p className="relative mt-3 text-center text-sm text-stone-500">{t('salesCogsNone')}</p>}

      {selected &&
        createPortal(
          <div className="sales-day-pop pop-center">
            <button type="button" className="sales-day-pop-scrim" aria-label={t('closeDialog')} onClick={() => setSelected(null)} />
            <div role="dialog" aria-modal="true" className="sales-day-pop-sheet">
              <header className="sales-day-pop-head">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200">{t('salesCogsDay')}</p>
                  <h2 className="mt-0.5 font-display text-xl leading-tight text-white">{formatDate(selected)}</h2>
                  <p className="mt-1 text-sm text-amber-100/80">
                    {rows.length} · {soldUnits} {t('remainQty').toLowerCase()} · {app.money(revenue)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {dayCloses.length > 0 && (
                    <Button
                      size="sm"
                      variant="gold"
                      className="rounded-full"
                      onClick={() =>
                        downloadCogsDayPdf({
                          day: selected,
                          business: app.settings.businessName,
                          staff: dayCloses.map((item) => app.nameOf(item.submittedBy)).join(', '),
                          approved: dayCloses.every((item) => item.status === 'approved'),
                          rows: dayCloses.flatMap((item) => item.lines ?? []),
                          expenses: dayCloses.flatMap((item) => item.expenseItems ?? []),
                          expenseTotal: dayCloses.reduce((sum, item) => sum + (item.expenseTotal || 0), 0),
                          debts: dayCloses.flatMap((item) => item.debts ?? []),
                          mobileItems: dayCloses.flatMap((item) => item.mobileItems ?? []),
                          mobile: dayCloses.reduce((sum, item) => sum + (item.mobileReceived || 0), 0),
                          money: app.money,
                          ...cogsPdfLabels(t),
                        })
                      }
                    >
                      <Download className="h-4 w-4" />
                      {t('remainPdf')}
                    </Button>
                  )}
                  <button type="button" className="sales-day-pop-close" onClick={() => setSelected(null)} aria-label={t('close')}>
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </header>
              <div className="sales-day-pop-body hide-scrollbar">
                {rows.map((line, index) => {
                  const product = app.products.find((item) => item.id === line.productId || item.name === line.name)
                  return (
                    <article key={`${line.productId ?? line.name}-${index}`} className="sales-day-card" style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}>
                      <ProductThumb src={product?.imageUrl} name={line.name} className="h-16 w-16 shrink-0 rounded-2xl sm:h-[4.5rem] sm:w-[4.5rem]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold text-ink">{line.name}</p>
                        <p className="mt-0.5 text-xs text-stone-500">
                          {t('remainQty')} {line.sold}
                          <span className="px-1 text-stone-300">·</span>
                          {t('remainLeft')} {line.remaining}
                        </p>
                        <p className="mt-1 text-sm font-semibold tabular-nums text-ink">{app.money(line.amount)}</p>
                      </div>
                      <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums', line.profit < 0 ? 'bg-rose-100 text-rose-900' : 'bg-emerald-100 text-emerald-950')}>
                        {app.money(line.profit)}
                      </span>
                    </article>
                  )
                })}
                {!rows.length && (
                  <div className="sales-day-empty">
                    <Sparkles className="mx-auto h-8 w-8 text-amber-700/70" />
                    <p className="mt-3 text-sm text-stone-500">{t('salesCogsEmpty')}</p>
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
