import { useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardCheck, Package, Search, TrendingDown, TrendingUp, Wallet, X } from 'lucide-react'
import { ProductThumb } from '@/components/ProductPicker'
import { Button } from '@/components/ui/Button'
import { Field, NumberInput, TextArea, TextInput } from '@/components/ui/Fields'
import { PageHeader, Panel } from '@/components/ui/Feedback'
import { CogsEditor } from '@/features/dayClose/CogsEditor'
import { snapshotFor } from '@/features/inventory/stock'
import { CogsSheet, type SalesDayRow } from '@/features/reports/SalesDayReport'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { MessageKey } from '@/i18n/messages'
import type { CogsExpenseLine, CogsLine, DayDebt, Product } from '@/types'
import { dateKey, dateKeyDaysAgo, employeeMinDateKey, isEmployeeAllowedDay } from '@/utils/dates'
import { cn } from '@/utils/cn'

function formatQty(value: number) {
  const rounded = Math.round(value * 2) / 2
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function productMatches(product: Product, needle: string) {
  if (!needle) return true
  return `${product.name} ${product.sku}`.toLowerCase().includes(needle)
}

function CountProductCard({
  product,
  opening,
  remaining,
  cost,
  onRemaining,
  onCost,
  onSkip,
  highlighted,
  compact,
}: {
  product: Product
  opening: number
  remaining: number | null
  cost: number | null
  onRemaining: (value: number | null) => void
  onCost: (value: number | null) => void
  onSkip?: () => void
  highlighted?: boolean
  compact?: boolean
}) {
  const app = useApp()
  const { t } = useI18n()
  const left = remaining == null ? opening : remaining
  const sold = Math.max(0, opening - left)
  const unitCost = cost ?? product.costPrice
  const profit = sold * (product.sellingPrice - unitCost)
  const revenue = sold * product.sellingPrice
  const halfOk = Number.isFinite(left) && left >= 0 && Math.abs(left * 2 - Math.round(left * 2)) < 1e-6
  const over = left > opening || left < 0 || !halfOk

  return (
    <article
      id={`cogs-row-${product.id}`}
      className={cn(
        'glass-panel overflow-hidden rounded-[1.75rem] transition',
        compact ? 'review-line' : 'reveal-card',
        highlighted ? 'ring-2 ring-amber-600' : '',
        over ? 'ring-1 ring-rose-400' : '',
      )}
    >
      <div className="flex flex-col gap-3 border-b border-white/70 bg-gradient-to-r from-amber-50/80 to-transparent px-3 py-3 sm:flex-row sm:items-center sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <ProductThumb src={product.imageUrl} name={product.name} className="h-12 w-12 shrink-0 rounded-2xl sm:h-14 sm:w-14" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-ink">{product.name}</h2>
            <p className="text-xs text-stone-500">
              {product.sku ? `${product.sku} · ` : ''}
              {t('remainOpening')} {formatQty(opening)}
            </p>
          </div>
        </div>
        <span className="flex flex-wrap items-center gap-2">
          <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', profit < 0 ? 'bg-rose-100 text-rose-900' : 'bg-emerald-100 text-emerald-900')}>{app.money(profit)}</span>
          {onSkip ? (
            <Button type="button" size="sm" variant="danger" onClick={onSkip}>
              {t('deleteRecord')}
            </Button>
          ) : null}
        </span>
      </div>
      <div className={cn('grid gap-3 p-3 sm:p-4', compact ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 lg:grid-cols-5')}>
        <label className="col-span-2 sm:col-span-1">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-500">{t('remainLeft')}</span>
          <NumberInput
            id={`cogs-remain-${product.id}`}
            allowDecimal
            value={remaining ?? opening}
            onValueChange={onRemaining}
            className="rounded-2xl border-amber-200/80 bg-white text-lg font-semibold"
          />
          <span className="mt-1 block text-[11px] leading-4 text-stone-500">{t('remainHalfHint')}</span>
        </label>
        <label className="col-span-2 sm:col-span-1">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-500">{t('remainBuyPrice')}</span>
          <NumberInput
            value={cost ?? product.costPrice}
            onValueChange={onCost}
            className="rounded-2xl border-amber-200/80 bg-white text-lg font-semibold"
          />
          <span className="mt-1 block text-[11px] leading-4 text-stone-500">{t('remainBuyHint')}</span>
        </label>
        <div className="rounded-2xl bg-stone-950 px-3 py-3 text-white">
          <p className="text-[11px] uppercase tracking-wide text-stone-400">{t('remainSold')}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{formatQty(sold)}</p>
        </div>
        {!compact && (
          <>
            <div className="rounded-2xl bg-amber-50 px-3 py-3">
              <p className="text-[11px] uppercase tracking-wide text-amber-800">{t('remainRevenue')}</p>
              <p className="mt-1 break-words text-sm font-semibold tabular-nums text-ink">{app.money(revenue)}</p>
            </div>
            <div className={cn('rounded-2xl px-3 py-3', profit < 0 ? 'bg-rose-50' : 'bg-emerald-50')}>
              <p className={cn('text-[11px] uppercase tracking-wide', profit < 0 ? 'text-rose-800' : 'text-emerald-800')}>{t('remainResult')}</p>
              <p className="mt-1 break-words text-sm font-semibold tabular-nums text-ink">{app.money(profit)}</p>
            </div>
          </>
        )}
      </div>
    </article>
  )
}

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
  const minDay = employeeMinDateKey()
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
  const [costs, setCosts] = useState<Record<string, number | null>>({})
  const [skipped, setSkipped] = useState<string[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [mobile, setMobile] = useState<number | null>(0)
  const [debts, setDebts] = useState<DayDebt[]>([])
  const [expenseItems, setExpenseItems] = useState<CogsExpenseLine[]>([])
  const [lines, setLines] = useState<CogsLine[]>([])

  const todayCounts = app.sales
    .filter((sale) => sale.notes === 'Remaining stock count' && sale.status === 'approved' && sale.submittedBy === app.user?.id)
    .sort((a, b) => (b.reviewedAt ?? b.submittedAt).localeCompare(a.reviewedAt ?? a.submittedAt))
  const myCount = todayCounts[0]
  const myClose = (app.dayCloses ?? []).find((item) => item.day === cogsDay && item.submittedBy === app.user?.id)
  const [step, setStep] = useState<Step>(() => (myClose ? 'sheet' : 'count'))

  useEffect(() => {
    if (!myClose) {
      setDebts([])
      setExpenseItems([])
      setMobile(0)
      setLines([])
      return
    }
    setDebts(myClose.debts)
    setExpenseItems(myClose.expenseItems ?? [])
    setMobile(myClose.mobileReceived)
    if (myClose.lines?.length) setLines(myClose.lines)
  }, [cogsDay, myClose?.id])

  const locked = myClose?.status === 'approved'
  const filled = rows.filter((row) => !skipped.includes(row.product.id)).map(({ product, opening }) => {
    const value = remaining[product.id]
    const left = value == null ? opening : value
    const sold = Math.max(0, opening - left)
    const unitCost = costs[product.id] ?? product.costPrice
    const profit = sold * (product.sellingPrice - unitCost)
    const halfOk = Number.isFinite(left) && left >= 0 && Math.abs(left * 2 - Math.round(left * 2)) < 1e-6
    return { product, opening, left, sold, unitCost, profit, revenue: sold * product.sellingPrice, over: left > opening || left < 0 || !halfOk }
  })
  const openingUnits = filled.reduce((sum, row) => sum + row.opening, 0)
  const soldUnits = filled.reduce((sum, row) => sum + row.sold, 0)
  const leftUnits = filled.reduce((sum, row) => sum + Math.max(0, row.left), 0)
  const profit = filled.reduce((sum, row) => sum + row.profit, 0)
  const revenue = filled.reduce((sum, row) => sum + row.revenue, 0)
  const blocked = filled.some((row) => row.over)
  const needle = search.trim().toLowerCase()
  const searchHits = useMemo(
    () => (needle ? rows.filter((row) => productMatches(row.product, needle)).slice(0, 12) : []),
    [rows, needle],
  )
  const listed = needle ? filled.filter((row) => productMatches(row.product, needle)) : filled

  useEffect(() => {
    if (!searchOpen) return
    searchInputRef.current?.focus()
  }, [searchOpen])

  const writeRemaining = (productId: string, value: number | null) => {
    setSkipped((current) => current.filter((id) => id !== productId))
    setRemaining((current) => ({ ...current, [productId]: value }))
  }

  const countedRows: SalesDayRow[] = filled.map((row) => ({
    name: row.product.name,
    remaining: row.left,
    sold: row.sold,
    amount: row.revenue,
    profit: row.profit,
  }))
  const reportRows: SalesDayRow[] = (lines.length ? lines : countedRows).filter((row) => row.sold > 0 || row.remaining > 0)
  const sheetExpenses = (myClose?.expenseItems?.length ? myClose.expenseItems : expenseItems).reduce((sum, item) => sum + item.amount, 0)
  const sheetDebts = myClose?.debts?.length ? myClose.debts : debts
  const sheetMobile = myClose?.mobileReceived ?? mobile ?? 0

  const summary = [
    { label: t('remainOpening'), value: formatQty(openingUnits), hint: t('remainUnits'), icon: Package, tone: 'from-stone-800 to-stone-950 text-white' },
    { label: t('remainSold'), value: formatQty(soldUnits), hint: app.money(revenue), icon: TrendingUp, tone: 'from-amber-500 to-amber-800 text-white' },
    { label: t('remainResult'), value: app.money(profit), hint: profit < 0 ? t('remainLoss') : t('remainGain'), icon: profit < 0 ? TrendingDown : Wallet, tone: profit < 0 ? 'from-rose-700 to-rose-900 text-white' : 'from-emerald-600 to-emerald-900 text-white' },
    { label: t('remainLeft'), value: formatQty(leftUnits), hint: t('remainUnits'), icon: ClipboardCheck, tone: 'from-white to-amber-50 text-ink border border-white/80' },
  ] as const

  return (
    <div className="employee-dash remaining-close relative -mx-3 -mt-4 min-h-[calc(100dvh-4.5rem)] px-3 pb-40 pt-5 sm:-mx-4 sm:-mt-6 sm:px-4 sm:pt-6 md:-mx-8 md:-mb-8 md:px-8 md:pb-10">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <PageHeader title={t('remainTitle')} description={t('remainBody')} />
        <label className="glass-panel flex w-fit items-center gap-3 rounded-full px-4 py-2 text-sm font-semibold text-ink">
          <span>{t('cogsDay')}</span>
          <input
            type="date"
            min={minDay}
            max={today}
            value={cogsDay}
            onChange={(event) => {
              const next = event.target.value
              if (!isEmployeeAllowedDay(next)) return
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
                className={cn('rounded-2xl px-2 py-2 text-[11px] font-semibold uppercase tracking-wide transition sm:text-xs', step === item ? 'bg-amber-700 text-white' : 'glass-panel text-stone-600')}
                onClick={() => setStep(item)}
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
            {allowed && !locked && (
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (blocked) return
                  setLines(countedRows)
                  setStep('expenses')
                }}
              >
                <div className="sticky top-2 z-20 space-y-3">
                  {!searchOpen ? (
                    <Button
                      type="button"
                      variant="gold"
                      className="w-full rounded-2xl sm:w-auto"
                      onClick={() => setSearchOpen(true)}
                    >
                      <Search className="h-4 w-4" aria-hidden="true" />
                      {t('remainSearch')}
                    </Button>
                  ) : (
                    <div className="glass-panel review-sheet space-y-3 rounded-[1.75rem] p-3 sm:p-4" role="search">
                      <div className="flex items-center gap-2">
                        <Search className="h-5 w-5 shrink-0 text-amber-800" aria-hidden="true" />
                        <input
                          ref={searchInputRef}
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder={t('pickerPlaceholder')}
                          aria-label={t('remainSearch')}
                          className="min-w-0 flex-1 bg-transparent text-base font-semibold text-ink outline-none placeholder:font-normal placeholder:text-stone-400"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={t('close')}
                          onClick={() => {
                            setSearchOpen(false)
                            setSearch('')
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs leading-5 text-stone-600">{t('remainSearchHint')}</p>
                      {!needle && <p className="text-sm text-stone-500">{t('remainSearchEmpty')}</p>}
                      {needle && (
                        <div className="grid max-h-[min(28rem,55dvh)] gap-3 overflow-y-auto pr-0.5">
                          {searchHits.map((row) => (
                            <CountProductCard
                              key={row.product.id}
                              product={row.product}
                              opening={row.opening}
                              remaining={remaining[row.product.id] ?? null}
                              cost={costs[row.product.id] ?? null}
                              compact
                              onRemaining={(next) => writeRemaining(row.product.id, next)}
                              onCost={(next) => setCosts((current) => ({ ...current, [row.product.id]: next }))}
                            />
                          ))}
                          {!searchHits.length && <p className="text-sm text-stone-500">{t('pickerEmpty')}</p>}
                        </div>
                      )}
                      {needle && (
                        <Button type="button" size="sm" variant="secondary" onClick={() => setSearch('')}>
                          {t('remainSearchClear')}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {!filled.length && <p className="rounded-3xl border border-dashed border-stone-300 bg-white/60 px-4 py-8 text-center text-sm text-stone-500">{t('remainNoneInStock')}</p>}
                {!(searchOpen && needle) && (
                  <div className="grid gap-3">
                    {listed.map((row) => (
                      <CountProductCard
                        key={row.product.id}
                        product={row.product}
                        opening={row.opening}
                        remaining={remaining[row.product.id] ?? null}
                        cost={costs[row.product.id] ?? null}
                        onRemaining={(next) => writeRemaining(row.product.id, next)}
                        onCost={(next) => setCosts((current) => ({ ...current, [row.product.id]: next }))}
                        onSkip={() => setSkipped((current) => [...current, row.product.id])}
                      />
                    ))}
                  </div>
                )}
                {blocked && <p className="text-sm text-rose-700">{t('remainOver')}</p>}
                <Button type="submit" variant="gold" className="w-full sm:w-auto" disabled={blocked || !filled.length}>{t('cogsNext')}</Button>
              </form>
            )}
          </>
        )}

        {step === 'expenses' && (
          <Panel className="space-y-4">
            <Field label={t('expenseWhat')}><TextInput value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
            <Field label={t('expenseAmount')}><NumberInput value={amount} onValueChange={setAmount} /></Field>
            <Field label={t('expenseNotes')}><TextArea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="gold"
                disabled={!description.trim() || amount == null || amount < 1 || locked}
                onClick={() => {
                  if (amount == null) return
                  setExpenseItems((current) => [...current, { description: description.trim(), amount, notes }])
                  setDescription('')
                  setAmount(null)
                  setNotes('')
                }}
              >
                {t('cogsAddExpense')}
              </Button>
              <Button variant="secondary" onClick={() => setStep('debts')}>{t('cogsNext')}</Button>
            </div>
            <ul className="space-y-2">
              {expenseItems.map((item, index) => (
                <li key={`${item.description}-${index}`} className="grid gap-2 rounded-2xl bg-white/50 p-3 sm:grid-cols-[1fr_8rem_auto]">
                  <TextInput value={item.description} onChange={(event) => setExpenseItems((current) => current.map((row, i) => (i === index ? { ...row, description: event.target.value } : row)))} />
                  <NumberInput value={item.amount} onValueChange={(value) => setExpenseItems((current) => current.map((row, i) => (i === index ? { ...row, amount: value ?? 0 } : row)))} />
                  <Button size="sm" variant="danger" disabled={locked} onClick={() => setExpenseItems((current) => current.filter((_, i) => i !== index))}>{t('deleteRecord')}</Button>
                </li>
              ))}
              {!expenseItems.length && <li className="text-sm text-stone-500">{t('yourExpensesEmpty')}</li>}
            </ul>
          </Panel>
        )}

        {step === 'debts' && (
          <Panel className="space-y-4">
            <h2 className="font-semibold">{t('cogsDebtsTitle')}</h2>
            <p className="text-sm text-stone-600">{t('cogsDebtsBody')}</p>
            {debts.map((item, index) => (
              <div key={`${item.customerName}-${index}`} className="grid gap-2 rounded-2xl bg-white/50 p-3 sm:grid-cols-[1fr_8rem_1fr_auto]">
                <TextInput value={item.customerName} onChange={(event) => setDebts((current) => current.map((row, i) => (i === index ? { ...row, customerName: event.target.value } : row)))} />
                <NumberInput value={item.amount} onValueChange={(value) => setDebts((current) => current.map((row, i) => (i === index ? { ...row, amount: value ?? 0 } : row)))} />
                <TextInput value={item.products} onChange={(event) => setDebts((current) => current.map((row, i) => (i === index ? { ...row, products: event.target.value } : row)))} />
                <Button size="sm" variant="danger" disabled={locked} onClick={() => setDebts((current) => current.filter((_, i) => i !== index))}>{t('deleteRecord')}</Button>
              </div>
            ))}
            <Button variant="secondary" disabled={locked} onClick={() => setDebts((current) => [...current, { customerName: '', amount: 0, products: '' }])}>{t('cogsAddDebt')}</Button>
            <Button variant="gold" onClick={() => setStep('mobile')}>{t('cogsNext')}</Button>
          </Panel>
        )}

        {step === 'mobile' && (
          <Panel className="space-y-4">
            <h2 className="font-semibold">{t('cogsMobileTitle')}</h2>
            <p className="text-sm text-stone-600">{t('cogsMobileBody')}</p>
            <Field label={t('cogsMobileAmount')}><NumberInput value={mobile} onValueChange={setMobile} disabled={locked} /></Field>
            <Button variant="gold" onClick={() => setStep('sheet')}>{t('cogsNext')}</Button>
          </Panel>
        )}

        {step === 'sheet' && (
          <div className="space-y-3">
            {!locked && (
              <Panel>
                <CogsEditor
                  lines={reportRows}
                  onLines={setLines}
                  expenses={expenseItems}
                  onExpenses={setExpenseItems}
                  debts={debts}
                  onDebts={setDebts}
                  mobile={mobile}
                  onMobile={setMobile}
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="gold"
                    loading={busy}
                    onClick={async () => {
                      setBusy(true)
                      let saleId: string | undefined = myCount?.id
                      if (!saleId && filled.some((row) => row.sold > 0)) {
                        const counted = await app.sendRemainingCount(filled.map((row) => ({ productId: row.product.id, remaining: row.left, unitCost: row.unitCost })))
                        if (!counted.ok) {
                          setBusy(false)
                          return
                        }
                        saleId = counted.meta?.id
                      }
                      const result = myClose
                        ? await app.updateDayClose(myClose.id, {
                            debts,
                            mobileReceived: mobile ?? 0,
                            expenseTotal: expenseItems.reduce((sum, item) => sum + item.amount, 0),
                            lines: reportRows,
                            expenseItems,
                          })
                        : await app.saveDayClose({
                            day: cogsDay,
                            remainingSaleId: saleId,
                            debts,
                            mobileReceived: mobile ?? 0,
                            expenseTotal: expenseItems.reduce((sum, item) => sum + item.amount, 0),
                            lines: reportRows,
                            expenseItems,
                          })
                      setBusy(false)
                      if (result.ok) setStep('sheet')
                    }}
                  >
                    {t('cogsSubmitAdmin')}
                  </Button>
                  {myClose && (
                    <Button variant="danger" loading={busy} onClick={async () => {
                      setBusy(true)
                      const result = await app.deleteDayClose(myClose.id)
                      setBusy(false)
                      if (result.ok) {
                        setDebts([])
                        setExpenseItems([])
                        setMobile(0)
                      }
                    }}>{t('deleteRecord')}</Button>
                  )}
                </div>
              </Panel>
            )}
            <CogsSheet
              rows={reportRows}
              day={cogsDay}
              expenses={sheetExpenses}
              debts={sheetDebts}
              mobile={sheetMobile}
              staff={`${app.user?.fullName ?? ''} @${app.user?.username ?? ''}`}
              approved={myClose?.status === 'approved'}
            />
          </div>
        )}
      </div>
    </div>
  )
}
