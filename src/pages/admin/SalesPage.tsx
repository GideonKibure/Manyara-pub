import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApproveAllButton } from '@/components/ui/ApproveAll'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { SelectInput, TextInput } from '@/components/ui/Fields'
import { PageHeader, StatusBadge } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { StaffCell } from '@/components/ProductPicker'
import { AdminDeleteButton } from '@/components/ui/AdminDelete'
import { SaleDetail } from '@/features/transactions/Details'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { RecordKind, SalesTransaction } from '@/types'
import { formatDateTime } from '@/utils/dates'
import { billBalance, recordedTotal } from '@/utils/labels'

export function SalesPage({ kind = 'sale' }: { kind?: RecordKind }) {
  const app = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState<SalesTransaction | null>(null)
  const [approving, setApproving] = useState(false)
  const pendingCount = app.sales.filter((sale) => sale.status === 'pending' && (sale.recordKind ?? 'sale') === kind).length
  const rows = useMemo(
    () => app.sales.filter((sale) => (sale.recordKind ?? 'sale') === kind && `${sale.code} ${sale.customerName} ${app.nameOf(sale.submittedBy)}`.toLowerCase().includes(query.trim().toLowerCase()) && (status === 'all' || sale.status === status)),
    [app, query, status, kind],
  )
  return (
    <div>
      <PageHeader title={kind === 'bill' ? t('pageBills') : t('pageSales')} description={kind === 'bill' ? t('pageBillsBody') : t('pageSalesBody')} actions={<Button variant="gold" onClick={() => navigate(kind === 'bill' ? '/admin/bills/new' : '/admin/sales/new')}>{kind === 'bill' ? t('pageAddBill') : t('pageAddSale')}</Button>} />
      <ApproveAllButton
        count={pendingCount}
        loading={approving}
        label={kind === 'bill' ? t('approveAllCredits') : t('approveAllSales')}
        onClick={async () => {
          setApproving(true)
          await app.approveAllPending(kind === 'bill' ? 'bill' : 'sale')
          setApproving(false)
        }}
      />
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder={kind === 'bill' ? t('searchBills') : t('searchSales')} aria-label={kind === 'bill' ? t('searchBills') : t('searchSales')} />
        <SelectInput value={status} onChange={(event) => setStatus(event.target.value)} aria-label={t('filterStatus')}>
          <option value="all">{t('allStatuses')}</option>
          <option value="pending">{t('statusPending')}</option>
          <option value="approved">{t('statusApproved')}</option>
          <option value="rejected">{t('statusRejected')}</option>
          <option value="cancelled">{t('statusCancelled')}</option>
        </SelectInput>
      </div>
      <DataTable
        rows={rows}
        getRowId={(row) => row.id}
        resetKey={`${query}|${status}`}
        emptyTitle={kind === 'bill' ? t('pageBillsEmpty') : t('pageSalesEmpty')}
        columns={[
          { key: 'code', header: 'Code', render: (row) => row.code },
          ...(kind === 'bill' ? [{ key: 'customer', header: 'Customer', render: (row: SalesTransaction) => row.customerName || '—' }] : []),
          { key: 'payment', header: 'Payment', render: (row) => (row.isLoss ? 'Loss' : row.paymentStatus === 'paid' ? 'Paid' : 'Unpaid') },
          { key: 'employee', header: 'Employee', className: 'hidden md:table-cell', render: (row) => <StaffCell id={row.submittedBy} /> },
          { key: 'when', header: 'Generated', sortValue: (row) => row.generatedAt, render: (row) => formatDateTime(row.generatedAt) },
          { key: 'total', header: 'Total', sortValue: (row) => (row.recordKind === 'bill' ? billBalance(row) : recordedTotal(row)), render: (row) => app.money(row.recordKind === 'bill' ? billBalance(row) : recordedTotal(row)) },
          { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
          {
            key: 'open',
            header: '',
            render: (row) => (
              <span className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={() => setSelected(row)}>View</Button>
                {(row.status === 'pending' || row.status === 'approved') && <Button size="sm" variant="secondary" onClick={() => navigate(`${kind === 'bill' ? '/admin/bills/edit' : '/admin/sales/edit'}?edit=${row.id}`)}>Edit</Button>}
                <AdminDeleteButton kind="sale" id={row.id} label={row.code} />
              </span>
            ),
          },
        ]}
      />
      <Modal open={Boolean(selected)} title={kind === 'bill' ? t('pageBillDetails') : t('pageSaleDetails')} onClose={() => setSelected(null)}>
        {selected && <SaleDetail record={app.sales.find((item) => item.id === selected.id) ?? selected} mode="review" />}
      </Modal>
    </div>
  )
}
