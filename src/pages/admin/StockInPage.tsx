import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { Field, SelectInput, TextInput } from '@/components/ui/Fields'
import { PageHeader, Panel, StatusBadge } from '@/components/ui/Feedback'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { StockInDetail } from '@/features/transactions/Details'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { StockInTransaction } from '@/types'
import { formatDate } from '@/utils/dates'
import { stockInTotal, stockInUnits } from '@/utils/labels'

export function StockInPage() {
  const app = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState<StockInTransaction | null>(null)
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [supplierName, setSupplierName] = useState('')
  const [supplierPhone, setSupplierPhone] = useState('')
  const [removing, setRemoving] = useState('')
  const [removingBusy, setRemovingBusy] = useState(false)
  const supplierToRemove = app.suppliers.find((supplier) => supplier.id === removing)
  const rows = useMemo(
    () =>
      app.stockIns.filter((item) => {
        const haystack = `${item.code} ${item.supplierName} ${item.invoiceRef}`.toLowerCase()
        return haystack.includes(query.trim().toLowerCase()) && (status === 'all' || item.status === status)
      }),
    [app.stockIns, query, status],
  )

  return (
    <div>
      <PageHeader
        title={t('pageStockReceived')}
        description={t('pageStockReceivedBody')}
        actions={
          <span className="flex gap-2">
            <Button variant="secondary" onClick={() => setSupplierOpen(true)}>{t('pageAddSupplier')}</Button>
            <Button variant="gold" onClick={() => navigate('/admin/stock-in/new')}>Add stock</Button>
          </span>
        }
      />
      <Panel className="mb-4">
        <h2 className="font-semibold">{t('suppliersTitle')}</h2>
        <p className="mt-1 text-sm text-stone-500">{t('suppliersBody')}</p>
        <ul className="mt-3 divide-y divide-line">
          {app.suppliers.map((supplier) => (
            <li key={supplier.id} className="flex items-center justify-between gap-3 py-3">
              <span>
                <span className="block font-medium">{supplier.name}</span>
                <span className="block text-sm text-stone-500">{supplier.phone || '—'}</span>
              </span>
              <Button size="sm" variant="danger" onClick={() => setRemoving(supplier.id)}>{t('suppliersRemove')}</Button>
            </li>
          ))}
          {!app.suppliers.length && <li className="py-3 text-sm text-stone-500">{t('suppliersEmpty')}</li>}
        </ul>
      </Panel>
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search code, supplier, or invoice" aria-label="Search deliveries" />
        <SelectInput value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
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
        emptyTitle="No deliveries"
        columns={[
          { key: 'code', header: 'Code', render: (row) => row.code },
          { key: 'supplier', header: 'Supplier', render: (row) => row.supplierName },
          { key: 'date', header: 'Delivery', sortValue: (row) => row.deliveryDate, render: (row) => formatDate(row.deliveryDate) },
          { key: 'units', header: 'Units', render: (row) => stockInUnits(row.items) },
          { key: 'cost', header: 'Cost', className: 'hidden md:table-cell', render: (row) => app.money(stockInTotal(row.items)) },
          { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
          {
            key: 'open',
            header: '',
            render: (row) => (
              <span className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setSelected(row)}>View</Button>
                {(row.status === 'pending' || row.status === 'approved') && <Button size="sm" variant="secondary" onClick={() => navigate(`/admin/stock-in/edit?edit=${row.id}`)}>Edit</Button>}
              </span>
            ),
          },
        ]}
      />
      <Modal open={Boolean(selected)} title="Delivery details" onClose={() => setSelected(null)} wide>
        {selected && <StockInDetail record={app.stockIns.find((item) => item.id === selected.id) ?? selected} mode="review" />}
      </Modal>
      <Modal open={supplierOpen} title="Add supplier" onClose={() => setSupplierOpen(false)}>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault()
            const result = await app.addSupplier({ name: supplierName, phone: supplierPhone })
            if (result.ok) {
              setSupplierName('')
              setSupplierPhone('')
              setSupplierOpen(false)
            }
          }}
        >
          <Field label="Name"><TextInput value={supplierName} onChange={(event) => setSupplierName(event.target.value)} required /></Field>
          <Field label="Phone"><TextInput value={supplierPhone} onChange={(event) => setSupplierPhone(event.target.value)} /></Field>
          <Button type="submit" variant="gold">Save supplier</Button>
        </form>
      </Modal>
      <ConfirmDialog
        open={Boolean(supplierToRemove)}
        title={t('suppliersRemoveTitle')}
        body={supplierToRemove ? `${supplierToRemove.name}. ${t('suppliersRemoveBody')}` : ''}
        confirmLabel={t('suppliersRemove')}
        cancelLabel={t('suppliersCancel')}
        tone="danger"
        loading={removingBusy}
        onClose={() => setRemoving('')}
        onConfirm={async () => {
          if (!supplierToRemove) return
          setRemovingBusy(true)
          const result = await app.removeSupplier(supplierToRemove.id)
          setRemovingBusy(false)
          if (result.ok) setRemoving('')
        }}
      />
    </div>
  )
}
