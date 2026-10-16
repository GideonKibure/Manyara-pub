import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { SelectInput } from '@/components/ui/Fields'
import { PageHeader, Panel, StatusBadge } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { ActivityDetail, ExpenseDetail, SaleDetail, StockInDetail } from '@/features/transactions/Details'
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
  const [open, setOpen] = useState<{ kind: Exclude<Kind, 'all'>; id: string } | null>(null)
  const mine = app.user?.id
  const rows = [
    ...app.stockIns.filter((item) => item.submittedBy === mine).map((item) => ({ kind: 'stock' as const, id: item.id, code: item.code, status: item.status, at: item.submittedAt, label: `${item.supplierName} · ${app.money(stockInTotal(item.items))}` })),
    ...app.sales.filter((item) => item.submittedBy === mine).map((item) => ({ kind: 'sale' as const, id: item.id, code: item.code, status: item.status, at: item.submittedAt, label: app.money(saleTotal(item.items)) })),
    ...app.activities.filter((item) => item.submittedBy === mine).map((item) => ({ kind: 'activity' as const, id: item.id, code: item.code, status: item.status, at: item.submittedAt, label: app.money(item.amount) })),
    ...app.expenses.filter((item) => item.submittedBy === mine).map((item) => ({ kind: 'expense' as const, id: item.id, code: item.code, status: item.status, at: item.submittedAt, label: `${item.description} · ${app.money(item.amount)}` })),
  ]
    .filter((row) => (kind === 'all' || row.kind === kind) && (status === 'all' || row.status === status))
    .sort((a, b) => b.at.localeCompare(a.at))

  const stock = open?.kind === 'stock' ? app.stockIns.find((item) => item.id === open.id) : undefined
  const sale = open?.kind === 'sale' ? app.sales.find((item) => item.id === open.id) : undefined
  const activity = open?.kind === 'activity' ? app.activities.find((item) => item.id === open.id) : undefined
  const expense = open?.kind === 'expense' ? app.expenses.find((item) => item.id === open.id) : undefined

  return (
    <div>
      <PageHeader title={t('pageSubmissions')} description={t('pageSubmissionsBody')} />
      <div className="mb-4 grid gap-3 md:grid-cols-2">
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
                <p className="font-semibold">{row.code} · {row.kind === 'stock' ? 'Stock in' : row.kind === 'sale' ? 'Sale' : row.kind === 'expense' ? 'Expense' : 'Activity'}</p>
                <p className="text-sm text-stone-500">{row.label} · {formatDateTime(row.at)}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={row.status} />
                <Button size="sm" variant="secondary" onClick={() => setOpen({ kind: row.kind, id: row.id })}>View</Button>
              </div>
            </div>
          </Panel>
        ))}
        {!rows.length && <Panel><p className="text-sm text-stone-500">No submissions match these filters.</p></Panel>}
      </div>
      <Modal open={Boolean(open)} title="Submission" onClose={() => setOpen(null)} wide>
        {stock && <StockInDetail record={stock} mode="own" />}
        {sale && <SaleDetail record={sale} mode="own" />}
        {activity && <ActivityDetail record={activity} mode="own" />}
        {expense && <ExpenseDetail record={expense} mode="own" />}
      </Modal>
    </div>
  )
}
