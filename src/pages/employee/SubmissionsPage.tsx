import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Gamepad2, PackagePlus, Receipt, ShoppingCart, Wallet } from 'lucide-react'
import { TextInput } from '@/components/ui/Fields'
import { PageHeader, StatusBadge } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { ActivityDetail, ExpenseDetail, SaleDetail, StockInDetail } from '@/features/transactions/Details'
import { stockInProductNames, stockInMatchesQuery } from '@/features/stockIn/stockInSearch'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { ApprovalStatus } from '@/types'
import { cn } from '@/utils/cn'
import { formatDateTime } from '@/utils/dates'
import { saleTotal, stockInTotal } from '@/utils/labels'

const WINDOW_MS = 24 * 60 * 60 * 1000

type Kind = 'all' | 'stock' | 'sale' | 'bill' | 'activity' | 'expense'

const kindMeta = {
  stock: { icon: PackagePlus, tone: 'from-sky-500 to-indigo-800' },
  sale: { icon: ShoppingCart, tone: 'from-amber-500 to-amber-800' },
  bill: { icon: Receipt, tone: 'from-rose-500 to-rose-900' },
  activity: { icon: Gamepad2, tone: 'from-violet-500 to-violet-900' },
  expense: { icon: Wallet, tone: 'from-emerald-500 to-teal-900' },
} as const

function remainingLabel(ms: number) {
  const total = Math.max(0, ms)
  const hours = Math.floor(total / 3_600_000)
  const minutes = Math.floor((total % 3_600_000) / 60_000)
  if (hours >= 1) return `${hours}h ${minutes}m`
  return `${Math.max(1, minutes)}m`
}

export function SubmissionsPage() {
  const app = useApp()
  const { t } = useI18n()
  const [kind, setKind] = useState<Kind>('all')
  const [status, setStatus] = useState('all')
  const [query, setQuery] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [open, setOpen] = useState<{ kind: Exclude<Kind, 'all'>; id: string } | null>(null)
  const mine = app.user?.id
  const needle = query.trim().toLowerCase()

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(tick)
  }, [])

  const rows = useMemo(() => {
    const stock = app.stockIns.filter((item) => item.submittedBy === mine).map((item) => {
      const names = stockInProductNames(item, app.products)
      return {
        kind: 'stock' as const,
        id: item.id,
        code: item.code,
        status: item.status as ApprovalStatus,
        at: item.submittedAt,
        label: `${names.join(', ') || item.supplierName} · ${app.money(stockInTotal(item.items))}`,
        match: stockInMatchesQuery(item, app.products, query),
      }
    })
    const sales = app.sales.filter((item) => item.submittedBy === mine).map((item) => {
      const names = item.items.map((line) => app.products.find((product) => product.id === line.productId)?.name ?? '').filter(Boolean)
      const hay = `${item.code} ${item.customerName ?? ''} ${names.join(' ')}`.toLowerCase()
      const isBill = item.recordKind === 'bill'
      return {
        kind: (isBill ? 'bill' : 'sale') as 'bill' | 'sale',
        id: item.id,
        code: item.code,
        status: item.status as ApprovalStatus,
        at: item.submittedAt,
        label: `${names.slice(0, 3).join(', ') || app.money(saleTotal(item.items))} · ${app.money(saleTotal(item.items))}`,
        match: !needle || hay.includes(needle),
      }
    })
    const activities = app.activities.filter((item) => item.submittedBy === mine).map((item) => ({
      kind: 'activity' as const,
      id: item.id,
      code: item.code,
      status: item.status as ApprovalStatus,
      at: item.submittedAt,
      label: app.money(item.amount),
      match: !needle || `${item.code} ${item.notes ?? ''}`.toLowerCase().includes(needle),
    }))
    const expenses = app.expenses.filter((item) => item.submittedBy === mine).map((item) => ({
      kind: 'expense' as const,
      id: item.id,
      code: item.code,
      status: item.status as ApprovalStatus,
      at: item.submittedAt,
      label: `${item.description} · ${app.money(item.amount)}`,
      match: !needle || `${item.code} ${item.description} ${item.notes ?? ''}`.toLowerCase().includes(needle),
    }))
    return [...stock, ...sales, ...activities, ...expenses]
      .map((row) => {
        const stamp = new Date(row.at).getTime()
        const left = stamp + WINDOW_MS - now
        return { ...row, stamp, left }
      })
      .filter((row) => Number.isFinite(row.stamp) && row.left > 0)
      .filter((row) => (kind === 'all' || row.kind === kind) && (status === 'all' || row.status === status) && row.match)
      .sort((a, b) => b.stamp - a.stamp)
  }, [app.activities, app.expenses, app.money, app.products, app.sales, app.stockIns, kind, mine, needle, now, query, status])

  const stock = open?.kind === 'stock' ? app.stockIns.find((item) => item.id === open.id) : undefined
  const sale = open?.kind === 'sale' || open?.kind === 'bill' ? app.sales.find((item) => item.id === open.id) : undefined
  const activity = open?.kind === 'activity' ? app.activities.find((item) => item.id === open.id) : undefined
  const expense = open?.kind === 'expense' ? app.expenses.find((item) => item.id === open.id) : undefined

  const kinds: Array<{ id: Kind; label: string }> = [
    { id: 'all', label: t('allTypes') },
    { id: 'stock', label: t('navStockIn') },
    { id: 'sale', label: t('navSales') },
    { id: 'bill', label: t('navBills') },
    { id: 'activity', label: t('navActivities') },
    { id: 'expense', label: t('navExpenses') },
  ]
  const statuses = [
    { id: 'all', label: t('allStatuses') },
    { id: 'pending', label: t('statusPending') },
    { id: 'approved', label: t('statusApproved') },
    { id: 'rejected', label: t('statusRejected') },
    { id: 'cancelled', label: t('statusCancelled') },
  ]

  function kindTitle(value: Exclude<Kind, 'all'>) {
    if (value === 'stock') return t('navStockIn')
    if (value === 'sale') return t('navSales')
    if (value === 'bill') return t('navBills')
    if (value === 'expense') return t('navExpenses')
    return t('navActivities')
  }

  return (
    <div>
      <PageHeader title={t('pageSubmissions')} description={t('pageSubmissionsBody')} />
      <div className="sub-screen mx-auto w-full">
        <header className="sub-screen-head">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">
                <ClipboardList className="h-3.5 w-3.5" />
                {t('pageSubmissions')}
              </p>
              <p className="mt-1 text-sm text-amber-100/80">{t('submissionsWindow')}</p>
            </div>
            <span className="shrink-0 rounded-full bg-white/12 px-2.5 py-1 text-xs font-semibold tabular-nums text-white">
              {rows.length}
            </span>
          </div>
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('searchSubmissions')}
            aria-label={t('searchSubmissions')}
            className="sub-search mt-3 h-10 rounded-xl"
          />
          <div className="sub-chip-row mt-3">
            {kinds.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn('sub-chip', kind === item.id && 'is-on')}
                onClick={() => setKind(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="sub-chip-row mt-2">
            {statuses.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn('sub-chip is-status', status === item.id && 'is-on')}
                onClick={() => setStatus(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>
        <div className="sub-screen-body hide-scrollbar">
          {rows.map((row, index) => {
            const meta = kindMeta[row.kind]
            const Icon = meta.icon
            const fill = Math.max(4, Math.min(100, Math.round((row.left / WINDOW_MS) * 100)))
            return (
              <button
                key={`${row.kind}-${row.id}`}
                type="button"
                className="sub-card"
                style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
                onClick={() => setOpen({ kind: row.kind, id: row.id })}
              >
                <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-sm', meta.tone)}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-ink">{row.code}</span>
                    <StatusBadge status={row.status} />
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-stone-500">{kindTitle(row.kind)} · {row.label}</span>
                  <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-stone-200/80">
                    <span className="sub-card-fill block h-full rounded-full" style={{ width: `${fill}%` }} />
                  </span>
                  <span className="mt-1 flex items-center justify-between gap-2 text-[11px] text-stone-400">
                    <span className="truncate">{formatDateTime(row.at)}</span>
                    <span className="shrink-0 tabular-nums">{remainingLabel(row.left)} {t('submissionsLeft')}</span>
                  </span>
                </span>
              </button>
            )
          })}
          {!rows.length && (
            <div className="sub-empty">
              <ClipboardList className="mx-auto h-8 w-8 text-amber-800/60" />
              <p className="mt-3 text-sm text-stone-500">{t('submissionsEmpty')}</p>
            </div>
          )}
        </div>
      </div>
      <Modal open={Boolean(open)} title={t('pageSubmissions')} onClose={() => setOpen(null)} wide>
        {stock && <StockInDetail record={stock} mode="own" />}
        {sale && <SaleDetail record={sale} mode="own" />}
        {activity && <ActivityDetail record={activity} mode="own" />}
        {expense && <ExpenseDetail record={expense} mode="own" />}
      </Modal>
    </div>
  )
}
