import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { SelectInput, TextInput } from '@/components/ui/Fields'
import { PageHeader, Panel, StatusBadge } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { ActivityDetail, ExpenseDetail, SaleDetail, StockInDetail } from '@/features/transactions/Details'
import { stockInProductNames, stockInMatchesQuery } from '@/features/stockIn/stockInSearch'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import { formatDateTime } from '@/utils/dates'
import { saleTotal, stockInTotal } from '@/utils/labels'

type Kind = 'all' | 'stock' | 'sale' | 'activity' | 'expense'

export function SubmissionsPage() {
  const app = useApp()
  const { t } = useI18n()
  const [kind, setKind] = useState<Kind>('all')
  const [status, setStatus] = useState('all')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<{ kind: Exclude<Kind, 'all'>; id: string } | null>(null)
  const mine = app.user?.id
  const needle = query.trim().toLowerCase()
  const rows = useMemo(() => {
    const stock = app.stockIns.filter((item) => item.submittedBy === mine).map((item) => {
      const names = stockInProductNames(item, app.products)
      return {
        kind: 'stock' as const,
        id: item.id,
        code: item.code,
        status: item.status,
        at: item.submittedAt,
        label: `${names.join(', ') || item.supplierName} · ${app.money(stockInTotal(item.items))}`,
        match: stockInMatchesQuery(item, app.products, query),
      }
    })
    const sales = app.sales.filter((item) => item.submittedBy === mine).map((item) => {
      const names = item.items.map((line) => app.products.find((product) => product.id === line.productId)?.name ?? '').filter(Boolean)
      const hay = `${item.code} ${names.join(' ')}`.toLowerCase()
      return {
        kind: 'sale' as const,
        id: item.id,
        code: item.code,
        status: item.status,
        at: item.submittedAt,
        label: `${names.slice(0, 3).join(', ') || app.money(saleTotal(item.items))} · ${app.money(saleTotal(item.items))}`,
        match: !needle || hay.includes(needle),
      }
    })
    const activities = app.activities.filter((item) => item.submittedBy === mine).map((item) => ({
      kind: 'activity' as const,
      id: item.id,
      code: item.code,
      status: item.status,
      at: item.submittedAt,
      label: app.money(item.amount),
      match: !needle || `${item.code} ${item.notes ?? ''}`.toLowerCase().includes(needle),
    }))
    const expenses = app.expenses.filter((item) => item.submittedBy === mine).map((item) => ({
      kind: 'expense' as const,
      id: item.id,
      code: item.code,
      status: item.status,
      at: item.submittedAt,
      label: `${item.description} · ${app.money(item.amount)}`,
      match: !needle || `${item.code} ${item.description} ${item.notes ?? ''}`.toLowerCase().includes(needle),
    }))
    return [...stock, ...sales, ...activities, ...expenses]
      .filter((row) => (kind === 'all' || row.kind === kind) && (status === 'all' || row.status === status) && row.match)
      .sort((a, b) => b.at.localeCompare(a.at))
  }, [app.activities, app.expenses, app.money, app.products, app.sales, app.stockIns, kind, mine, needle, query, status])

  const stock = open?.kind === 'stock' ? app.stockIns.find((item) => item.id === open.id) : undefined
  const sale = open?.kind === 'sale' ? app.sales.find((item) => item.id === open.id) : undefined
  const activity = open?.kind === 'activity' ? app.activities.find((item) => item.id === open.id) : undefined
  const expense = open?.kind === 'expense' ? app.expenses.find((item) => item.id === open.id) : undefined

  return (
    <div>
      <PageHeader title={t('pageSubmissions')} description={t('pageSubmissionsBody')} />
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('searchSubmissions')} aria-label={t('searchSubmissions')} />
        <SelectInput value={kind} onChange={(event) => setKind(event.target.value as Kind)} aria-label={t('submissionType')}>
          <option value="all">{t('allTypes')}</option>
          <option value="stock">{t('navStockIn')}</option>
          <option value="sale">{t('navSales')}</option>
          <option value="activity">{t('navActivities')}</option>
          <option value="expense">{t('navExpenses')}</option>
        </SelectInput>
        <SelectInput value={status} onChange={(event) => setStatus(event.target.value)} aria-label={t('submissionStatus')}>
          <option value="all">{t('allStatuses')}</option>
          <option value="pending">{t('statusPending')}</option>
          <option value="approved">{t('statusApproved')}</option>
          <option value="rejected">{t('statusRejected')}</option>
          <option value="cancelled">{t('statusCancelled')}</option>
        </SelectInput>
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <Panel key={`${row.kind}-${row.id}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{row.code} · {row.kind === 'stock' ? t('navStockIn') : row.kind === 'sale' ? t('navSales') : row.kind === 'expense' ? t('navExpenses') : t('navActivities')}</p>
                <p className="text-sm text-stone-500">{row.label} · {formatDateTime(row.at)}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={row.status} />
                <Button size="sm" variant="secondary" onClick={() => setOpen({ kind: row.kind, id: row.id })}>{t('view')}</Button>
              </div>
            </div>
          </Panel>
        ))}
        {!rows.length && <Panel><p className="text-sm text-stone-500">{t('emptyDeliveries')}</p></Panel>}
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
