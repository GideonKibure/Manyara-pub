import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { ClipboardCheck, ClipboardList, PackagePlus, Receipt, ScrollText, ShoppingCart, Wallet } from 'lucide-react'
import { ProductThumb } from '@/components/ProductPicker'
import { StockBadge } from '@/components/ui/Feedback'
import { datedItemMoney, saleBusinessDay } from '@/features/reports/metrics'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { StockLevel } from '@/types'
import { asDateKey, formatDayLabel, recentDateKeys } from '@/utils/dates'
import { billBalance, stockInUnits } from '@/utils/labels'
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

export function DashboardPage() {
  const { user, sales, stockIns, activities, expenses, products, snapshots, money, priceChanges, dayCloses } = useApp()
  const { t } = useI18n()
  const [filter, setFilter] = useState<'all' | StockLevel>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const mine = <T extends { submittedBy: string; status: string; submittedAt: string }>(rows: T[]) => rows.filter((row) => row.submittedBy === user?.id)
  const mySales = mine(sales)
  const openBills = mySales.filter((sale) => sale.recordKind === 'bill' && sale.paymentStatus !== 'paid' && sale.status !== 'cancelled' && sale.status !== 'rejected' && billBalance(sale) > 0)
  const myStock = mine(stockIns)
  const myActivities = mine(activities)
  const myExpenses = mine(expenses)
  const today = asDateKey(new Date().toISOString())
  const pricing = { products, priceChanges, dayCloses }
  const approvedToday = mySales.filter((sale) => sale.status === 'approved' && saleBusinessDay(pricing, sale) === today)
  const weekMine = useMemo(
    () =>
      recentDateKeys(7).map((key) => ({
        key,
        label: formatDayLabel(key),
        sales: mySales
          .filter((sale) => sale.status === 'approved' && saleBusinessDay({ dayCloses }, sale) === key)
          .reduce((sum, sale) => {
            if (typeof sale.settledAmount === 'number') return sum + sale.settledAmount
            return sum + sale.items.reduce((line, item) => line + datedItemMoney({ products, priceChanges }, item, key).revenue, 0)
          }, 0),
        stock: myStock.filter((entry) => entry.status === 'approved' && entry.deliveryDate === key).reduce((sum, entry) => sum + stockInUnits(entry.items), 0),
      })),
    [mySales, myStock, dayCloses, products, priceChanges],
  )
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
  const quiet = [
    { to: '/employee/bills', title: t('dashBill'), body: t('dashBillBody'), icon: Receipt },
    { to: '/employee/expenses', title: t('dashExpense'), body: t('dashExpenseBody'), icon: Wallet },
    { to: '/employee/submissions', title: t('dashHistory'), body: t('dashHistoryBody'), icon: ClipboardList },
    { to: '/employee/remaining', title: t('navRemaining'), body: t('remainBody'), icon: ClipboardCheck },
  ]

  return (
    <div className="employee-dash relative -mx-3 -mt-4 min-h-[calc(100dvh-4.5rem)] px-3 pb-28 pt-5 sm:-mx-4 sm:-mt-6 sm:px-4 sm:pt-6 md:-mx-8 md:-mb-8 md:px-8 md:pb-10">
      <div className="mx-auto max-w-5xl space-y-5">
        <Reveal>
          <header>
            <h1 className="font-display text-3xl text-ink">{t('hello')}, {user?.fullName.split(' ')[0]}</h1>
            <p className="mt-1 max-w-xl text-sm leading-6 text-stone-600">{t('dashDescription')}</p>
          </header>
        </Reveal>

        <Reveal delay={40}>
          <section className={cn(glass, 'grid grid-cols-2 divide-line rounded-3xl sm:grid-cols-4 sm:divide-x')}>
            {[
              { label: t('dashPendingMine'), value: String(pending), tone: pending ? 'text-amber-800' : 'text-ink' },
              { label: t('dashSalesMine'), value: money(approvedToday.reduce((sum, sale) => {
                if (typeof sale.settledAmount === 'number') return sum + sale.settledAmount
                return sum + sale.items.reduce((line, item) => line + datedItemMoney(pricing, item, today).revenue, 0)
              }, 0)), tone: 'text-ink' },
              { label: t('dashRejectedMine'), value: String(rejected), tone: rejected ? 'text-rose-800' : 'text-ink' },
              { label: t('dashStockCount'), value: String(stock.length), tone: 'text-ink' },
            ].map((item) => (
              <div key={item.label} className="min-w-0 px-4 py-4">
                <p className="text-xs leading-5 text-stone-500">{item.label}</p>
                <p className={cn('mt-1 break-words text-xl font-semibold tabular-nums tracking-tight sm:text-2xl', item.tone)}>{item.value}</p>
              </div>
            ))}
          </section>
        </Reveal>

        <Reveal delay={60}>
          <section className={cn(glass, 'rounded-3xl p-4 sm:p-5')}>
            <h2 className="font-semibold text-ink">{t('dashWeekMine')}</h2>
            <div className="mt-3 h-40 sm:h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekMine}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number, name: string) => [name === 'sales' ? money(Number(value)) : value, name === 'sales' ? t('statementSales') : t('dashChartStockIn')]} />
                  <Bar dataKey="sales" fill="#b45309" radius={[8, 8, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="stock" fill="#1c1917" radius={[8, 8, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </Reveal>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Reveal delay={80}>
            <Link to="/employee/sales" className="group flex min-h-24 items-center gap-4 rounded-3xl border border-amber-200/60 bg-gradient-to-br from-amber-500/80 to-amber-800/75 p-4 text-white shadow-[0_16px_40px_rgba(180,83,9,0.22)] backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 active:scale-[0.99]">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/20">
                <ShoppingCart className="h-6 w-6 transition duration-300 group-hover:scale-105" />
              </span>
              <span>
                <span className="block text-lg font-semibold leading-6">{t('dashSale')}</span>
                <span className="mt-1 block text-sm leading-5 text-amber-50/90">{t('dashSaleBody')}</span>
              </span>
            </Link>
          </Reveal>
          <Reveal delay={120}>
            <Link to="/employee/stock-in" className="group flex min-h-24 items-center gap-4 rounded-3xl border border-white/10 bg-charcoal/90 p-4 text-white shadow-[0_16px_40px_rgba(22,20,18,0.18)] backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 active:scale-[0.99]">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10">
                <PackagePlus className="h-6 w-6 transition duration-300 group-hover:scale-105" />
              </span>
              <span>
                <span className="block text-lg font-semibold leading-6">{t('dashStock')}</span>
                <span className="mt-1 block text-sm leading-5 text-stone-300">{t('dashStockBody')}</span>
              </span>
            </Link>
          </Reveal>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Reveal delay={140}>
            <Link to="/employee/orders" className={cn(glass, 'flex min-h-24 items-center justify-between gap-4 rounded-3xl p-4 text-ink transition duration-300 hover:-translate-y-0.5 hover:bg-white/80 active:scale-[0.99]')}>
              <span className="flex min-w-0 items-center gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/70 text-stone-700">
                  <ScrollText className="h-6 w-6" />
                </span>
                <span className="min-w-0">
                  <span className="block text-lg font-semibold leading-6">{t('dashOrders')}</span>
                  <span className="mt-1 block text-sm leading-5 text-stone-500">{t('dashOrdersBody')}</span>
                </span>
              </span>
              <span className="shrink-0 text-2xl font-semibold tabular-nums text-ink">{mySales.length}</span>
            </Link>
          </Reveal>
          <Reveal delay={160}>
            <Link to="/employee/bills" className={cn(glass, 'flex min-h-24 items-center justify-between gap-4 rounded-3xl p-4 text-ink transition duration-300 hover:-translate-y-0.5 hover:bg-white/80 active:scale-[0.99]')}>
              <span className="flex min-w-0 items-center gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/70 text-stone-700">
                  <Receipt className="h-6 w-6" />
                </span>
                <span className="min-w-0">
                  <span className="block text-lg font-semibold leading-6">{t('billYours')}</span>
                  <span className="mt-1 block text-sm leading-5 text-stone-500">{t('dashBillBody')}</span>
                </span>
              </span>
              <span className="shrink-0 text-2xl font-semibold tabular-nums text-ink">{openBills.length}</span>
            </Link>
          </Reveal>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {quiet.map((action, index) => (
            <Reveal key={action.to} delay={160 + index * 50}>
              <Link to={action.to} className={cn(glass, 'flex min-h-20 items-center gap-3 rounded-2xl p-4 text-ink transition duration-300 hover:-translate-y-0.5 hover:bg-white/80 active:scale-[0.99]')}>
                <action.icon className="h-5 w-5 shrink-0 text-stone-500" />
                <span className="min-w-0">
                  <span className="block font-semibold leading-5">{action.title}</span>
                  <span className="mt-0.5 block text-sm leading-5 text-stone-500">{action.body}</span>
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
                      active ? 'bg-charcoal text-white' : 'bg-white/70 text-stone-600 hover:bg-white',
                    )}
                  >
                    <span className="max-w-full text-balance text-xs font-medium leading-4 sm:text-sm">{item.label}</span>
                    <span className={cn('text-[11px] font-semibold tabular-nums leading-4', active ? 'text-white/80' : 'text-stone-500')}>{item.count}</span>
                  </button>
                )
              })}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
              {visible.map(({ product, snap }, index) => {
                const available = snap?.available ?? 0
                const level = snap?.level ?? 'out'
                const open = openId === product.id
                const bar = level === 'out' ? 'bg-rose-600' : level === 'low' ? 'bg-amber-600' : 'bg-stone-800'
                return (
                  <Reveal key={product.id} delay={Math.min(index, 5) * 40}>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenId(open ? null : product.id)}
                      className={cn(
                        'w-full rounded-2xl border border-white/70 bg-white/40 p-3 text-left backdrop-blur-md transition duration-300 hover:bg-white/80 active:scale-[0.99]',
                        open && 'bg-white/90 ring-1 ring-stone-300',
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
                            <span className={cn('block h-1.5 rounded-full transition-all duration-700', bar)} style={{ width: `${Math.max(available > 0 ? 8 : 0, (available / peak) * 100)}%` }} />
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
            </div>
          </section>
        </Reveal>
      </div>
    </div>
  )
}
