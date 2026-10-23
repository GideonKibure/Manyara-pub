import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, NumberInput, TextInput } from '@/components/ui/Fields'
import { Modal } from '@/components/ui/Modal'
import { useApp } from '@/context/AppContext'
import { debtPaid, debtRemaining, setDebtPayment } from '@/features/dayClose/debts'
import { useI18n } from '@/i18n/LanguageContext'
import type { DayDebt } from '@/types'

export function DebtCard({
  item,
  locked = false,
  onChange,
  onRemove,
}: {
  item: DayDebt
  locked?: boolean
  onChange?: (next: DayDebt) => void
  onRemove?: () => void
}) {
  const { t } = useI18n()
  const canEdit = Boolean(onChange) && !locked

  function patch(next: Partial<DayDebt>) {
    if (!onChange) return
    onChange({ ...item, ...next })
  }

  return (
    <article className="space-y-3 rounded-3xl border border-white/70 bg-white/60 p-3 sm:p-4">
      <TextInput value={item.customerName} disabled={!canEdit} placeholder={t('cogsCustomer')} autoComplete="name" onChange={(event) => patch({ customerName: event.target.value })} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label={t('cogsDebtAmount')}>
          <NumberInput value={item.amount || null} disabled={!canEdit} onValueChange={(value) => patch({ amount: value ?? 0 })} />
        </Field>
        <Field label={t('cogsDebtProducts')}>
          <TextInput value={item.products} disabled={!canEdit} placeholder={t('cogsDebtProducts')} onChange={(event) => patch({ products: event.target.value })} />
        </Field>
      </div>
      {onRemove && canEdit && (
        <Button size="sm" variant="danger" className="w-full rounded-2xl sm:w-auto" onClick={onRemove}>{t('deleteRecord')}</Button>
      )}
    </article>
  )
}

export function DebtPayDialog({
  item,
  open,
  asAdmin = false,
  onClose,
  onConfirm,
}: {
  item: DayDebt | null
  open: boolean
  asAdmin?: boolean
  onClose: () => void
  onConfirm: (paidAmount: number) => void
}) {
  const app = useApp()
  const { t } = useI18n()
  const [paid, setPaid] = useState<number | null>(null)

  useEffect(() => {
    if (!open || !item) return
    setPaid(debtPaid(item) || null)
  }, [open, item])

  if (!item) return null
  const amount = Math.max(0, item.amount || 0)
  const nextPaid = Math.min(amount, Math.max(0, paid ?? 0))
  const remaining = Math.max(0, amount - nextPaid)

  return (
    <Modal open={open} title={t('cogsDebtPayTitle')} onClose={onClose} centered>
      <div className="space-y-4">
        <div>
          <p className="font-semibold text-ink">{item.customerName}</p>
          {item.products ? <p className="text-sm text-stone-500">{item.products}</p> : null}
          <p className="mt-1 text-sm text-stone-600">{t('cogsDebtAmount')} · {app.money(amount)}</p>
        </div>
        <Field label={t('cogsDebtPaidAmount')} hint={t('cogsDebtPayBody')}>
          <NumberInput value={paid} onValueChange={setPaid} />
        </Field>
        <div className="rounded-2xl bg-stone-950 px-4 py-3 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200">{t('cogsDebtRemaining')}</p>
          <p className="mt-1 font-display text-3xl tabular-nums leading-none">{app.money(remaining)}</p>
        </div>
        <Button
          variant="secondary"
          className="w-full min-h-11 rounded-2xl"
          onClick={() => {
            onConfirm(amount)
            onClose()
          }}
        >
          {t('cogsDebtFullyPaid')}
        </Button>
        {asAdmin && (
          <Button
            variant="danger"
            className="w-full min-h-11 rounded-2xl"
            onClick={() => {
              onConfirm(0)
              onClose()
            }}
          >
            {t('cogsDebtMarkUnpaid')}
          </Button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" className="min-h-11 rounded-2xl" onClick={onClose}>{t('cancel')}</Button>
          <Button
            variant="gold"
            className="min-h-11 rounded-2xl"
            disabled={paid == null || paid < 0 || (!asAdmin && nextPaid <= 0)}
            onClick={() => {
              onConfirm(setDebtPayment(item, nextPaid, asAdmin).paidAmount ?? nextPaid)
              onClose()
            }}
          >
            {t('save')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
