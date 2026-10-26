import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/i18n/LanguageContext'
import { cn } from '@/utils/cn'
import { dateKey, monthGridCells } from '@/utils/dates'

export type MonthCalMark = 'gold' | 'rose' | 'green' | 'teal'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function MonthCalendar({
  className,
  icon,
  eyebrow,
  heading,
  body,
  toolbar,
  empty,
  cursor,
  onCursorChange,
  selected,
  onSelect,
  markFor,
  countFor,
}: {
  className?: string
  icon?: ReactNode
  eyebrow: string
  heading: string
  body?: string
  toolbar?: ReactNode
  empty?: string
  cursor: Date
  onCursorChange: (next: Date) => void
  selected?: string | null
  onSelect: (day: string) => void
  markFor?: (day: string) => MonthCalMark | undefined
  countFor?: (day: string) => number
}) {
  const { t } = useI18n()
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const today = dateKey()
  const title = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1))
  const cells = monthGridCells(year, month)

  return (
    <section className={cn('sales-cal-wrap', className)}>
      <div className="sales-cal-glow" aria-hidden="true" />
      <div className="relative min-w-0">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">
          {icon}
          {eyebrow}
        </p>
        <h2 className="mt-1 font-display text-xl leading-tight text-ink sm:text-2xl">{heading}</h2>
        {body ? <p className="mt-1 text-sm text-stone-500">{body}</p> : null}
        {toolbar ? <div className="relative mt-3">{toolbar}</div> : null}
      </div>

      <div className="relative mt-4 flex items-center justify-between gap-3">
        <Button variant="secondary" size="sm" aria-label={t('tablePrev')} onClick={() => onCursorChange(new Date(year, month - 1, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="font-display text-lg text-ink sm:text-xl">{title}</h3>
        <Button variant="secondary" size="sm" aria-label={t('tableNext')} onClick={() => onCursorChange(new Date(year, month + 1, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="relative mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-amber-900/70 sm:text-[11px]">
        {WEEKDAYS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="sales-cal relative mt-1.5">
        {cells.map((cell, index) => {
          if (!cell) return <div key={`empty-${index}`} />
          const mark = markFor?.(cell.key)
          const count = countFor?.(cell.key) ?? 0
          const future = cell.key > today
          return (
            <button
              key={cell.key}
              type="button"
              disabled={future}
              onClick={() => onSelect(cell.key)}
              className={cn(
                'sales-cal-day',
                mark && `has-${mark}`,
                cell.key === today && 'is-today',
                selected === cell.key && 'is-open',
                future && 'is-future',
              )}
              style={{ animationDelay: `${Math.min(index, 20) * 18}ms` }}
            >
              <span className="sales-cal-num">{cell.day}</span>
              {mark ? (
                <>
                  <span className="sales-cal-dot" />
                  {count > 0 ? <span className="sales-cal-count">{count}</span> : null}
                </>
              ) : (
                <span className="sales-cal-idle" />
              )}
            </button>
          )
        })}
      </div>
      {empty ? <p className="relative mt-3 text-center text-sm text-stone-500">{empty}</p> : null}
    </section>
  )
}
