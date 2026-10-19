import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApproveAllButton } from '@/components/ui/ApproveAll'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { Field, SelectInput, TextInput } from '@/components/ui/Fields'
import { PageHeader, Panel, StatusBadge } from '@/components/ui/Feedback'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { ProductThumb, StaffCell } from '@/components/ProductPicker'
import { AdminDeleteButton } from '@/components/ui/AdminDelete'
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
  const [approving, setApproving] = useState(false)
  const pendingCount = app.stockIns.filter((item) => item.status === 'pending').length
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
          <span className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => setSupplierOpen(true)}>{t('pageAddSupplier')}</Button>
            <Button variant="gold" className="flex-1 sm:flex-none" onClick={() => navigate('/admin/stock-in/new')}>Add stock</Button>
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
      <ApproveAllButton
        count={pendingCount}
        loading={approving}
        label={t('approveAllStockIn')}
        onClick={async () => {
          setApproving(true)
          await app.approveAllPending('stock_in')
          setApproving(false)
        }}
      />
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('searchDeliveries')} aria-label={t('searchDeliveries')} />
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
        emptyTitle={t('emptyDeliveries')}
        columns={[
          { key: 'code', header: t('codeCol'), render: (row) => row.code },
          {
            key: 'photos',
            header: t('navProducts'),
            render: (row) => (
              <span className="flex -space-x-2">
                {row.items.slice(0, 4).map((item) => {
                  const product = app.products.find((entry) => entry.id === item.productId)
                  return <ProductThumb key={item.id} src={product?.imageUrl} name={product?.name ?? item.productId} className="h-9 w-9 ring-2 ring-white" />
                })}
                {row.items.length > 4 && <span className="grid h-9 w-9 place-items-center rounded-lg bg-stone-800 text-xs font-semibold text-white">+{row.items.length - 4}</span>}
              </span>
            ),
          },
          { key: 'supplier', header: t('supplierCol'), render: (row) => row.supplierName },
          { key: 'employee', header: t('navEmployees'), className: 'hidden md:table-cell', render: (row) => <StaffCell id={row.submittedBy} /> },
          { key: 'date', header: t('deliveryCol'), sortValue: (row) => row.deliveryDate, render: (row) => formatDate(row.deliveryDate) },
          { key: 'units', header: t('reportColUnits'), render: (row) => stockInUnits(row.items) },
          { key: 'cost', header: t('pdfCost'), className: 'hidden md:table-cell', render: (row) => app.money(stockInTotal(row.items)) },
          { key: 'status', header: t('labelStatus'), render: (row) => <StatusBadge status={row.status} /> },
          {
            key: 'open',
            header: '',
            render: (row) => (
              <span className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={() => setSelected(row)}>{t('view')}</Button>
                {(row.status === 'pending' || row.status === 'approved') && <Button size="sm" variant="secondary" onClick={() => navigate(`/admin/stock-in/edit?edit=${row.id}`)}>{t('edit')}</Button>}
                <AdminDeleteButton kind="stock_in" id={row.id} label={row.code} />
              </span>
            ),
          },
        ]}
      />
      <Modal open={Boolean(selected)} title={t('deliveryDetails')} onClose={() => setSelected(null)} wide>
        {selected && <StockInDetail record={app.stockIns.find((item) => item.id === selected.id) ?? selected} mode="review" />}
      </Modal>
      <Modal open={supplierOpen} title={t('pageAddSupplier')} onClose={() => setSupplierOpen(false)}>
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
          <Field label={t('fieldName')}><TextInput value={supplierName} onChange={(event) => setSupplierName(event.target.value)} required /></Field>
          <Field label={t('phone')}><TextInput value={supplierPhone} onChange={(event) => setSupplierPhone(event.target.value)} /></Field>
          <Button type="submit" variant="gold">{t('saveSupplier')}</Button>
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
