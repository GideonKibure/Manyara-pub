import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ClipboardCheck, Package, Pencil, Plus, Save, Search, TrendingDown, TrendingUp, Wallet, X } from 'lucide-react'
import { ProductThumb } from '@/components/ProductPicker'
import { Button } from '@/components/ui/Button'
import { ChainScroll } from '@/components/ui/ChainScroll'
import { Field, NumberInput, TextInput } from '@/components/ui/Fields'
import { PageHeader, Panel, StatusBadge } from '@/components/ui/Feedback'
import { billedSoldQty } from '@/features/dayClose/billedSold'
import { remainingOpeningQty } from '@/features/inventory/remainingOpening'
import { CogsEditor } from '@/features/dayClose/CogsEditor'
import { CogsExpenseCard, CogsExpenseEmpty, cogsExpenseGrid } from '@/features/dayClose/CogsExpenseCard'
import { CogsDebtComposer, CogsDebtEmpty, DebtCard, cogsDebtGrid } from '@/features/dayClose/DebtCard'
import { CogsLipaPanel } from '@/features/dayClose/CogsLipaPanel'
import { debtOutstanding } from '@/features/dayClose/debts'
import { snapshotFor } from '@/features/inventory/stock'
import { CogsSheet, CogsSoldPane, type SalesDayRow } from '@/features/reports/SalesDayReport'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { MessageKey } from '@/i18n/messages'
import type { CogsExpenseLine, CogsLine, CogsMobileItem, DayDebt, Product } from '@/types'
import { dateKey, dateKeyDaysAgo, employeeMinDateKey, isEmployeeAllowedDay } from '@/utils/dates'
import { uid } from '@/utils/id'
import { cn } from '@/utils/cn'
import { roundBuyingPrice } from '@/utils/money'

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
  fallbackRemaining,
  onRemaining,
  onSkip,
  highlighted,
}: {
  product: Product
  opening: number
  remaining: number | null
  fallbackRemaining: number
  onRemaining: (value: number | null) => void
  onSkip?: () => void
  highlighted?: boolean
}) {
  const app = useApp()
  const { t } = useI18n()
  const left = remaining == null ? fallbackRemaining : remaining
  const sold = Math.max(0, opening - left)
  const unitCost = roundBuyingPrice(product.costPrice)
  const profit = sold * (product.sellingPrice - unitCost)
  const halfOk = Number.isFinite(left) && left >= 0 && Math.abs(left * 2 - Math.round(left * 2)) < 1e-6
  const cap = opening
  const over = left > cap + 1e-6 || left < 0 || !halfOk
  const nudge = (delta: number) => {
    const next = Math.round((left + delta) * 2) / 2
    onRemaining(Math.min(cap, Math.max(0, next)))
  }

  return (
    <article
      id={`cogs-row-${product.id}`}
      className={cn(
        'glass-panel overflow-hidden rounded-[1.4rem] transition',
        highlighted ? 'ring-2 ring-amber-600' : '',
        over ? 'ring-1 ring-rose-400' : remaining != null ? 'ring-1 ring-emerald-300' : '',
      )}
    >
      <div className="flex items-center gap-3 px-3 pt-3">
        <ProductThumb src={product.imageUrl} name={product.name} className="h-12 w-12 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold text-ink">{product.name}</h2>
          <p className="text-[11px] text-stone-500">
            {product.sku ? `${product.sku} · ` : ''}
            {t('remainOpening')} {formatQty(opening)}
          </p>
        </div>
        <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold', profit < 0 ? 'bg-rose-100 text-rose-900' : 'bg-emerald-100 text-emerald-900')}>
          {app.money(profit)}
        </span>
      </div>
      <div className="grid grid-cols-[auto_1fr_auto] items-end gap-2 px-3 py-3">
        <button type="button" className="h-12 w-12 rounded-2xl border border-amber-200 bg-white text-xl font-semibold text-ink" onClick={() => nudge(-0.5)} aria-label="-0.5">
          −
        </button>
        <label>
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">{t('remainLeft')}</span>
          <NumberInput
            id={`cogs-remain-${product.id}`}
            allowDecimal
            value={remaining ?? fallbackRemaining}
            onValueChange={onRemaining}
            className="h-12 rounded-2xl border-amber-200/80 bg-white text-center text-xl font-semibold"
          />
        </label>
        <button type="button" className="h-12 w-12 rounded-2xl border border-amber-200 bg-white text-xl font-semibold text-ink" onClick={() => nudge(0.5)} aria-label="+0.5">
          +
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 px-3 pb-3">
        <div className="rounded-2xl bg-stone-950 px-3 py-2 text-white">
          <p className="text-[10px] uppercase tracking-wide text-stone-400">{t('remainSold')}</p>
          <p className="text-lg font-semibold tabular-nums">{formatQty(sold)}</p>
        </div>
        <div className="rounded-2xl bg-amber-50 px-3 py-2 text-left">
          <p className="text-[10px] uppercase tracking-wide text-amber-800">{t('remainBuyPrice')}</p>
          <p className="text-sm font-semibold tabular-nums text-ink">{app.money(unitCost)}</p>
          <p className="mt-1 text-[11px] leading-4 text-amber-900/80">{t('remainBuyHint')}</p>
        </div>
      </div>
      {onSkip ? (
        <div className="border-t border-white/70 px-3 py-3">
          <Button type="button" size="sm" variant="danger" onClick={onSkip}>
            {t('deleteRecord')}
          </Button>
        </div>
      ) : null}
    </article>
  )
}

type Step = 'count' | 'expenses' | 'debts' | 'mobile' | 'sheet'
type Filter = 'all' | 'open' | 'done'

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
  const lookback = app.settings.recordLookbackDays
  const today = dateKey()
  const yesterday = dateKeyDaysAgo(1)
  const minDay = employeeMinDateKey(lookback)
  const defaultDay = isEmployeeAllowedDay(yesterday, undefined, lookback) ? yesterday : today
  const [cogsDay, setCogsDay] = useState(defaultDay)
  const myClose = (app.dayCloses ?? []).find((item) => item.day === cogsDay && item.submittedBy === app.user?.id)
  const rows = useMemo(() => {
    const saved = new Map((myClose?.lines ?? []).filter((line) => line.productId).map((line) => [line.productId as string, line]))
    return app.products
      .filter((product) => product.isActive)
      .map((product) => {
        const live = snapshotFor({
          products: app.products,
          sales: app.sales,
          movements: app.movements,
          dayCloses: app.dayCloses,
          stockIns: app.stockIns,
        }, product.id).available
        const billed = billedSoldQty(app.sales, product.id, cogsDay, app.user?.id)
        const line = saved.get(product.id)
        const computed = remainingOpeningQty({
          closes: app.dayCloses,
          stockIns: app.stockIns,
          productId: product.id,
          day: cogsDay,
          userId: app.user?.id,
          live,
          billed,
        })
        const opening = line ? line.remaining + line.sold : computed.opening
        const fallbackRemaining = line ? line.remaining : opening
        return { product, opening, live, billed, fallbackRemaining, saved: line }
      })
      .filter((row) => row.opening > 0 || row.saved)
      .sort((a, b) => a.product.name.localeCompare(b.product.name))
  }, [app.dayCloses, app.products, app.sales, app.stockIns, app.movements, app.user?.id, cogsDay, myClose?.id, myClose?.lines])
  const [remaining, setRemaining] = useState<Record<string, number | null>>({})
  const [skipped, setSkipped] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [composerPulse, setComposerPulse] = useState<'ok' | 'bad' | null>(null)
  const [mobileItems, setMobileItems] = useState<CogsMobileItem[]>([])
  const [debts, setDebts] = useState<DayDebt[]>([])
  const [expenseItems, setExpenseItems] = useState<CogsExpenseLine[]>([])
  const [lines, setLines] = useState<CogsLine[]>([])
  const [step, setStep] = useState<Step>('count')

  useEffect(() => {
    if (!myClose) {
      setDebts([])
      setExpenseItems([])
      setMobileItems([])
      setLines([])
      setRemaining({})
      setSkipped([])
      setStep('count')
      return
    }
    setDebts((myClose.debts ?? []).map((item) => ({ ...item, id: item.id || uid() })))
    setExpenseItems((myClose.expenseItems ?? []).map((item) => ({ ...item, id: item.id || uid() })))
    setMobileItems(
      (myClose.mobileItems ?? []).length
        ? myClose.mobileItems.map((item) => ({ ...item, id: item.id || uid() }))
        : myClose.mobileReceived > 0
          ? [{ id: uid(), amount: myClose.mobileReceived, date: cogsDay }]
          : [],
    )
    setLines(myClose.lines ?? [])
    const nextRemain: Record<string, number | null> = {}
    for (const line of myClose.lines ?? []) {
      if (!line.productId) continue
      nextRemain[line.productId] = line.remaining
    }
    setRemaining(nextRemain)
    setSkipped([])
    setStep((myClose.lines ?? []).length ? 'sheet' : 'count')
  }, [cogsDay, myClose?.id])

  useEffect(() => {
    if (!myClose) {
      setExpenseItems([])
      return
    }
    setExpenseItems((myClose.expenseItems ?? []).map((item) => ({ ...item, id: item.id || uid() })))
  }, [myClose?.id, myClose?.expenseItems, myClose?.expenseTotal])

  useEffect(() => {
    if (!myClose) {
      setDebts([])
      return
    }
    setDebts((myClose.debts ?? []).map((item) => ({ ...item, id: item.id || uid() })))
  }, [myClose?.id, myClose?.debts])

  useEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0 })
  }, [search, filter])

  const locked = myClose?.status === 'approved'
  const filled = rows.filter((row) => !skipped.includes(row.product.id)).map(({ product, opening, live, billed, fallbackRemaining }) => {
    const value = remaining[product.id]
    const left = value == null ? fallbackRemaining : value
    const sold = Math.max(0, opening - left)
    const unitCost = roundBuyingPrice(product.costPrice)
    const profit = sold * (product.sellingPrice - unitCost)
    const halfOk = Number.isFinite(left) && left >= 0 && Math.abs(left * 2 - Math.round(left * 2)) < 1e-6
    const cap = opening
    return { product, opening, live, billed, left, sold, unitCost, profit, revenue: Math.round(sold * product.sellingPrice), over: left > cap + 1e-6 || left < 0 || !halfOk, fallbackRemaining }
  })
  const openingUnits = filled.reduce((sum, row) => sum + row.opening, 0)
  const soldUnits = filled.reduce((sum, row) => sum + row.sold, 0)
  const leftUnits = filled.reduce((sum, row) => sum + Math.max(0, row.left), 0)
  const profit = filled.reduce((sum, row) => sum + row.profit, 0)
  const revenue = filled.reduce((sum, row) => sum + row.revenue, 0)
  const blocked = filled.some((row) => row.over)
  const needle = search.trim().toLowerCase()
  const countedIds = filled.filter((row) => remaining[row.product.id] != null).length
  const listed = filled.filter((row) => {
    if (needle && !productMatches(row.product, needle)) return false
    if (filter === 'open') return remaining[row.product.id] == null
    if (filter === 'done') return remaining[row.product.id] != null
    return true
  })

  const writeRemaining = (productId: string, value: number | null) => {
    setSkipped((current) => current.filter((id) => id !== productId))
    setRemaining((current) => ({ ...current, [productId]: value }))
  }

  const countedRows: CogsLine[] = filled.map((row) => ({
    productId: row.product.id,
    name: row.product.name,
    remaining: row.left,
    sold: row.sold,
    amount: row.revenue,
    profit: row.profit,
    unitCost: row.unitCost,
  }))
  const reportRows: SalesDayRow[] = (lines.length ? lines : countedRows).filter((row) => row.sold > 0)
  const sheetExpenses = expenseItems.reduce((sum, item) => sum + item.amount, 0)
  const mobile = mobileItems.reduce((sum, item) => sum + (item.amount || 0), 0)

  useEffect(() => {
    if (!isEmployeeAllowedDay(cogsDay, undefined, lookback)) setCogsDay(defaultDay)
  }, [cogsDay, defaultDay, lookback])

  const summary = [
    { label: t('remainOpening'), value: formatQty(openingUnits), hint: t('remainUnits'), icon: Package, tone: 'from-stone-800 to-stone-950 text-white' },
    { label: t('remainSold'), value: formatQty(soldUnits), hint: app.money(revenue), icon: TrendingUp, tone: 'from-amber-500 to-amber-800 text-white' },
    { label: t('remainResult'), value: app.money(profit), hint: profit < 0 ? t('remainLoss') : t('remainGain'), icon: profit < 0 ? TrendingDown : Wallet, tone: profit < 0 ? 'from-rose-700 to-rose-900 text-white' : 'from-emerald-600 to-emerald-900 text-white' },
    { label: t('remainLeft'), value: formatQty(leftUnits), hint: t('remainUnits'), icon: ClipboardCheck, tone: 'from-white to-amber-50 text-ink border border-white/80' },
  ] as const

  const persist = async (nextDebts = debts, stayOnSheet = false) => {
    if (blocked || locked) return
    setBusy(true)
    const payloadLines = step === 'count' || !lines.length ? countedRows : lines
    setLines(payloadLines)
    let saleId = myClose?.remainingSaleId
    const soldLines = filled.filter((row) => row.opening - row.billed - row.left > 1e-6)
    if (!saleId && allowed && soldLines.length) {
      const counted = await app.sendRemainingCount(
        soldLines.map((row) => ({ productId: row.product.id, remaining: row.left, unitCost: row.unitCost })),
        cogsDay,
      )
      if (!counted.ok) {
        setBusy(false)
        return
      }
      saleId = counted.meta?.id
    }
    const result = await app.saveDayClose({
      day: cogsDay,
      remainingSaleId: saleId,
      debts: nextDebts,
      mobileReceived: mobile,
      expenseTotal: expenseItems.reduce((sum, item) => sum + item.amount, 0),
      lines: payloadLines,
      expenseItems,
      mobileItems,
    })
    setBusy(false)
    if (result.ok && !stayOnSheet) setStep('sheet')
  }

  const nextStep = (from: Step) => steps[Math.min(steps.indexOf(from) + 1, steps.length - 1)]
  const prevStep = (from: Step) => steps[Math.max(steps.indexOf(from) - 1, 0)]

  return (
    <div className="employee-dash remaining-close relative -mx-3 -mt-4 min-h-[calc(100dvh-4.5rem)] px-3 pb-[calc(8.5rem+env(safe-area-inset-bottom))] pt-5 sm:-mx-4 sm:-mt-6 sm:px-4 sm:pt-6 md:-mx-8 md:-mb-8 md:px-8 md:pb-28">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <PageHeader title={t('remainTitle')} description={t('remainBody')} />
        <div className="flex flex-wrap items-center gap-2">
          <label className="glass-panel flex w-fit items-center gap-3 rounded-full px-4 py-2 text-sm font-semibold text-ink">
            <span>{t('cogsDay')}</span>
            <input
              type="date"
              min={minDay}
              max={today}
              value={cogsDay}
              onChange={(event) => {
                const next = event.target.value
                if (!isEmployeeAllowedDay(next, undefined, lookback)) return
                setCogsDay(next)
              }}
              className="bg-transparent font-semibold outline-none"
            />
          </label>
          {myClose ? <StatusBadge status={myClose.status} /> : null}
        </div>
        {myClose?.status === 'pending' && <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">{t('cogsSavedPending')}</p>}
        {locked && <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-950">{t('cogsApprovedLock')}</p>}
        {!myClose && allowed && step !== 'count' && <p className="text-sm leading-6 text-stone-600">{t('cogsDraftHint')}</p>}

        <div className="grid grid-cols-5 gap-1.5">
          {steps.map((item, index) => (
            <button
              key={item}
              type="button"
              className={cn(
                'rounded-2xl px-1 py-2 text-[10px] font-semibold uppercase tracking-wide transition sm:text-xs',
                step === item ? 'bg-amber-700 text-white shadow-md shadow-amber-900/20' : 'glass-panel text-stone-600 hover:bg-white',
              )}
              onClick={() => setStep(item)}
            >
              {index + 1}. {t(stepLabel[item])}
            </button>
          ))}
        </div>

        {step === 'sheet' && <CogsSoldPane rows={reportRows} />}

        {!allowed && <div className="rounded-3xl border border-amber-200 bg-amber-50/90 p-5 text-sm leading-6 text-amber-950">{t('remainLocked')}</div>}

        {step === 'count' && (
          <>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {summary.map((item) => (
                <div key={item.label} className={cn('reveal-card relative overflow-hidden rounded-3xl bg-gradient-to-br p-3 shadow-[0_12px_28px_rgba(28,25,23,0.08)]', item.tone)}>
                  <item.icon className="mb-2 h-4 w-4 opacity-80" />
                  <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{item.label}</p>
                  <p className="mt-0.5 break-words text-lg font-semibold tabular-nums sm:text-xl">{item.value}</p>
                  <p className="mt-0.5 text-[11px] opacity-80">{item.hint}</p>
                </div>
              ))}
            </div>
            {allowed && !locked && (
              <div className="cogs-count-screen">
                <div className="cogs-count-toolbar">
                  <div className="cogs-search-card">
                    <div className="cogs-search-row">
                      <Search className="h-4 w-4 shrink-0 text-amber-800" />
                      <input
                        ref={searchInputRef}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter') return
                          const first = listed[0]
                          if (!first) return
                          event.preventDefault()
                          document.getElementById(`cogs-remain-${first.product.id}`)?.focus()
                        }}
                        placeholder={t('pickerPlaceholder')}
                        aria-label={t('remainSearch')}
                        className="min-w-0 flex-1 bg-transparent text-base font-semibold text-ink outline-none placeholder:font-normal placeholder:text-stone-400"
                      />
                      {search ? (
                        <button
                          type="button"
                          className="grid h-8 w-8 place-items-center rounded-full text-stone-500 hover:bg-stone-100"
                          aria-label={t('remainSearchClear')}
                          onClick={() => {
                            setSearch('')
                            searchInputRef.current?.focus()
                          }}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 px-0.5">
                      {(['all', 'open', 'done'] as const).map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setFilter(item)}
                          className={cn('rounded-full px-3 py-1.5 text-xs font-semibold transition', filter === item ? 'bg-stone-950 text-white' : 'bg-white/80 text-stone-600')}
                        >
                          {t(item === 'all' ? 'cogsFilterAll' : item === 'open' ? 'cogsFilterOpen' : 'cogsFilterDone')}
                        </button>
                      ))}
                      <span className="ml-auto text-xs font-semibold tabular-nums text-stone-500">
                        {t('cogsCountProgress').replace('{n}', String(countedIds)).replace('{total}', String(filled.length))}
                      </span>
                    </div>
                    <div className="cogs-search-progress" aria-hidden>
                      <span style={{ width: `${filled.length ? Math.min(100, (countedIds / filled.length) * 100) : 0}%` }} />
                    </div>
                  </div>
                </div>
                <ChainScroll ref={listScrollRef} className="cogs-count-scroll">
                  {myClose?.remainingSaleId && <p className="mb-2.5 rounded-2xl bg-white/70 px-3 py-2 text-xs leading-5 text-stone-600">{t('cogsStockAlreadySent')}</p>}
                  {blocked && <p className="mb-2.5 text-sm text-rose-700">{t('remainOver')}</p>}
                  {!filled.length && <p className="rounded-3xl border border-dashed border-stone-300 bg-white/60 px-4 py-8 text-center text-sm text-stone-500">{t('remainNoneInStock')}</p>}
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {listed.map((row) => (
                      <CountProductCard
                        key={row.product.id}
                        product={row.product}
                        opening={row.opening}
                        remaining={remaining[row.product.id] ?? null}
                        fallbackRemaining={row.fallbackRemaining}
                        highlighted={Boolean(needle && productMatches(row.product, needle))}
                        onRemaining={(next) => writeRemaining(row.product.id, next)}
                        onSkip={() => setSkipped((current) => [...current, row.product.id])}
                      />
                    ))}
                  </div>
                  {needle && !listed.length && <p className="px-1 py-6 text-sm text-stone-500">{t('pickerEmpty')}</p>}
                </ChainScroll>
              </div>
            )}
          </>
        )}

        {step === 'expenses' && (
          <div className="space-y-3">
            <div className={cn('cogs-composer', composerPulse === 'ok' && 'is-ok', composerPulse === 'bad' && 'is-bad')}>
              <div className="cogs-composer-grid">
                <Field label={t('expenseWhat')} className="cogs-composer-field">
                  <TextInput value={description} onChange={(event) => setDescription(event.target.value)} disabled={locked} />
                </Field>
                <Field label={t('expenseAmount')} className="cogs-composer-field">
                  <NumberInput value={amount} onValueChange={setAmount} disabled={locked} />
                </Field>
                <Field label={t('expenseNotes')} className="cogs-composer-field">
                  <TextInput value={notes} onChange={(event) => setNotes(event.target.value)} disabled={locked} />
                </Field>
                <Button
                  variant="gold"
                  size="sm"
                  className="cogs-composer-add emp-shine"
                  disabled={locked}
                  onClick={() => {
                    if (!description.trim() || amount == null || amount < 1) {
                      setComposerPulse('bad')
                      window.setTimeout(() => setComposerPulse(null), 420)
                      return
                    }
                    setExpenseItems((current) => [...current, { id: uid(), description: description.trim(), amount, notes }])
                    setDescription('')
                    setAmount(null)
                    setNotes('')
                    setComposerPulse('ok')
                    window.setTimeout(() => setComposerPulse(null), 700)
                  }}
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('cogsAddExpense')}</span>
                </Button>
              </div>
            </div>
            <section className="cogs-sold-screen">
              <div className="cogs-sold-toolbar">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">{t('yourExpenses')}</p>
                  <p className="mt-0.5 text-xs text-stone-500">{expenseItems.length}</p>
                </div>
                {expenseItems.length > 0 ? (
                  <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                    {t('cogsExpenseTotal')} · {app.money(expenseItems.reduce((sum, item) => sum + (item.amount || 0), 0))}
                  </p>
                ) : null}
              </div>
              <ChainScroll className="cogs-sold-scroll">
                <div className={cogsExpenseGrid}>
                  {expenseItems.map((item, index) => (
                    <CogsExpenseCard
                      key={item.id ?? `expense-${index}`}
                      item={item}
                      index={index}
                      locked={locked}
                      onChange={(next) => setExpenseItems((current) => current.map((row, i) => (i === index ? next : row)))}
                      onRemove={() => setExpenseItems((current) => current.filter((_, i) => i !== index))}
                    />
                  ))}
                  {!expenseItems.length ? <CogsExpenseEmpty /> : null}
                </div>
              </ChainScroll>
            </section>
          </div>
        )}

        {step === 'debts' && (
          <div className="space-y-3">
            <p className="text-sm text-stone-600">{t('cogsDebtsBody')}</p>
            <CogsDebtComposer locked={locked} onAdd={(item) => setDebts((current) => [...current, item])} />
            <section className="cogs-sold-screen">
              <div className="cogs-sold-toolbar">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">{t('cogsDebtsTitle')}</p>
                  <p className="mt-0.5 text-xs text-stone-500">{debts.length}</p>
                </div>
                {debts.length > 0 ? (
                  <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                    {t('cogsDebtsOutstanding')} · {app.money(debts.reduce((sum, item) => sum + debtOutstanding(item), 0))}
                  </p>
                ) : null}
              </div>
              <ChainScroll className="cogs-sold-scroll">
                <div className={cogsDebtGrid}>
                  {debts.map((item, index) => (
                    <DebtCard
                      key={item.id ?? `debt-${index}`}
                      item={item}
                      index={index}
                      locked={locked}
                      onChange={(next) => setDebts((current) => current.map((row) => (row.id === item.id ? next : row)))}
                      onRemove={() => setDebts((current) => current.filter((row) => row.id !== item.id))}
                    />
                  ))}
                  {!debts.length ? <CogsDebtEmpty /> : null}
                </div>
              </ChainScroll>
            </section>
          </div>
        )}

        {step === 'mobile' && (
          <CogsLipaPanel items={mobileItems} onItems={setMobileItems} day={cogsDay} locked={locked} />
        )}

        {step === 'sheet' && (
          <div className="space-y-3">
            {myClose && !locked && (
              <Button variant="secondary" onClick={() => setStep('count')}>
                <Pencil className="h-4 w-4" />
                {t('cogsEditAction')}
              </Button>
            )}
            {!locked && (
              <Panel>
                <CogsEditor
                  hideSold
                  lines={reportRows}
                  onLines={setLines}
                  expenses={expenseItems}
                  onExpenses={setExpenseItems}
                  debts={debts}
                  onDebts={setDebts}
                  mobileItems={mobileItems}
                  onMobileItems={setMobileItems}
                  day={cogsDay}
                />
              </Panel>
            )}
            <CogsSheet
              rows={reportRows}
              showSold={false}
              day={cogsDay}
              expenses={sheetExpenses}
              expenseItems={expenseItems}
              debts={debts}
              mobile={mobile ?? 0}
              mobileItems={mobileItems}
              staff={`${app.user?.fullName ?? ''} @${app.user?.username ?? ''}`}
              approved={myClose?.status === 'approved'}
              canPay={!locked}
              onPay={async (item) => {
                const next = debts.map((row) => (row.id === item.id ? item : row))
                setDebts(next)
                await persist(next, true)
              }}
            />
            {myClose && !locked && (
              <Button variant="danger" loading={busy} onClick={async () => {
                setBusy(true)
                const result = await app.deleteDayClose(myClose.id)
                setBusy(false)
                if (result.ok) {
                  setDebts([])
                  setExpenseItems([])
                  setMobileItems([])
                  setLines([])
                  setRemaining({})
                  setStep('count')
                }
              }}>{t('deleteRecord')}</Button>
            )}
          </div>
        )}
      </div>

      {allowed && !locked && (
        <div className="cogs-dock">
          <div
            className={cn(
              'cogs-dock-inner pointer-events-auto rounded-[1.15rem] border border-white/55 bg-stone-950/90 p-1 shadow-[0_14px_32px_rgba(28,25,23,0.28)] backdrop-blur-xl sm:rounded-[1.35rem] sm:p-1.5 md:p-2',
              step === 'count' || step === 'sheet' ? 'grid-cols-2' : 'grid-cols-3',
            )}
          >
            {step !== 'count' && (
              <Button variant="secondary" className="cogs-dock-btn cogs-dock-btn-back bg-white/95" onClick={() => setStep(prevStep(step))}>
                <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5" />
                <span className="truncate">{t('cogsBack')}</span>
              </Button>
            )}
            <Button
              variant="gold"
              className="cogs-dock-btn cogs-dock-btn-save"
              loading={busy}
              disabled={blocked || !filled.length}
              onClick={() => void persist()}
            >
              <Save className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5" />
              <span className="truncate">{t('save')}</span>
            </Button>
            {step !== 'sheet' && (
              <Button
                variant="secondary"
                className="cogs-dock-btn cogs-dock-btn-next bg-white/95"
                disabled={step === 'count' && (blocked || !filled.length)}
                onClick={() => {
                  if (step === 'count') setLines(countedRows)
                  setStep(nextStep(step))
                }}
              >
                <span className="truncate">{t('cogsNext')}</span>
                <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
