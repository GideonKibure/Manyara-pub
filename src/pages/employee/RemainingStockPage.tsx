import { useMemo, useState } from 'react'
import { ClipboardCheck, Package, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { ProductThumb } from '@/components/ProductPicker'
import { Button } from '@/components/ui/Button'
import { Field, NumberInput, TextArea, TextInput } from '@/components/ui/Fields'
import { PageHeader, Panel } from '@/components/ui/Feedback'
import { snapshotFor } from '@/features/inventory/stock'
import { CogsSheet, reportFromCount, type SalesDayRow } from '@/features/reports/SalesDayReport'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { MessageKey } from '@/i18n/messages'
import type { DayDebt } from '@/types'
import { dateKey, dateKeyDaysAgo } from '@/utils/dates'
import { cn } from '@/utils/cn'

type Step = 'count' | 'expenses' | 'debts' | 'mobile' | 'sheet'

const steps: Step[] = ['count', 'expenses', 'debts', 'mobile', 'sheet']
const stepLabel: Record<Step, MessageKey> = {
  count: 'cogsStepCount',
  expenses: 'cogsStepExpenses',
  debts: 'cogsStepDebts',
  mobile: 'cogsStepMobile',
  sheet: 'cogsStepSheet',
}

export function RemainingStockPage() {
  const app = useApp()
  const { t } = useI18n()
  const allowed = app.settings.allowRemainingCount
  const today = dateKey()
  const yesterday = dateKeyDaysAgo(1)
  const [cogsDay, setCogsDay] = useState(yesterday)
  const rows = useMemo(
    () =>
      app.products
        .filter((product) => product.isActive)
        .map((product) => ({
          product,
          opening: snapshotFor({ products: app.products, sales: app.sales, movements: app.movements }, product.id).available,
        }))
        .filter((row) => row.opening > 0)
        .sort((a, b) => a.product.name.localeCompare(b.product.name)),
    [app.products, app.sales, app.movements],
  )
  const [remaining, setRemaining] = useState<Record<string, number | null>>({})
  const [busy, setBusy] = useState(false)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [customer, setCustomer] = useState('')
  const [debtAmount, setDebtAmount] = useState<number | null>(null)
  const [debtProducts, setDebtProducts] = useState('')
  const [mobile, setMobile] = useState<number | null>(0)
  const [debts, setDebts] = useState<DayDebt[]>([])

  const todayCounts = app.sales
    .filter((sale) => sale.notes === 'Remaining stock count' && sale.status === 'approved' && sale.submittedBy === app.user?.id)
    .sort((a, b) => (b.reviewedAt ?? b.submittedAt).localeCompare(a.reviewedAt ?? a.submittedAt))
  const myCount = todayCounts[0]
  const myClose = (app.dayCloses ?? []).find((item) => item.day === cogsDay && item.submittedBy === app.user?.id)
  const [step, setStep] = useState<Step>(() => {
    if (myClose) return 'sheet'
    if (myCount) return 'expenses'
    return 'count'
  })

  const filled = rows.map(({ product, opening }) => {
    const value = remaining[product.id]
    const left = value == null ? opening : value
    const sold = Math.max(0, opening - left)
    const profit = sold * (product.sellingPrice - product.costPrice)
    return { product, opening, left, sold, profit, revenue: sold * product.sellingPrice, over: left > opening || left < 0 || !Number.isInteger(left) }
  })
  const openingUnits = filled.reduce((sum, row) => sum + row.opening, 0)
  const soldUnits = filled.reduce((sum, row) => sum + row.sold, 0)
  const leftUnits = filled.reduce((sum, row) => sum + Math.max(0, row.left), 0)
  const profit = filled.reduce((sum, row) => sum + row.profit, 0)
  const revenue = filled.reduce((sum, row) => sum + row.revenue, 0)
  const blocked = filled.some((row) => row.over)
  const reportRows: SalesDayRow[] = myCount
    ? reportFromCount({ products: app.products, sales: app.sales, movements: app.movements }, myCount)
    : filled.map((row) => ({ name: row.product.name, remaining: row.left, sold: row.sold, amount: row.revenue, profit: row.profit }))
  const todayExpenses = app.expenses
    .filter((item) => item.submittedBy === app.user?.id && item.spentOn === cogsDay && item.status !== 'cancelled' && item.status !== 'rejected')
    .reduce((sum, item) => sum + item.amount, 0)
  const sheetDebts = myClose?.debts ?? debts
  const sheetMobile = myClose?.mobileReceived ?? mobile ?? 0

  const summary = [
    { label: t('remainOpening'), value: String(openingUnits), hint: t('remainUnits'), icon: Package, tone: 'from-stone-800 to-stone-950 text-white' },
    { label: t('remainSold'), value: String(soldUnits), hint: app.money(revenue), icon: TrendingUp, tone: 'from-amber-500 to-amber-800 text-white' },
    { label: t('remainResult'), value: app.money(profit), hint: profit < 0 ? t('remainLoss') : t('remainGain'), icon: profit < 0 ? TrendingDown : Wallet, tone: profit < 0 ? 'from-rose-700 to-rose-900 text-white' : 'from-emerald-600 to-emerald-900 text-white' },
    { label: t('remainLeft'), value: String(leftUnits), hint: t('remainUnits'), icon: ClipboardCheck, tone: 'from-white to-amber-50 text-ink border border-white/80' },
  ] as const

  return (
    <div className="employee-dash remaining-close relative -mx-3 -mt-4 min-h-[calc(100dvh-4.5rem)] px-3 pb-40 pt-5 sm:-mx-4 sm:-mt-6 sm:px-4 sm:pt-6 md:-mx-8 md:-mb-8 md:px-8 md:pb-10">
      <div className="mx-auto max-w-5xl space-y-5">
        <PageHeader title={t('remainTitle')} description={t('remainBody')} />
        <label className="glass-panel flex w-fit items-center gap-3 rounded-full px-4 py-2 text-sm font-semibold text-ink">
          <span>{t('cogsDay')}</span>
          <input
            type="date"
            min={yesterday}
            max={today}
            value={cogsDay}
            onChange={(event) => {
              const next = event.target.value
              if (next !== yesterday && next !== today) return
              setCogsDay(next)
            }}
            className="bg-transparent font-semibold outline-none"
          />
        </label>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {steps.map((item) => (
              <button
                key={item}
                type="button"
                className={cn('rounded-2xl px-2 py-2 text-xs font-semibold uppercase tracking-wide transition', step === item ? 'bg-amber-700 text-white' : 'glass-panel text-stone-600')}
                onClick={() => {
                  if (item === 'count' || myCount) setStep(item)
                }}
              >
                {t(stepLabel[item])}
              </button>
            ))}
          </div>

        {!allowed && <div className="rounded-3xl border border-amber-200 bg-amber-50/90 p-5 text-sm leading-6 text-amber-950">{t('remainLocked')}</div>}

        {step === 'count' && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {summary.map((item) => (
                <div key={item.label} className={cn('reveal-card relative overflow-hidden rounded-3xl bg-gradient-to-br p-4 shadow-[0_12px_28px_rgba(28,25,23,0.08)]', item.tone)}>
                  <item.icon className="mb-3 h-5 w-5 opacity-80" />
                  <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{item.label}</p>
                  <p className="mt-1 break-words text-xl font-semibold tabular-nums sm:text-2xl">{item.value}</p>
                  <p className="mt-1 text-xs opacity-80">{item.hint}</p>
                </div>
              ))}
            </div>
            {allowed && (
              <form
                className="space-y-4"
                onSubmit={async (event) => {
                  event.preventDefault()
                  if (blocked) return
                  setBusy(true)
                  const result = await app.sendRemainingCount(filled.map((row) => ({ productId: row.product.id, remaining: row.left })))
                  setBusy(false)
                  if (result.ok) {
                    setRemaining({})
                    setStep('expenses')
                  }
                }}
              >
                {!filled.length && <p className="rounded-3xl border border-dashed border-stone-300 bg-white/60 px-4 py-8 text-center text-sm text-stone-500">{t('remainNoneInStock')}</p>}
                <div className="grid gap-3">
                  {filled.map((row) => (
                    <article key={row.product.id} className="glass-panel reveal-card overflow-hidden rounded-[1.75rem]">
                      <div className="flex items-center gap-3 border-b border-white/70 bg-gradient-to-r from-amber-50/80 to-transparent px-4 py-3">
                        <ProductThumb src={row.product.imageUrl} name={row.product.name} className="h-14 w-14 rounded-2xl" />
                        <div className="min-w-0 flex-1">
                          <h2 className="truncate text-base font-semibold text-ink">{row.product.name}</h2>
                          <p className="text-xs text-stone-500">{t('remainOpening')} {row.opening}</p>
                        </div>
                        <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', row.profit < 0 ? 'bg-rose-100 text-rose-900' : 'bg-emerald-100 text-emerald-900')}>{app.money(row.profit)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
                        <label className="col-span-2 sm:col-span-1">
                          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-500">{t('remainLeft')}</span>
                          <NumberInput
                            value={remaining[row.product.id] ?? row.opening}
                            onValueChange={(next) => setRemaining((current) => ({ ...current, [row.product.id]: next }))}
                            className="rounded-2xl border-amber-200/80 bg-white text-lg font-semibold"
                          />
                        </label>
                        <div className="rounded-2xl bg-stone-950 px-3 py-3 text-white">
                          <p className="text-[11px] uppercase tracking-wide text-stone-400">{t('remainSold')}</p>
                          <p className="mt-1 text-xl font-semibold tabular-nums">{row.sold}</p>
                        </div>
                        <div className="rounded-2xl bg-amber-50 px-3 py-3">
                          <p className="text-[11px] uppercase tracking-wide text-amber-800">{t('remainRevenue')}</p>
                          <p className="mt-1 text-sm font-semibold tabular-nums text-ink">{app.money(row.revenue)}</p>
                        </div>
                        <div className={cn('rounded-2xl px-3 py-3', row.profit < 0 ? 'bg-rose-50' : 'bg-emerald-50')}>
                          <p className={cn('text-[11px] uppercase tracking-wide', row.profit < 0 ? 'text-rose-800' : 'text-emerald-800')}>{t('remainResult')}</p>
                          <p className="mt-1 text-sm font-semibold tabular-nums text-ink">{app.money(row.profit)}</p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                {blocked && <p className="text-sm text-rose-700">{t('remainOver')}</p>}
                <Button type="submit" variant="gold" className="w-full md:w-auto" loading={busy} disabled={blocked || !rows.length}>{t('remainSave')}</Button>
              </form>
            )}
          </>
        )}

        {step === 'expenses' && (
          <Panel className="space-y-4">
            {!myCount && <p className="text-sm text-rose-700">{t('cogsNeedCount')}</p>}
            <Field label={t('expenseWhat')}><TextInput value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
            <Field label={t('expenseAmount')}><NumberInput value={amount} onValueChange={setAmount} /></Field>
            <Field label={t('expenseNotes')}><TextArea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="gold"
                disabled={!description.trim() || amount == null || amount < 1 || !myCount}
                loading={busy}
                onClick={async () => {
                  if (amount == null) return
                  setBusy(true)
                    const result = await app.sendExpense({ description, amount, spentOn: cogsDay, notes })
                  setBusy(false)
                  if (result.ok) {
                    setDescription('')
                    setAmount(null)
                    setNotes('')
                  }
                }}
              >
                {t('expenseSubmit')}
              </Button>
              <Button variant="secondary" onClick={() => setStep('debts')}>{t('cogsNext')}</Button>
            </div>
          </Panel>
        )}

        {step === 'debts' && (
          <Panel className="space-y-4">
            <h2 className="font-semibold">{t('cogsDebtsTitle')}</h2>
            <p className="text-sm text-stone-600">{t('cogsDebtsBody')}</p>
            <Field label={t('cogsCustomer')}><TextInput value={customer} onChange={(event) => setCustomer(event.target.value)} /></Field>
            <Field label={t('cogsDebtAmount')}><NumberInput value={debtAmount} onValueChange={setDebtAmount} /></Field>
            <Field label={t('cogsDebtProducts')}><TextInput value={debtProducts} onChange={(event) => setDebtProducts(event.target.value)} /></Field>
            <Button
              variant="secondary"
              disabled={customer.trim().length < 2 || debtAmount == null || debtAmount < 1}
              onClick={() => {
                if (debtAmount == null) return
                setDebts((current) => [...current, { customerName: customer.trim(), amount: debtAmount, products: debtProducts.trim() }])
                setCustomer('')
                setDebtAmount(null)
                setDebtProducts('')
              }}
            >
              {t('cogsAddDebt')}
            </Button>
            <ul className="space-y-2">
              {debts.map((item, index) => (
                <li key={`${item.customerName}-${index}`} className="flex justify-between gap-3 rounded-2xl bg-white/50 px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{item.customerName}</span>
                    {item.products ? <span className="mt-0.5 block text-xs text-stone-500">{item.products}</span> : null}
                  </span>
                  <span className="tabular-nums">{app.money(item.amount)}</span>
                </li>
              ))}
              {!debts.length && <li className="text-sm text-stone-500">{t('cogsNoDebts')}</li>}
            </ul>
            <Button variant="gold" onClick={() => setStep('mobile')}>{t('cogsNext')}</Button>
          </Panel>
        )}

        {step === 'mobile' && (
          <Panel className="space-y-4">
            <h2 className="font-semibold">{t('cogsMobileTitle')}</h2>
            <p className="text-sm text-stone-600">{t('cogsMobileBody')}</p>
            <Field label={t('cogsMobileAmount')}><NumberInput value={mobile} onValueChange={setMobile} /></Field>
            <Button
              variant="gold"
              loading={busy}
              disabled={!myCount}
              onClick={async () => {
                if (!myCount) return
                setBusy(true)
                const result = await app.saveDayClose({
                  day: cogsDay,
                  remainingSaleId: myCount.id,
                  debts,
                  mobileReceived: mobile ?? 0,
                  expenseTotal: todayExpenses,
                })
                setBusy(false)
                if (result.ok) setStep('sheet')
              }}
            >
              {t('cogsSaveClose')}
            </Button>
          </Panel>
        )}

        {step === 'sheet' && (
          myCount ? (
            <CogsSheet
              rows={reportRows}
              day={cogsDay}
              expenses={myClose?.expenseTotal ?? todayExpenses}
              debts={sheetDebts}
              mobile={sheetMobile}
              staff={`${app.user?.fullName ?? ''} @${app.user?.username ?? ''}`}
              approved={myClose?.status === 'approved'}
            />
          ) : (
            <Panel><p className="text-sm text-rose-700">{t('cogsNeedCount')}</p></Panel>
          )
        )}
      </div>
    </div>
  )
}
