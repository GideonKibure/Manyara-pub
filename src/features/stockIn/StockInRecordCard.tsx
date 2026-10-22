import { useNavigate } from 'react-router-dom'
import { ProductThumb, StaffCell } from '@/components/ProductPicker'
import { AdminDeleteButton } from '@/components/ui/AdminDelete'
import { Button } from '@/components/ui/Button'
import { Panel, StatusBadge } from '@/components/ui/Feedback'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { StockInTransaction } from '@/types'
import { formatDate } from '@/utils/dates'
import { stockInTotal, stockInUnits } from '@/utils/labels'
import { stockInProductNames } from '@/features/stockIn/stockInSearch'

export function StockInRecordCard({
  record,
  onView,
  showDate = false,
  manage = false,
}: {
  record: StockInTransaction
  onView: (record: StockInTransaction) => void
  showDate?: boolean
  manage?: boolean
}) {
  const app = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const names = stockInProductNames(record, app.products)
  const canEdit = manage && (record.status === 'pending' || record.status === 'approved')
  const shown = record.items.slice(0, 4)

  return (
    <Panel className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{record.code}</p>
          <p className="text-sm text-stone-500">
            {record.supplierName}
            {showDate ? ` · ${formatDate(record.deliveryDate)}` : ''}
            {record.invoiceRef ? ` · ${record.invoiceRef}` : ''}
          </p>
        </div>
        <StatusBadge status={record.status} />
      </div>
      <div className="flex items-start gap-3">
        <span className="flex shrink-0">
          {shown.map((item, index) => {
            const product = app.products.find((entry) => entry.id === item.productId)
            return (
              <ProductThumb
                key={item.id}
                src={product?.imageUrl}
                name={product?.name ?? item.productId}
                className={`h-11 w-11 rounded-xl ring-2 ring-white ${index ? '-ml-2' : ''}`}
              />
            )
          })}
          {record.items.length > 4 && (
            <span className="-ml-2 grid h-11 w-11 place-items-center rounded-xl bg-stone-900 text-xs font-semibold text-white ring-2 ring-white">
              +{record.items.length - 4}
            </span>
          )}
        </span>
        <p className="min-w-0 text-sm font-medium leading-6 text-ink">{names.join(', ') || t('navProducts')}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-stone-600">
        <StaffCell id={record.submittedBy} />
        <p className="tabular-nums">{stockInUnits(record.items)} · {app.money(stockInTotal(record.items))}</p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={() => onView(record)}>{t('view')}</Button>
        {canEdit && (
          <Button size="sm" variant="secondary" onClick={() => navigate(`/admin/stock-in/edit?edit=${record.id}`)}>{t('edit')}</Button>
        )}
        {manage && <AdminDeleteButton kind="stock_in" id={record.id} label={`${record.code} · ${names.join(', ') || record.supplierName}`} />}
      </div>
    </Panel>
  )
}
