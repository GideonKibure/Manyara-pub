import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { PageHeader, Panel, StatusBadge } from '@/components/ui/Feedback'
import { PersonName } from '@/components/ProductPicker'
import { pendingForAdmin } from '@/features/sales/holds'
import { ActivityDetail, ExpenseDetail, SaleDetail, StockInDetail } from '@/features/transactions/Details'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { ApprovalStatus } from '@/types'
import { formatDateTime } from '@/utils/dates'
import { saleTotal } from '@/utils/labels'

const tabs = ['Stock in', 'Sales', 'Activities', 'Expenses'] as const

export function ApprovalsPage() {
  const { stockIns, sales, activities, expenses, profiles, nameOf, money, activityTypes } = useApp()
  const { t } = useI18n()
  const [tab, setTab] = useState<(typeof tabs)[number]>('Stock in')
  const pendingStock = stockIns.filter((item) => item.status === 'pending')
  const pendingSales = sales.filter((item) => pendingForAdmin(item))
  const pendingActivities = activities.filter((item) => item.status === 'pending')
  const pendingExpenses = expenses.filter((item) => item.status === 'pending')
  const counts = [pendingStock.length, pendingSales.length, pendingActivities.length, pendingExpenses.length]
  const history = useMemo(() => {
    const rows: Array<{ id: string; at: string; kind: string; code: string; detail: string; employeeId: string; employee: string; reviewed: string; status: ApprovalStatus }> = [
      ...stockIns.filter((item) => item.status !== 'pending').map((item) => ({
        id: `stock-${item.id}`,
        at: item.reviewedAt ?? item.submittedAt,
        kind: 'Stock',
        code: item.code,
        detail: `${item.supplierName} · ${item.invoiceRef}${item.status === 'cancelled' && item.rejectionReason ? ` · ${item.rejectionReason}` : ''}`,
        employeeId: item.submittedBy,
        employee: nameOf(item.submittedBy),
        reviewed: item.reviewedAt ? `${nameOf(item.reviewedBy)} · ${formatDateTime(item.reviewedAt)}` : formatDateTime(item.submittedAt),
        status: item.status,
      })),
      ...sales.filter((item) => item.status !== 'pending').map((item) => ({
        id: `sale-${item.id}`,
        at: item.reviewedAt ?? item.submittedAt,
        kind: 'Sale',
        code: item.code,
        detail: `${item.recordKind === 'bill' ? `${item.customerName || 'Customer'} · ` : ''}${money(saleTotal(item.items))} · ${item.paymentStatus}${item.status === 'cancelled' && item.rejectionReason ? ` · ${item.rejectionReason}` : ''}`,
        employeeId: item.submittedBy,
        employee: nameOf(item.submittedBy),
        reviewed: item.reviewedAt ? `${nameOf(item.reviewedBy)} · ${formatDateTime(item.reviewedAt)}` : formatDateTime(item.submittedAt),
        status: item.status,
      })),
      ...activities.filter((item) => item.status !== 'pending').map((item) => ({
        id: `activity-${item.id}`,
        at: item.reviewedAt ?? item.occurredAt,
        kind: 'Activity',
        code: item.code,
        detail: `${activityTypes.find((type) => type.id === item.activityTypeId)?.name ?? 'Income'} · ${money(item.amount)}${item.status === 'cancelled' && item.rejectionReason ? ` · ${item.rejectionReason}` : ''}`,
        employeeId: item.submittedBy,
        employee: nameOf(item.submittedBy),
        reviewed: item.reviewedAt ? `${nameOf(item.reviewedBy)} · ${formatDateTime(item.reviewedAt)}` : formatDateTime(item.occurredAt),
        status: item.status,
      })),
      ...expenses.filter((item) => item.status !== 'pending').map((item) => ({
        id: `expense-${item.id}`,
        at: item.reviewedAt ?? item.submittedAt,
        kind: 'Expense',
        code: item.code,
        detail: `${item.description} · ${money(item.amount)}${item.status === 'cancelled' && item.rejectionReason ? ` · ${item.rejectionReason}` : ''}`,
        employeeId: item.submittedBy,
        employee: nameOf(item.submittedBy),
        reviewed: item.reviewedAt ? `${nameOf(item.reviewedBy)} · ${formatDateTime(item.reviewedAt)}` : formatDateTime(item.submittedAt),
        status: item.status,
      })),
    ]
    return rows.sort((a, b) => b.at.localeCompare(a.at))
  }, [stockIns, sales, activities, expenses, nameOf, money, activityTypes])

  return (
    <div>
      <PageHeader title={t('pageApprovals')} description={t('pageApprovalsBody')} />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((item, index) => (
          <Button key={item} variant={tab === item ? 'primary' : 'secondary'} onClick={() => setTab(item)}>
            {{ 'Stock in': t('navStockIn'), Sales: t('navSales'), Activities: t('navActivities'), Expenses: t('navExpenses') }[item]} ({counts[index]})
          </Button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {tab === 'Stock in' && pendingStock.map((record) => <Panel key={record.id}><StockInDetail record={record} mode="review" /></Panel>)}
        {tab === 'Sales' && pendingSales.map((record) => <Panel key={record.id}><SaleDetail record={record} mode="review" /></Panel>)}
        {tab === 'Activities' && pendingActivities.map((record) => <Panel key={record.id}><ActivityDetail record={record} mode="review" /></Panel>)}
        {tab === 'Expenses' && pendingExpenses.map((record) => <Panel key={record.id}><ExpenseDetail record={record} mode="review" /></Panel>)}
      </div>
      {((tab === 'Stock in' && !pendingStock.length) || (tab === 'Sales' && !pendingSales.length) || (tab === 'Activities' && !pendingActivities.length) || (tab === 'Expenses' && !pendingExpenses.length)) && (
        <Panel><p className="text-sm text-stone-500">Nothing is waiting in this queue.</p></Panel>
      )}
      <h2 className="mb-3 mt-8 text-lg font-semibold">Approval history</h2>
      <p className="mb-3 text-sm text-stone-500">Every approved, rejected, and cancelled record stays here, including the note written when an employee cancels.</p>
      <DataTable
        rows={history}
        getRowId={(row) => row.id}
        emptyTitle="No approval history yet"
        columns={[
          { key: 'when', header: 'Date and time', sortValue: (row) => row.at, render: (row) => formatDateTime(row.at) },
          { key: 'kind', header: 'Type', render: (row) => row.kind },
          { key: 'code', header: 'Code', render: (row) => row.code },
          { key: 'detail', header: 'Details', render: (row) => row.detail },
          { key: 'employee', header: 'Employee', className: 'hidden md:table-cell', render: (row) => <PersonName name={row.employee} src={profiles.find((item) => item.id === row.employeeId)?.imageUrl} /> },
          { key: 'reviewed', header: 'Reviewed', className: 'hidden lg:table-cell', render: (row) => row.reviewed },
          { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
        ]}
      />
    </div>
  )
}
