import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { SelectInput, TextInput } from '@/components/ui/Fields'
import { PageHeader, StatusBadge } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { ExpenseDetail } from '@/features/transactions/Details'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { ExpenseTransaction } from '@/types'
import { formatDate } from '@/utils/dates'

export function ExpensesPage() {
  const app = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState<ExpenseTransaction | null>(null)
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return app.expenses.filter((item) => {
      const matchesStatus = status === 'all' || item.status === status
      const matchesQuery = !needle || `${item.code} ${item.description} ${app.nameOf(item.submittedBy)}`.toLowerCase().includes(needle)
      return matchesStatus && matchesQuery
    })
  }, [app, query, status])

  return (
    <div>
      <PageHeader
        title={t('pageExpenses')}
        description={t('pageExpensesBody')}
        actions={<Button variant="gold" onClick={() => navigate('/admin/expenses/new')}>{t('pageAddExpense')}</Button>}
      />
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('expenseWhat')} aria-label={t('expenseWhat')} />
        <SelectInput value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status">
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </SelectInput>
      </div>
      <DataTable
        rows={rows}
        getRowId={(row) => row.id}
        resetKey={`${query}|${status}`}
        emptyTitle={t('pageExpensesEmpty')}
        columns={[
          { key: 'code', header: 'Code', render: (row) => row.code },
          { key: 'what', header: t('expenseWhat'), render: (row) => row.description },
          { key: 'amount', header: t('expenseAmount'), sortValue: (row) => row.amount, render: (row) => app.money(row.amount) },
          { key: 'when', header: t('expenseDate'), sortValue: (row) => row.spentOn, render: (row) => formatDate(row.spentOn) },
          { key: 'employee', header: 'Employee', className: 'hidden md:table-cell', render: (row) => app.nameOf(row.submittedBy) },
          { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
          { key: 'open', header: '', render: (row) => <Button size="sm" variant="secondary" onClick={() => setSelected(row)}>View</Button> },
        ]}
      />
      <Modal open={Boolean(selected)} title={selected?.code ?? t('pageExpenses')} onClose={() => setSelected(null)} wide>
        {selected && <ExpenseDetail record={app.expenses.find((item) => item.id === selected.id) ?? selected} mode="review" />}
      </Modal>
    </div>
  )
}
