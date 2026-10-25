import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bell, ClipboardCheck, ClipboardList, Gamepad2, PackagePlus, Receipt, ScrollText, ShoppingCart, TrendingUp, Wallet, type LucideIcon } from 'lucide-react'
import { ProductThumb } from '@/components/ProductPicker'
import { ChainScroll } from '@/components/ui/ChainScroll'
import { StockBadge } from '@/components/ui/Feedback'
import { employeeDaySales, employeeDayStockIn } from '@/features/reports/employeeDash'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { StockLevel } from '@/types'
import { asDateKey, formatDate, formatDayLabel, recentDateKeys } from '@/utils/dates'
import { billBalance } from '@/utils/labels'
import { cn } from '@/utils/cn'

function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      setShown(true)
      observer.disconnect()
    }, { threshold: 0.16, rootMargin: '0px 0px -6% 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      className={cn('reveal-card transition duration-700 ease-out', shown ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0', className)}
      style={{ transitionDelay: shown ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  )
}

const glass = 'relative overflow-hidden border border-white/80 bg-white/55 shadow-[0_10px_30px_rgba(28,25,23,0.06)] backdrop-blur-xl'

function weekday(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(year, month - 1, day))
}

export function DashboardPage() {
  const { user, sales, stockIns, restockOrders, activities, expenses, products, snapshots, money, priceChanges, dayCloses } = useApp()
  const { t } = useI18n()
  const [filter, setFilter] = useState<'all' | StockLevel>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [chartMode, setChartMode] = useState<'sales' | 'bills' | 'stock'>('sales')
  const today = asDateKey(new Date().toISOString())
  const [picked, setPicked] = useState(today)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const mine = <T extends { submittedBy: string; status: string; submittedAt: string }>(rows: T[]) => rows.filter((row) => row.submittedBy === user?.id)
  const mySales = mine(sales)
  const openBills = mySales.filter((sale) => sale.recordKind === 'bill' && sale.paymentStatus !== 'paid' && sale.status !== 'cancelled' && sale.status !== 'rejected' && billBalance(sale) > 0)
  const myStock = mine(stockIns)
  const myActivities = mine(activities)
  const myExpenses = mine(expenses)
  const userId = user?.id ?? ''

  const weekMine = useMemo(
    () =>
      recentDateKeys(7).map((key) => {
        const figures = employeeDaySales(sales, dayCloses ?? [], products, priceChanges ?? [], userId, key)
        return {
          key,
          label: formatDayLabel(key),
          weekday: weekday(key),
          sales: figures.sales,
          bills: figures.bills,
          soldUnits: figures.soldUnits,
          stock: employeeDayStockIn(stockIns, userId, key),
          fromCogs: figures.fromCogs,
        }
      }),
    [sales, stockIns, dayCloses, products, priceChanges, userId],
  )
  const focused = weekMine.find((item) => item.key === (hoverKey ?? picked)) ?? weekMine.at(-1)
  const todaySales = weekMine.find((item) => item.key === today)?.sales ?? 0
  const chartValue = (item: (typeof weekMine)[number]) => (chartMode === 'sales' ? item.sales : chartMode === 'bills' ? item.bills : item.stock)
  const chartMax = Math.max(1, ...weekMine.map(chartValue))
  const formatChart = (value: number) => (chartMode === 'stock' ? String(value) : money(value))
  const pending = [...mySales, ...myStock, ...myActivities, ...myExpenses].filter((item) => item.status === 'pending').length
  const rejected = [...mySales, ...myStock, ...myActivities, ...myExpenses].filter((item) => item.status === 'rejected').length
  const stock = products
    .filter((product) => product.isActive)
    .map((product) => ({ product, snap: snapshots.find((item) => item.productId === product.id) }))
    .sort((a, b) => (a.snap?.available ?? 0) - (b.snap?.available ?? 0))
  const peak = Math.max(1, ...stock.map(({ snap }) => snap?.available ?? 0))
  const visible = stock.filter(({ snap }) => filter === 'all' || (snap?.level ?? 'out') === filter)
  const filters = [
    { id: 'all' as const, label: t('dashAll'), count: stock.length },
    { id: 'normal' as const, label: t('stockNormal'), count: stock.filter(({ snap }) => snap?.level === 'normal').length },
    { id: 'low' as const, label: t('stockLow'), count: stock.filter(({ snap }) => snap?.level === 'low').length },
    { id: 'out' as const, label: t('stockOut'), count: stock.filter(({ snap }) => (snap?.level ?? 'out') === 'out').length },
  ]
  const actions: Array<{ to: string; title: string; body: string; icon: LucideIcon; tone: 'gold' | 'dark' | 'glass'; count?: number }> = [
    { to: '/employee/sales', title: t('dashSale'), body: t('dashSaleBody'), icon: ShoppingCart, tone: 'gold' },
    { to: '/employee/stock-in', title: t('dashStock'), body: t('dashStockBody'), icon: PackagePlus, tone: 'dark' },
    { to: '/employee/orders', title: t('dashOrders'), body: t('dashOrdersBody'), icon: ScrollText, tone: 'glass', count: (restockOrders ?? []).filter((order) => order.submittedBy === userId && order.status !== 'received').length },
    { to: '/employee/bills', title: t('billYours'), body: t('dashBillBody'), icon: Receipt, tone: 'glass', count: openBills.length },
    { to: '/employee/expenses', title: t('dashExpense'), body: t('dashExpenseBody'), icon: Wallet, tone: 'glass' },
    { to: '/employee/remaining', title: t('navRemaining'), body: t('remainBody'), icon: ClipboardCheck, tone: 'glass' },
    { to: '/employee/submissions', title: t('dashHistory'), body: t('dashHistoryBody'), icon: ClipboardList, tone: 'glass', count: pending },
    user?.canSubmitActivities
      ? { to: '/employee/activities', title: t('navActivities'), body: t('dashActivityBody'), icon: Gamepad2, tone: 'glass' }
      : { to: '/employee/notifications', title: t('navNotifications'), body: t('dashNoticeBody'), icon: Bell, tone: 'glass' },
  ]
  const kpis = [
    { to: '/employee/submissions', label: t('dashPendingMine'), value: String(pending), tone: pending ? 'text-amber-800' : 'text-ink', hint: t('dashWaiting') },
    { to: '/employee/sales', label: t('dashSalesMine'), value: money(todaySales), tone: 'text-ink', hint: t('dashToday') },
    { to: '/employee/submissions', label: t('dashRejectedMine'), value: String(rejected), tone: rejected ? 'text-rose-800' : 'text-ink', hint: t('dashWaiting') },
    { to: '/employee/bills', label: t('dashWeekBills'), value: String(openBills.length), tone: openBills.length ? 'text-amber-800' : 'text-ink', hint: money(openBills.reduce((sum, sale) => sum + billBalance(sale), 0)) },
  ]

  return (
    <div className="employee-dash relative -mx-3 -mt-4 min-h-[calc(100dvh-4.5rem)] px-3 pb-2 pt-5 sm:-mx-4 sm:-mt-6 sm:px-4 sm:pt-6 md:-mx-8 md:-mb-8 md:px-8 md:pb-10">
      <div className="mx-auto max-w-5xl space-y-4 sm:space-y-5">
        <Reveal>
          <header className="emp-hero flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">{formatDate(today)}</p>
              <h1 className="mt-1 font-display text-[1.7rem] leading-tight text-ink sm:text-3xl">{t('hello')}, {user?.fullName.split(' ')[0]}</h1>
              <p className="mt-1 line-clamp-2 max-w-xl text-sm leading-5 text-stone-600 sm:line-clamp-none sm:leading-6">{t('dashDescription')}</p>
            </div>
            <span className="emp-hero-orb grid h-12 w-12 shrink-0 place-items-center rounded-3xl bg-gradient-to-br from-amber-400 to-amber-800 text-white shadow-lg shadow-amber-900/25 sm:h-14 sm:w-14">
              <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6" />
            </span>
          </header>
        </Reveal>

        <Reveal delay={40}>
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {kpis.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                className={cn(glass, 'emp-kpi emp-shine rounded-[1.35rem] px-3 py-3 transition duration-300 hover:-translate-y-0.5 active:scale-[0.98] sm:px-4 sm:py-4')}
              >
                <p className="text-[11px] leading-4 text-stone-500 sm:text-xs sm:leading-5">{item.label}</p>
                <p className={cn('mt-1 break-words text-lg font-semibold tabular-nums tracking-tight sm:text-2xl', item.tone)}>{item.value}</p>
                <p className="mt-0.5 truncate text-[11px] text-stone-400">{item.hint}</p>
              </Link>
            ))}
          </section>
        </Reveal>

        <Reveal delay={70}>
          <section className={cn(glass, 'rounded-[1.6rem] p-3 sm:rounded-3xl sm:p-5')}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="font-semibold text-ink">{t('dashWeekMine')}</h2>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500 sm:line-clamp-none sm:text-sm">{t('dashWeekBody')}</p>
              </div>
              <div className="grid grid-cols-3 gap-1 rounded-full bg-white/80 p-1 shadow-sm">
                {([
                  ['sales', t('dashWeekSales')],
                  ['bills', t('dashWeekBills')],
                  ['stock', t('dashChartStockIn')],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={chartMode === id}
                    onClick={() => setChartMode(id)}
                    className={cn(
                      'min-h-9 rounded-full px-2 text-[11px] font-semibold transition sm:px-3 sm:text-xs',
                      chartMode === id ? 'bg-stone-950 text-white' : 'text-stone-600 hover:bg-white',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div
              className="emp-chart-plot mt-3"
              role="listbox"
              aria-label={t('dashWeekMine')}
              tabIndex={0}
              onKeyDown={(event) => {
                const index = weekMine.findIndex((item) => item.key === picked)
                const previous = weekMine[index - 1]
                const next = weekMine[index + 1]
                if (event.key === 'ArrowLeft' && previous) {
                  event.preventDefault()
                  setPicked(previous.key)
                }
                if (event.key === 'ArrowRight' && next) {
                  event.preventDefault()
                  setPicked(next.key)
                }
              }}
            >
              <div className="emp-chart-grid" aria-hidden="true" />
              {weekMine.map((item, index) => {
                const value = chartValue(item)
                const height = Math.max(value > 0 ? 12 : 6, (value / chartMax) * 100)
                const active = picked === item.key
                const lit = focused?.key === item.key
                const todayBar = item.key === today
                return (
                  <button
                    key={`${chartMode}-${item.key}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    aria-label={`${item.label}: ${formatChart(value)}`}
                    onClick={() => setPicked(item.key)}
                    onPointerEnter={() => setHoverKey(item.key)}
                    onPointerLeave={() => setHoverKey(null)}
                    className={cn('emp-week-col group flex min-w-0 flex-1 flex-col items-center justify-end gap-1', lit && 'is-on')}
                  >
                    {lit ? <span className="emp-week-tip">{formatChart(value)}</span> : null}
                    <span className="relative flex min-h-0 w-full flex-1 items-end justify-center pb-0.5">
                      <span
                        className={cn(
                          'emp-week-bar w-[62%] max-w-8 transition duration-300 sm:w-[52%]',
                          chartMode === 'sales' && (lit ? 'bg-gradient-to-t from-amber-900 to-amber-300' : 'bg-gradient-to-t from-amber-800/55 to-amber-300/70'),
                          chartMode === 'bills' && (lit ? 'bg-gradient-to-t from-stone-950 to-amber-600' : 'bg-gradient-to-t from-stone-800/55 to-amber-800/50'),
                          chartMode === 'stock' && (lit ? 'bg-stone-950' : 'bg-stone-800/60'),
                          todayBar && !lit && 'ring-2 ring-amber-300/80',
                        )}
                        style={{ height: `${height}%`, animationDelay: `${index * 40}ms` }}
                      />
                    </span>
                    <span className={cn('text-[10px] font-semibold uppercase tracking-wide', lit ? 'text-ink' : 'text-stone-500')}>{item.weekday.slice(0, 2)}</span>
                  </button>
                )
              })}
            </div>

            {focused && (
              <div className="mt-3 rounded-[1.15rem] bg-white/70 px-3 py-2.5 ring-1 ring-white/80 sm:px-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-display text-lg leading-tight text-ink">{focused.label}</p>
                  {focused.fromCogs ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-950">{t('navRemaining')}</span> : null}
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {[
                    [t('dashWeekSales'), money(focused.sales)],
                    [t('dashWeekBills'), money(focused.bills)],
                    [t('dashChartSold'), String(focused.soldUnits)],
                    [t('dashChartStockIn'), String(focused.stock)],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0 rounded-xl bg-[#faf7f2] px-1.5 py-1.5 sm:px-2.5">
                      <p className="truncate text-[9px] uppercase tracking-wide text-stone-500">{label}</p>
                      <p className="mt-0.5 truncate text-[11px] font-semibold tabular-nums text-ink sm:text-sm">{value}</p>
                    </div>
                  ))}
                </div>
                {focused.sales <= 0 && focused.bills <= 0 && focused.stock <= 0 ? (
                  <p className="mt-2 text-xs text-stone-500">{t('dashPickedEmpty')}</p>
                ) : null}
              </div>
            )}
          </section>
        </Reveal>

        <div className="emp-actions">
          {actions.map((action, index) => (
            <Reveal key={action.to} className="h-full" delay={90 + index * 30}>
              <Link
                to={action.to}
                className={cn(
                  'emp-action emp-shine group transition duration-300 hover:-translate-y-0.5 active:scale-[0.98]',
                  action.tone === 'gold' && 'border border-amber-200/60 bg-gradient-to-br from-amber-500 to-amber-800 text-white shadow-[0_14px_28px_rgba(180,83,9,0.22)]',
                  action.tone === 'dark' && 'border border-white/10 bg-charcoal text-white shadow-[0_14px_28px_rgba(22,20,18,0.16)]',
                  action.tone === 'glass' && cn(glass, 'text-ink hover:bg-white/80'),
                )}
              >
                <span className="flex items-start justify-between gap-2">
                  <span
                    className={cn(
                      'grid h-10 w-10 place-items-center rounded-2xl',
                      action.tone === 'gold' && 'bg-white/20',
                      action.tone === 'dark' && 'bg-white/10',
                      action.tone === 'glass' && 'bg-white/70 text-amber-800',
                    )}
                  >
                    <action.icon className="h-5 w-5 transition duration-300 group-hover:scale-110" />
                  </span>
                  {action.count != null ? (
                    <span className={cn('text-lg font-semibold tabular-nums leading-none', action.tone === 'glass' ? 'text-ink' : 'text-white')}>{action.count}</span>
                  ) : null}
                </span>
                <span className="emp-action-copy min-w-0">
                  <span className="block font-semibold leading-5">{action.title}</span>
                  <span className={cn('emp-action-body mt-0.5 text-xs leading-4', action.tone === 'gold' ? 'text-amber-50/90' : action.tone === 'dark' ? 'text-stone-300' : 'text-stone-500')}>{action.body}</span>
                </span>
              </Link>
            </Reveal>
          ))}
        </div>

        <Reveal delay={80}>
          <section className={cn(glass, 'rounded-3xl p-3 sm:p-5')}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-semibold text-ink">{t('stockOnHand')}</h2>
                <p className="mt-1 max-w-xl text-sm leading-5 text-stone-500">{t('stockOnHandBody')}</p>
              </div>
              <p className="text-sm font-semibold tabular-nums text-ink">{visible.length} / {stock.length}</p>
            </div>
            <div className="mt-4 grid w-full grid-cols-2 gap-1.5 sm:grid-cols-4">
              {filters.map((item) => {
                const active = filter === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(item.id)}
                    className={cn(
                      'flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-2 text-center transition duration-200 active:scale-[0.98]',
                      active ? 'bg-charcoal text-white shadow-md' : 'bg-white/70 text-stone-600 hover:bg-white',
                    )}
                  >
                    <span className="max-w-full text-balance text-xs font-medium leading-4 sm:text-sm">{item.label}</span>
                    <span className={cn('text-[11px] font-semibold tabular-nums leading-4', active ? 'text-white/80' : 'text-stone-500')}>{item.count}</span>
                  </button>
                )
              })}
            </div>
            <ChainScroll className="emp-stock-scroll mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
              {visible.map(({ product, snap }, index) => {
                const available = snap?.available ?? 0
                const level = snap?.level ?? 'out'
                const open = openId === product.id
                const bar = level === 'out' ? 'bg-rose-600' : level === 'low' ? 'bg-amber-600' : 'bg-gradient-to-r from-stone-700 to-amber-800'
                return (
                  <Reveal key={product.id} delay={Math.min(index, 5) * 40}>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenId(open ? null : product.id)}
                      className={cn(
                        'emp-product w-full rounded-2xl border border-white/70 bg-white/40 p-3 text-left backdrop-blur-md transition duration-300 hover:bg-white/80 active:scale-[0.99]',
                        open && 'bg-white/90 ring-1 ring-amber-300/70',
                      )}
                    >
                      <span className="flex items-center gap-3">
                        <ProductThumb src={product.imageUrl} name={product.name} className="h-12 w-12 rounded-xl" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-semibold leading-5 text-ink">{product.name}</span>
                            {level !== 'normal' && <StockBadge level={level} />}
                          </span>
                          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-stone-200/90">
                            <span className={cn('profit-fill block h-1.5 rounded-full', bar)} style={{ width: `${Math.max(available > 0 ? 8 : 0, (available / peak) * 100)}%` }} />
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-xl font-semibold tabular-nums leading-none text-ink">{available}</span>
                          <span className="mt-1 block text-[11px] text-stone-500">{t('stockAvailable')}</span>
                        </span>
                      </span>
                      <span className={cn('grid transition-all duration-300', open ? 'mt-3 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
                        <span className="overflow-hidden">
                          <span className="grid grid-cols-3 gap-2">
                            {[
                              [t('dashConfirmedLabel'), snap?.confirmed ?? 0],
                              [t('dashReservedLabel'), snap?.reserved ?? 0],
                              [t('stockAvailable'), available],
                            ].map(([label, value]) => (
                              <span key={String(label)} className="rounded-xl bg-stone-100/80 px-2 py-2 text-center">
                                <span className="block text-[11px] text-stone-500">{label}</span>
                                <span className="mt-1 block text-base font-semibold tabular-nums text-ink">{value}</span>
                              </span>
                            ))}
                          </span>
                        </span>
                      </span>
                    </button>
                  </Reveal>
                )
              })}
              {!visible.length && <p className="px-1 py-6 text-sm text-stone-500">{t('stockNone')}</p>}
            </ChainScroll>
          </section>
        </Reveal>
      </div>
    </div>
  )
}
