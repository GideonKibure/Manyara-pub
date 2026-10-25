import { Trash2, Wallet } from 'lucide-react'
import { NumberInput, TextInput } from '@/components/ui/Fields'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { CogsExpenseLine } from '@/types'
import { cn } from '@/utils/cn'

const compactField = 'h-8 rounded-lg px-2 py-1 text-sm'

export function CogsExpenseCard({
  item,
  index,
  locked = false,
  onChange,
  onRemove,
}: {
  item: CogsExpenseLine
  index: number
  locked?: boolean
  onChange?: (next: CogsExpenseLine) => void
  onRemove?: () => void
}) {
  const app = useApp()
  const { t } = useI18n()
  const canEdit = Boolean(onChange) && !locked

  function patch(next: Partial<CogsExpenseLine>) {
    if (!onChange) return
    onChange({ ...item, ...next })
  }

  return (
    <article className="cogs-expense-card group relative flex min-h-[12.75rem] flex-col overflow-hidden rounded-[1.25rem] border border-white/80 bg-gradient-to-br from-white/90 via-white/70 to-amber-50/55 p-2.5 shadow-[0_10px_22px_rgba(28,25,23,0.08)] sm:aspect-square sm:min-h-0">
      <span className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full bg-amber-300/40 blur-2xl transition duration-300 group-hover:bg-amber-300/60" />
      <div className="relative flex min-h-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center justify-between gap-1">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-800 text-white shadow-sm">
            <Wallet className="h-3.5 w-3.5" />
          </span>
          <p className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800">
            {index + 1}
          </p>
          {onRemove && canEdit ? (
            <button
              type="button"
              className="grid h-8 w-8 place-items-center rounded-lg text-rose-800 transition hover:bg-rose-50 active:scale-95"
              aria-label={t('deleteRecord')}
              onClick={onRemove}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <TextInput
          value={item.description}
          disabled={!canEdit}
          placeholder={t('expenseWhat')}
          aria-label={t('expenseWhat')}
          className={compactField}
          onChange={(event) => patch({ description: event.target.value })}
        />
        <NumberInput
          value={item.amount || null}
          disabled={!canEdit}
          aria-label={t('expenseAmount')}
          className={compactField}
          onValueChange={(value) => patch({ amount: value ?? 0 })}
        />
        <p className={cn('rounded-xl bg-stone-950 px-2 py-1.5 text-center text-sm font-semibold tabular-nums text-amber-50', !item.amount && 'text-white/70')}>
          {app.money(item.amount || 0)}
        </p>
        {(canEdit || item.notes) && (
          <TextInput
            value={item.notes}
            disabled={!canEdit}
            placeholder={t('expenseNotes')}
            aria-label={t('expenseNotes')}
            className={cn(compactField, 'mt-auto')}
            onChange={(event) => patch({ notes: event.target.value })}
          />
        )}
      </div>
    </article>
  )
}

export function CogsExpenseEmpty() {
  const { t } = useI18n()
  return (
    <div className="col-span-full rounded-[1.25rem] border border-dashed border-amber-200/80 bg-white/50 px-4 py-8 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-800">
        <Wallet className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm leading-6 text-stone-500">{t('yourExpensesEmpty')}</p>
    </div>
  )
}

export const cogsExpenseGrid = 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4'
