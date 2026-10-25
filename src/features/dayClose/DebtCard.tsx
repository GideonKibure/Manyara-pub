import { useEffect, useState } from 'react'
import { Plus, ScrollText, Trash2, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, NumberInput, TextInput } from '@/components/ui/Fields'
import { Modal } from '@/components/ui/Modal'
import { useApp } from '@/context/AppContext'
import { blankDebt, debtPaid, debtRemaining, debtStatus, setDebtPayment } from '@/features/dayClose/debts'
import { useI18n } from '@/i18n/LanguageContext'
import type { DayDebt } from '@/types'
import { cn } from '@/utils/cn'

const compactField = 'h-8 rounded-lg px-2 py-1 text-sm'

export const cogsDebtGrid = 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4'

export function CogsDebtComposer({ locked = false, onAdd }: { locked?: boolean; onAdd: (item: DayDebt) => void }) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [products, setProducts] = useState('')
  const [pulse, setPulse] = useState<'ok' | 'bad' | null>(null)

  function add() {
    if (locked) return
    if (name.trim().length < 2 || amount == null || amount < 1) {
      setPulse('bad')
      window.setTimeout(() => setPulse(null), 420)
      return
    }
    onAdd({ ...blankDebt(), customerName: name.trim(), amount, products: products.trim() })
    setName('')
    setAmount(null)
    setProducts('')
    setPulse('ok')
    window.setTimeout(() => setPulse(null), 700)
  }

  return (
    <div className={cn('cogs-composer', pulse === 'ok' && 'is-ok', pulse === 'bad' && 'is-bad')}>
      <div className="cogs-composer-grid">
        <Field label={t('cogsCustomer')} className="cogs-composer-field">
          <TextInput value={name} disabled={locked} autoComplete="name" onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label={t('cogsDebtAmount')} className="cogs-composer-field">
          <NumberInput value={amount} disabled={locked} onValueChange={setAmount} />
        </Field>
        <Field label={t('cogsDebtProducts')} className="cogs-composer-field">
          <TextInput value={products} disabled={locked} onChange={(event) => setProducts(event.target.value)} />
        </Field>
        <Button variant="gold" size="sm" className="cogs-composer-add emp-shine" disabled={locked} onClick={add}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">{t('cogsAddDebt')}</span>
        </Button>
      </div>
    </div>
  )
}

export function DebtCard({
  item,
  index = 0,
  locked = false,
  onChange,
  onRemove,
}: {
  item: DayDebt
  index?: number
  locked?: boolean
  onChange?: (next: DayDebt) => void
  onRemove?: () => void
}) {
  const app = useApp()
  const { t } = useI18n()
  const canEdit = Boolean(onChange) && !locked
  const remaining = debtRemaining(item)
  const status = debtStatus(item)

  function patch(next: Partial<DayDebt>) {
    if (!onChange) return
    onChange({ ...item, ...next })
  }

  return (
    <article
      className="cogs-debt-card group relative flex min-h-[12.75rem] flex-col overflow-hidden rounded-[1.25rem] border border-white/80 bg-gradient-to-br from-white/90 via-white/70 to-stone-100/70 p-2.5 shadow-[0_10px_22px_rgba(28,25,23,0.08)] sm:aspect-square sm:min-h-0"
      style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}
    >
      <span className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full bg-amber-200/35 blur-2xl transition duration-300 group-hover:bg-amber-300/55" />
      <div className="relative flex min-h-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center justify-between gap-1">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-stone-700 to-stone-950 text-amber-100 shadow-sm">
            <UserRound className="h-3.5 w-3.5" />
          </span>
          <span
            className={cn(
              'min-w-0 truncate rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
              status === 'approved' ? 'bg-emerald-100 text-emerald-950' : status === 'pending' ? 'bg-amber-100 text-amber-950' : 'bg-stone-200 text-stone-700',
            )}
          >
            {status === 'approved' ? t('cogsDebtPaid') : status === 'pending' ? t('cogsDebtAwaiting') : t('cogsDebtUnpaid')}
          </span>
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
          value={item.customerName}
          disabled={!canEdit}
          placeholder={t('cogsCustomer')}
          autoComplete="name"
          aria-label={t('cogsCustomer')}
          className={compactField}
          onChange={(event) => patch({ customerName: event.target.value })}
        />
        <NumberInput
          value={item.amount || null}
          disabled={!canEdit}
          aria-label={t('cogsDebtAmount')}
          className={compactField}
          onValueChange={(value) => {
            const amount = value ?? 0
            onChange?.(setDebtPayment({ ...item, amount }, Math.min(debtPaid(item), amount), app.user?.role === 'admin'))
          }}
        />
        <NumberInput
          value={debtPaid(item) || null}
          disabled={!canEdit}
          aria-label={t('cogsDebtPaidAmount')}
          className={compactField}
          onValueChange={(value) => onChange?.(setDebtPayment(item, value ?? 0, app.user?.role === 'admin'))}
        />
        <p className="rounded-xl bg-stone-950 px-2 py-1.5 text-center text-sm font-semibold tabular-nums text-amber-50">
          {app.money(remaining)}
        </p>
        <TextInput
          value={item.products}
          disabled={!canEdit}
          placeholder={t('cogsDebtProducts')}
          aria-label={t('cogsDebtProducts')}
          className={cn(compactField, 'mt-auto')}
          onChange={(event) => patch({ products: event.target.value })}
        />
      </div>
    </article>
  )
}

export function CogsDebtEmpty() {
  const { t } = useI18n()
  return (
    <div className="col-span-full rounded-[1.25rem] border border-dashed border-stone-300 bg-white/50 px-4 py-8 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-stone-100 text-stone-700">
        <ScrollText className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm leading-6 text-stone-500">{t('cogsDebtsEmpty')}</p>
    </div>
  )
}

export function DebtPayDialog({
  item,
  open,
  asAdmin = false,
  loading = false,
  onClose,
  onConfirm,
}: {
  item: DayDebt | null
  open: boolean
  asAdmin?: boolean
  loading?: boolean
  onClose: () => void
  onConfirm: (
    paidAmount: number,
    details?: { customerName: string; amount: number; products: string },
  ) => void | boolean | Promise<void | boolean>
}) {
  const app = useApp()
  const { t } = useI18n()
  const [paid, setPaid] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [billAmount, setBillAmount] = useState<number | null>(null)
  const [products, setProducts] = useState('')

  useEffect(() => {
    if (!open || !item) return
    setPaid(debtPaid(item))
    setName(item.customerName)
    setBillAmount(item.amount || 0)
    setProducts(item.products ?? '')
  }, [open, item])

  if (!item) return null
  const amount = Math.max(0, (asAdmin ? billAmount : item.amount) || 0)
  const nextPaid = Math.min(amount, Math.max(0, paid ?? 0))
  const remaining = Math.max(0, amount - nextPaid)
  const details = { customerName: (asAdmin ? name : item.customerName).trim(), amount, products: (asAdmin ? products : item.products).trim() }

  async function commit(value: number) {
    if (loading) return
    const result = await onConfirm(value, details)
    if (result !== false) onClose()
  }

  return (
    <Modal open={open} title={t('cogsDebtPayTitle')} onClose={loading ? () => undefined : onClose} centered>
      <div className="space-y-4">
        {asAdmin ? (
          <div className="grid gap-3">
            <Field label={t('cogsCustomer')}>
              <TextInput value={name} disabled={loading} autoComplete="name" onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label={t('cogsDebtAmount')}>
              <NumberInput value={billAmount} disabled={loading} onValueChange={(value) => {
                setBillAmount(value)
                setPaid((current) => Math.min(value ?? 0, current ?? 0))
              }} />
            </Field>
            <Field label={t('cogsDebtProducts')}>
              <TextInput value={products} disabled={loading} onChange={(event) => setProducts(event.target.value)} />
            </Field>
          </div>
        ) : (
          <div>
            <p className="font-semibold text-ink">{item.customerName}</p>
            {item.products ? <p className="text-sm text-stone-500">{item.products}</p> : null}
            <p className="mt-1 text-sm text-stone-600">{t('cogsDebtAmount')} · {app.money(amount)}</p>
          </div>
        )}
        <Field label={t('cogsDebtPaidAmount')} hint={t('cogsDebtPayBody')}>
          <NumberInput value={paid} disabled={loading} onValueChange={(value) => setPaid(value == null ? null : Math.min(amount, value))} />
        </Field>
        <div className="rounded-2xl bg-stone-950 px-4 py-3 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200">{t('cogsDebtRemaining')}</p>
          <p className="mt-1 font-display text-3xl tabular-nums leading-none">{app.money(remaining)}</p>
          <p className="mt-2 text-xs text-white/65">{t('billPaid')} {app.money(nextPaid)} · {t('billLineTotal')} {app.money(amount)}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            className="min-h-11 rounded-2xl"
            disabled={loading}
            onClick={() => void commit(amount)}
          >
            {t('cogsDebtFullyPaid')}
          </Button>
          <Button
            variant="danger"
            className="min-h-11 rounded-2xl"
            disabled={loading}
            onClick={() => void commit(0)}
          >
            {t('cogsDebtMarkUnpaid')}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" className="min-h-11 rounded-2xl" disabled={loading} onClick={onClose}>{t('cancel')}</Button>
          <Button
            variant="gold"
            className="min-h-11 rounded-2xl"
            loading={loading}
            disabled={paid == null || paid < 0}
            onClick={() => void commit(setDebtPayment(item, nextPaid, asAdmin).paidAmount ?? nextPaid)}
          >
            {t('billUpdate')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
