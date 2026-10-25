import { useEffect, useState } from 'react'
import { Plus, Smartphone, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ChainScroll } from '@/components/ui/ChainScroll'
import { Field, NumberInput } from '@/components/ui/Fields'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { CogsMobileItem } from '@/types'
import { dateKey, employeeMinDateKey, formatDate, isEmployeeAllowedDay } from '@/utils/dates'
import { uid } from '@/utils/id'
import { cn } from '@/utils/cn'

const compactField = 'h-8 rounded-lg px-2 py-1 text-sm'
export const cogsLipaGrid = 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4'

function totalOf(items: CogsMobileItem[]) {
  return items.reduce((sum, item) => sum + (item.amount || 0), 0)
}

export function CogsLipaPanel({
  items,
  onItems,
  day,
  locked = false,
}: {
  items: CogsMobileItem[]
  onItems: (next: CogsMobileItem[]) => void
  day: string
  locked?: boolean
}) {
  const app = useApp()
  const { t } = useI18n()
  const admin = app.user?.role === 'admin'
  const lookback = app.settings.recordLookbackDays
  const today = dateKey()
  const minDay = employeeMinDateKey(lookback)
  const defaultDay = admin || isEmployeeAllowedDay(day, undefined, lookback) ? day : today
  const [draft, setDraft] = useState<number | null>(null)
  const [draftDate, setDraftDate] = useState(defaultDay)
  const [pulse, setPulse] = useState<'ok' | 'bad' | null>(null)

  useEffect(() => {
    setDraftDate(defaultDay)
  }, [defaultDay])

  function allowed(next: string, extra?: string) {
    return admin ? /^\d{4}-\d{2}-\d{2}$/.test(next) && next <= today : isEmployeeAllowedDay(next, extra, lookback)
  }

  function setDate(next: string, extra?: string) {
    if (!allowed(next, extra)) return
    setDraftDate(next)
  }

  function add() {
    if (locked) return
    if (draft == null || draft < 1 || !allowed(draftDate)) {
      setPulse('bad')
      window.setTimeout(() => setPulse(null), 420)
      return
    }
    onItems([...items, { id: uid(), amount: draft, date: draftDate }])
    setDraft(null)
    setPulse('ok')
    window.setTimeout(() => setPulse(null), 700)
  }

  const total = totalOf(items)

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-600">{t('cogsMobileBody')}</p>
      <div className={cn('cogs-composer', pulse === 'ok' && 'is-ok', pulse === 'bad' && 'is-bad')}>
        <div className="cogs-composer-grid cogs-lipa-composer">
          <Field label={t('expenseDate')} className="cogs-composer-field">
            <input
              type="date"
              min={admin ? undefined : minDay}
              max={today}
              value={draftDate}
              disabled={locked}
              onChange={(event) => setDate(event.target.value)}
              className="w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-ink"
            />
          </Field>
          <Field label={t('cogsMobileAmount')} className="cogs-composer-field">
            <NumberInput value={draft} disabled={locked} onValueChange={setDraft} />
          </Field>
          <Button variant="gold" size="sm" className="cogs-composer-add emp-shine" disabled={locked} onClick={add}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t('cogsLipaAdd')}</span>
          </Button>
        </div>
      </div>

      <section className="cogs-sold-screen">
        <div className="cogs-sold-toolbar">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">{t('cogsMobileTitle')}</p>
            <p className="mt-0.5 text-xs text-stone-500">{items.length}</p>
          </div>
          {items.length > 0 ? (
            <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">
              {t('cogsLipaTotal')} · {app.money(total)}
            </p>
          ) : null}
        </div>
        <ChainScroll className="cogs-sold-scroll">
      <div className={cogsLipaGrid}>
        {items.map((item, index) => (
          <article
            key={item.id ?? `${item.date}-${index}`}
            className="cogs-lipa-card group relative flex min-h-[12.75rem] flex-col overflow-hidden rounded-[1.25rem] border border-white/80 bg-gradient-to-br from-white/90 via-emerald-50/40 to-amber-50/55 p-2.5 shadow-[0_10px_22px_rgba(28,25,23,0.08)] sm:aspect-square sm:min-h-0"
            style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}
          >
            <span className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full bg-emerald-300/35 blur-2xl transition duration-300 group-hover:bg-amber-300/50" />
            <div className="relative flex min-h-0 flex-1 flex-col gap-1.5">
              <div className="flex items-center justify-between gap-1">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-emerald-600 to-amber-700 text-white shadow-sm">
                  <Smartphone className="h-3.5 w-3.5" />
                </span>
                <p className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800">{index + 1}</p>
                {!locked ? (
                  <button
                    type="button"
                    className="grid h-8 w-8 place-items-center rounded-lg text-rose-800 transition hover:bg-rose-50 active:scale-95"
                    aria-label={t('deleteRecord')}
                    onClick={() => onItems(items.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              <input
                type="date"
                min={admin ? undefined : minDay}
                max={today}
                value={item.date}
                disabled={locked}
                aria-label={t('expenseDate')}
                onChange={(event) => {
                  const next = event.target.value
                  if (!allowed(next, item.date)) return
                  onItems(items.map((row, i) => (i === index ? { ...row, date: next } : row)))
                }}
                className="h-8 w-full rounded-lg border border-stone-200 bg-white/80 px-2 text-xs font-semibold text-ink"
              />
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">{formatDate(item.date)}</p>
              <NumberInput
                value={item.amount || null}
                disabled={locked}
                aria-label={t('cogsMobileAmount')}
                className={compactField}
                onValueChange={(value) =>
                  onItems(items.map((row, i) => (i === index ? { ...row, amount: value ?? 0 } : row)))
                }
              />
              <p className="mt-auto rounded-xl bg-stone-950 px-2 py-2 text-center text-base font-semibold tabular-nums text-amber-50">
                {app.money(item.amount || 0)}
              </p>
            </div>
          </article>
        ))}
        {!items.length ? (
          <div className="col-span-full rounded-[1.25rem] border border-dashed border-emerald-200/80 bg-white/50 px-4 py-8 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-800">
              <Smartphone className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm leading-6 text-stone-500">{t('cogsLipaEmpty')}</p>
          </div>
        ) : null}
      </div>
        </ChainScroll>
      </section>
    </div>
  )
}
