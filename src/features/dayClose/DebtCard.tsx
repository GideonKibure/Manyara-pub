import { Check, CircleDashed, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, NumberInput, TextInput } from '@/components/ui/Fields'
import { useApp } from '@/context/AppContext'
import { debtPaid, debtRemaining, debtStatus, setDebtPayment } from '@/features/dayClose/debts'
import { useI18n } from '@/i18n/LanguageContext'
import type { DayDebt } from '@/types'
import { cn } from '@/utils/cn'

export function DebtCard({
  item,
  locked = false,
  asAdmin = false,
  review = false,
  busy = false,
  onChange,
  onRemove,
  onApprove,
  onReject,
}: {
  item: DayDebt
  locked?: boolean
  asAdmin?: boolean
  review?: boolean
  busy?: boolean
  onChange?: (next: DayDebt) => void
  onRemove?: () => void
  onApprove?: () => void
  onReject?: () => void
}) {
  const app = useApp()
  const { t } = useI18n()
  const paid = debtPaid(item)
  const remaining = debtRemaining(item)
  const status = debtStatus(item)
  const canEdit = Boolean(onChange) && !locked
  const tone = status === 'approved' ? 'border-emerald-200 bg-emerald-50/80' : status === 'pending' ? 'border-amber-200 bg-amber-50/80' : 'border-white/70 bg-white/60'

  function patch(next: Partial<DayDebt>) {
    if (!onChange) return
    const merged = { ...item, ...next }
    if (next.paidAmount != null || next.amount != null) {
      onChange(setDebtPayment(merged, next.paidAmount ?? merged.paidAmount ?? 0, asAdmin && status !== 'pending'))
      return
    }
    onChange(merged)
  }

  return (
    <article className={cn('reveal-card space-y-3 rounded-3xl border p-3 shadow-[0_10px_24px_rgba(28,25,23,0.06)] sm:p-4', tone)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {canEdit ? (
            <TextInput value={item.customerName} placeholder={t('cogsCustomer')} autoComplete="name" onChange={(event) => patch({ customerName: event.target.value })} />
          ) : (
            <p className="truncate text-base font-semibold text-ink">{item.customerName || t('cogsCustomer')}</p>
          )}
          {item.products && !canEdit ? <p className="mt-0.5 text-sm text-stone-500">{item.products}</p> : null}
        </div>
        <span className={cn(
          'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
          status === 'approved' ? 'bg-emerald-700 text-white' : status === 'pending' ? 'bg-amber-700 text-white' : 'bg-stone-800 text-white',
        )}>
          {status === 'approved' ? t('cogsDebtPaid') : status === 'pending' ? t('cogsDebtAwaiting') : t('cogsDebtUnpaid')}
        </span>
      </div>

      {canEdit && (
        <Field label={t('cogsDebtProducts')}>
          <TextInput value={item.products} placeholder={t('cogsDebtProducts')} onChange={(event) => patch({ products: event.target.value })} />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label={t('cogsDebtAmount')}>
          {canEdit ? (
            <NumberInput value={item.amount || null} onValueChange={(value) => patch({ amount: value ?? 0 })} />
          ) : (
            <p className="rounded-xl bg-white/80 px-3 py-2.5 text-base font-semibold tabular-nums text-ink">{app.money(item.amount)}</p>
          )}
        </Field>
        <Field label={t('cogsDebtPaidAmount')}>
          {canEdit ? (
            <NumberInput value={item.paidAmount || 0} onValueChange={(value) => patch({ paidAmount: value ?? 0 })} />
          ) : (
            <p className="rounded-xl bg-white/80 px-3 py-2.5 text-base font-semibold tabular-nums text-ink">{app.money(paid)}</p>
          )}
        </Field>
      </div>

      <div className="rounded-2xl bg-stone-950 px-3 py-3 text-white">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200">{t('cogsDebtRemaining')}</p>
        <p className="mt-1 font-display text-2xl tabular-nums leading-none sm:text-3xl">{app.money(remaining)}</p>
        {remaining > 0 && paid > 0 && <p className="mt-1 text-xs text-stone-300">{t('cogsDebtPartial')}</p>}
      </div>

      {canEdit && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => patch({ paidAmount: 0 })}
            className={cn(
              'flex min-h-12 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-semibold transition active:scale-[0.98]',
              status === 'unpaid' ? 'bg-stone-900 text-white shadow-md' : 'bg-white/80 text-stone-600 ring-1 ring-stone-200',
            )}
          >
            <CircleDashed className="h-4 w-4" />
            {t('cogsDebtUnpaid')}
          </button>
          <button
            type="button"
            onClick={() => patch({ paidAmount: Math.max(item.amount, 1) })}
            className={cn(
              'flex min-h-12 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-semibold transition active:scale-[0.98]',
              status !== 'unpaid' ? 'bg-amber-700 text-white shadow-md' : 'bg-white/80 text-stone-600 ring-1 ring-stone-200',
            )}
          >
            <Wallet className="h-4 w-4" />
            {t('cogsDebtMarkPaid')}
          </button>
        </div>
      )}

      {review && status === 'pending' && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="danger" className="min-h-12 rounded-2xl" loading={busy} onClick={onReject}>{t('cogsRejectPayment')}</Button>
          <Button variant="gold" className="min-h-12 rounded-2xl" loading={busy} onClick={onApprove}>
            <Check className="h-4 w-4" />
            {t('cogsApprovePayment')}
          </Button>
        </div>
      )}

      {onRemove && canEdit && (
        <Button size="sm" variant="danger" className="w-full rounded-2xl" onClick={onRemove}>{t('deleteRecord')}</Button>
      )}
    </article>
  )
}
