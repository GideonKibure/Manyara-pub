import { useMemo, useState } from 'react'
import { ChevronDown, Package, Receipt, Search, Wallet } from 'lucide-react'
import { ApproveAllButton } from '@/components/ui/ApproveAll'
import { Button } from '@/components/ui/Button'
import { PageHeader, Panel, StatusBadge } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { ProductName, ProductThumb, StaffCell } from '@/components/ProductPicker'
import { pendingForAdmin } from '@/features/sales/holds'
import { ActivityDetail, ExpenseDetail, SaleDetail, StockInDetail } from '@/features/transactions/Details'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { ApprovalStatus, Product } from '@/types'
import { formatDateTime } from '@/utils/dates'
import { saleTotal, stockInTotal } from '@/utils/labels'
import { cn } from '@/utils/cn'

const tabs = ['Stock in', 'Sales', 'Credits', 'Activities', 'Expenses'] as const
type HistoryKind = 'all' | 'stock' | 'sale' | 'activity' | 'expense'
type HistoryStatus = 'all' | ApprovalStatus

type Line = { id: string; name: string; imageUrl?: string; qty: number }

type HistoryRow = {
  id: string
  recordId: string
  at: string
  kind: Exclude<HistoryKind, 'all'>
  code: string
  detail: string
  employeeId: string
  status: ApprovalStatus
  amount: number
  lines: Line[]
}

function linesFrom(
  items: Array<{ id?: string; productId: string; quantity?: number; stockQuantity?: number }>,
  products: Product[],
): Line[] {
  return items.map((item) => {
    const product = products.find((entry) => entry.id === item.productId)
    return {
      id: item.id ?? item.productId,
      name: product?.name ?? 'Product',
      imageUrl: product?.imageUrl,
      qty: item.quantity ?? item.stockQuantity ?? 0,
    }
  })
}

function PhotoStack({ lines }: { lines: Line[] }) {
  const shown = lines.slice(0, 4)
  const extra = lines.length - shown.length
  if (!shown.length) {
    return (
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-950">
        <Package className="h-6 w-6" />
      </span>
    )
  }
  return (
    <span className="flex items-center">
      {shown.map((line, index) => (
        <ProductThumb
          key={line.id}
          src={line.imageUrl}
          name={line.name}
          className={cn('h-12 w-12 rounded-2xl ring-2 ring-white', index ? '-ml-3' : '')}
        />
      ))}
      {extra > 0 && (
        <span className="-ml-3 grid h-12 w-12 place-items-center rounded-2xl bg-stone-950 text-xs font-semibold text-white ring-2 ring-white">
          +{extra}
        </span>
      )}
    </span>
  )
}

export function ApprovalsPage() {
  const app = useApp()
  const { stockIns, sales, activities, expenses, nameOf, money, activityTypes, products } = app
  const { t } = useI18n()
  const [view, setView] = useState<'queue' | 'history'>('queue')
  const [tab, setTab] = useState<(typeof tabs)[number]>('Stock in')
  const [approving, setApproving] = useState(false)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<HistoryKind>('all')
  const [status, setStatus] = useState<HistoryStatus>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [inspect, setInspect] = useState<HistoryRow | null>(null)
  const pendingStock = stockIns.filter((item) => item.status === 'pending')
  const pendingSales = sales.filter((item) => pendingForAdmin(item))
  const pendingCredits = sales.filter((item) => item.status === 'pending' && item.recordKind === 'bill')
  const pendingActivities = activities.filter((item) => item.status === 'pending')
  const pendingExpenses = expenses.filter((item) => item.status === 'pending')
  const counts = [pendingStock.length, pendingSales.length, pendingCredits.length, pendingActivities.length, pendingExpenses.length]
  const waiting = counts.reduce((sum, item) => sum + item, 0)
  const kindLabel: Record<Exclude<HistoryKind, 'all'>, string> = {
    stock: t('navStockIn'),
    sale: t('navSales'),
    activity: t('navActivities'),
    expense: t('navExpenses'),
  }

  const history = useMemo<HistoryRow[]>(() => {
    const rows: HistoryRow[] = [
      ...stockIns.filter((item) => item.status !== 'pending').map((item) => ({
        id: `stock-${item.id}`,
        recordId: item.id,
        at: item.reviewedAt ?? item.submittedAt,
        kind: 'stock' as const,
        code: item.code,
        detail: `${item.supplierName} · ${item.invoiceRef}${item.rejectionReason ? ` · ${item.rejectionReason}` : ''}`,
        employeeId: item.submittedBy,
        status: item.status,
        amount: stockInTotal(item.items),
        lines: linesFrom(item.items, products),
      })),
      ...sales.filter((item) => item.status !== 'pending').map((item) => ({
        id: `sale-${item.id}`,
        recordId: item.id,
        at: item.reviewedAt ?? item.submittedAt,
        kind: 'sale' as const,
        code: item.code,
        detail: `${item.recordKind === 'bill' ? `${item.customerName || 'Customer'} · ` : ''}${money(saleTotal(item.items))} · ${item.paymentStatus}${item.rejectionReason ? ` · ${item.rejectionReason}` : ''}`,
        employeeId: item.submittedBy,
        status: item.status,
        amount: saleTotal(item.items),
        lines: linesFrom(item.items, products),
      })),
      ...activities.filter((item) => item.status !== 'pending').map((item) => ({
        id: `activity-${item.id}`,
        recordId: item.id,
        at: item.reviewedAt ?? item.occurredAt,
        kind: 'activity' as const,
        code: item.code,
        detail: `${activityTypes.find((type) => type.id === item.activityTypeId)?.name ?? 'Income'} · ${money(item.amount)}${item.rejectionReason ? ` · ${item.rejectionReason}` : ''}`,
        employeeId: item.submittedBy,
        status: item.status,
        amount: item.amount,
        lines: [],
      })),
      ...expenses.filter((item) => item.status !== 'pending').map((item) => ({
        id: `expense-${item.id}`,
        recordId: item.id,
        at: item.reviewedAt ?? item.submittedAt,
        kind: 'expense' as const,
        code: item.code,
        detail: `${item.description} · ${money(item.amount)}${item.rejectionReason ? ` · ${item.rejectionReason}` : ''}`,
        employeeId: item.submittedBy,
        status: item.status,
        amount: item.amount,
        lines: [],
      })),
    ]
    return rows.sort((a, b) => b.at.localeCompare(a.at))
  }, [stockIns, sales, activities, expenses, money, activityTypes, products])

  const needle = query.trim().toLowerCase()
  const listed = history.filter((row) => {
    if (kind !== 'all' && row.kind !== kind) return false
    if (status !== 'all' && row.status !== status) return false
    if (!needle) return true
    const hay = `${row.code} ${row.detail} ${nameOf(row.employeeId)} ${row.lines.map((line) => line.name).join(' ')}`.toLowerCase()
    return hay.includes(needle)
  })

  const inspectStock = inspect?.kind === 'stock' ? stockIns.find((item) => item.id === inspect.recordId) : undefined
  const inspectSale = inspect?.kind === 'sale' ? sales.find((item) => item.id === inspect.recordId) : undefined
  const inspectActivity = inspect?.kind === 'activity' ? activities.find((item) => item.id === inspect.recordId) : undefined
  const inspectExpense = inspect?.kind === 'expense' ? expenses.find((item) => item.id === inspect.recordId) : undefined

  return (
    <div className="space-y-4">
      <PageHeader title={t('pageApprovals')} description={t('pageApprovalsBody')} />
      <div className="flex rounded-full bg-white/80 p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setView('queue')}
          className={cn('min-h-11 flex-1 rounded-full px-4 text-sm font-semibold', view === 'queue' ? 'bg-stone-950 text-white' : 'text-stone-600')}
        >
          {t('approvalQueue')} ({waiting})
        </button>
        <button
          type="button"
          onClick={() => setView('history')}
          className={cn('min-h-11 flex-1 rounded-full px-4 text-sm font-semibold', view === 'history' ? 'bg-stone-950 text-white' : 'text-stone-600')}
        >
          {t('approvalHistory')} ({history.length})
        </button>
      </div>

      {view === 'queue' && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {tabs.map((item, index) => (
              <Button key={item} variant={tab === item ? 'primary' : 'secondary'} className="min-h-11 flex-1 sm:flex-none" onClick={() => setTab(item)}>
                {{ 'Stock in': t('navStockIn'), Sales: t('navSales'), Credits: t('tabCredits'), Activities: t('navActivities'), Expenses: t('navExpenses') }[item]} ({counts[index]})
              </Button>
            ))}
          </div>
          {tab === 'Stock in' && (
            <ApproveAllButton
              count={pendingStock.length}
              loading={approving}
              label={t('approveAllStockIn')}
              onClick={async () => {
                setApproving(true)
                await app.approveAllPending('stock_in')
                setApproving(false)
              }}
            />
          )}
          {tab === 'Sales' && (
            <ApproveAllButton
              count={pendingSales.length}
              loading={approving}
              label={t('approveAllSales')}
              onClick={async () => {
                setApproving(true)
                await app.approveAllPending('sale')
                setApproving(false)
              }}
            />
          )}
          {tab === 'Credits' && (
            <ApproveAllButton
              count={pendingCredits.length}
              loading={approving}
              label={t('approveAllCredits')}
              onClick={async () => {
                setApproving(true)
                await app.approveAllPending('bill')
                setApproving(false)
              }}
            />
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {tab === 'Stock in' && pendingStock.map((record) => <Panel key={record.id}><StockInDetail record={record} mode="review" /></Panel>)}
            {tab === 'Sales' && pendingSales.map((record) => <Panel key={record.id}><SaleDetail record={record} mode="review" /></Panel>)}
            {tab === 'Credits' && pendingCredits.map((record) => <Panel key={record.id}><SaleDetail record={record} mode="review" /></Panel>)}
            {tab === 'Activities' && pendingActivities.map((record) => <Panel key={record.id}><ActivityDetail record={record} mode="review" /></Panel>)}
            {tab === 'Expenses' && pendingExpenses.map((record) => <Panel key={record.id}><ExpenseDetail record={record} mode="review" /></Panel>)}
          </div>
          {((tab === 'Stock in' && !pendingStock.length) || (tab === 'Sales' && !pendingSales.length) || (tab === 'Credits' && !pendingCredits.length) || (tab === 'Activities' && !pendingActivities.length) || (tab === 'Expenses' && !pendingExpenses.length)) && (
            <Panel><p className="text-sm text-stone-500">{t('approvalQueueEmpty')}</p></Panel>
          )}
        </>
      )}

      {view === 'history' && (
        <div className="space-y-4">
          <p className="text-sm leading-6 text-stone-600">{t('approvalHistoryBody')}</p>
          <div className="glass-panel flex items-center gap-2 rounded-2xl px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-amber-800" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('historySearch')}
              className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:font-normal placeholder:text-stone-400"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'stock', 'sale', 'activity', 'expense'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setKind(item)}
                className={cn('rounded-full px-3 py-1.5 text-xs font-semibold', kind === item ? 'bg-stone-950 text-white' : 'bg-white text-stone-600')}
              >
                {item === 'all' ? t('allTypes') : kindLabel[item]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'approved', 'rejected', 'cancelled'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStatus(item)}
                className={cn('rounded-full px-3 py-1.5 text-xs font-semibold', status === item ? 'bg-amber-700 text-white' : 'bg-amber-50 text-amber-950')}
              >
                {item === 'all' ? t('allStatuses') : t(item === 'approved' ? 'statusApproved' : item === 'rejected' ? 'statusRejected' : 'statusCancelled')}
              </button>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {listed.map((row) => {
              const open = openId === row.id
              const lead = row.lines[0]
              return (
                <article
                  key={row.id}
                  className={cn(
                    'glass-panel overflow-hidden rounded-[1.6rem] transition duration-200 hover:-translate-y-0.5 hover:shadow-lg',
                    open && 'ring-1 ring-amber-300',
                  )}
                >
                  <button type="button" className="flex w-full items-start gap-3 p-3 text-left sm:p-4" onClick={() => setOpenId(open ? null : row.id)}>
                    {row.kind === 'expense' ? (
                      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-rose-100 text-rose-800"><Wallet className="h-6 w-6" /></span>
                    ) : row.kind === 'activity' ? (
                      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-teal-100 text-teal-900"><Receipt className="h-6 w-6" /></span>
                    ) : (
                      <PhotoStack lines={row.lines} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink">{row.code}</span>
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-stone-600">{kindLabel[row.kind]}</span>
                        <StatusBadge status={row.status} />
                      </span>
                      {lead ? (
                        <span className="mt-1 block truncate text-sm font-medium text-ink">
                          {lead.name}
                          {row.lines.length > 1 ? ` · +${row.lines.length - 1}` : ''}
                        </span>
                      ) : (
                        <span className="mt-1 block truncate text-sm text-stone-600">{row.detail}</span>
                      )}
                      <span className="mt-1 block text-xs text-stone-500">{formatDateTime(row.at)} · {money(row.amount)}</span>
                    </span>
                    <ChevronDown className={cn('mt-1 h-5 w-5 shrink-0 text-stone-400 transition', open && 'rotate-180')} />
                  </button>
                  <div className={cn('grid transition-all duration-300', open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
                    <div className="overflow-hidden">
                      <div className="space-y-3 border-t border-white/70 px-3 pb-3 pt-3 sm:px-4">
                        <StaffCell id={row.employeeId} />
                        <p className="text-sm text-stone-600">{row.detail}</p>
                        {row.lines.length > 0 && (
                          <ul className="space-y-2">
                            {row.lines.map((line) => (
                              <li key={line.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/70 px-3 py-2">
                                <ProductName name={line.name} src={line.imageUrl} className="min-w-0 font-medium" />
                                <span className="shrink-0 text-sm font-semibold tabular-nums">{line.qty}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        <Button size="sm" variant="secondary" onClick={() => setInspect(row)}>{t('remainOpenReport')}</Button>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
          {!listed.length && <Panel><p className="text-sm text-stone-500">{t('historyEmpty')}</p></Panel>}
        </div>
      )}

      <Modal open={Boolean(inspect)} title={inspect?.code ?? t('approvalHistory')} onClose={() => setInspect(null)} wide>
        {inspectStock && <StockInDetail record={inspectStock} mode="view" />}
        {inspectSale && <SaleDetail record={inspectSale} mode="view" />}
        {inspectActivity && <ActivityDetail record={inspectActivity} mode="view" />}
        {inspectExpense && <ExpenseDetail record={inspectExpense} mode="view" />}
      </Modal>
    </div>
  )
}
