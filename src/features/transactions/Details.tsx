import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PersonName, ProductName } from '@/components/ProductPicker'
import { Button } from '@/components/ui/Button'
import { Field, TextArea } from '@/components/ui/Fields'
import { StatusBadge } from '@/components/ui/Feedback'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { ActivityTransaction, ExpenseTransaction, SalesTransaction, StockInTransaction } from '@/types'
import { formatDate, formatDateTime } from '@/utils/dates'
import { paymentLabel, saleTotal, stockInTotal, stockInUnits } from '@/utils/labels'

function Reason({ status, reason }: { status: string; reason?: string }) {
  const { t } = useI18n()
  if (!reason) return null
  const cancelled = status === 'cancelled'
  return (
    <p className={cancelled ? 'rounded-xl bg-stone-100 px-3 py-2 text-sm text-ink' : 'rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-900'}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">{cancelled ? t('cancelWhy') : t('rejectWhy')}</span>
      {reason}
    </p>
  )
}

function Staff({ id }: { id?: string }) {
  const app = useApp()
  const profile = app.profiles.find((item) => item.id === id)
  return <PersonName name={app.nameOf(id)} src={profile?.imageUrl} username={profile?.username} />
}

function Meta({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-stone-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink">{value || '—'}</dd>
    </div>
  )
}

export function StockInDetail({ record, mode = 'view' }: { record: StockInTransaction; mode?: 'view' | 'review' | 'own' }) {
  const app = useApp()
  const unit = (id: string) => app.units.find((item) => item.id === id)?.abbreviation ?? 'units'
  const lines = record.items.map((item) => {
    const product = app.products.find((entry) => entry.id === item.productId)
    return `${item.receivedQuantity} ${unit(item.receiveUnitId)} of ${product?.name ?? 'product'} (${item.stockQuantity} ${unit(product?.stockUnitId ?? '')})`
  })
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{record.code}</p>
          <p className="text-sm text-stone-500">{record.supplierName}</p>
        </div>
        <StatusBadge status={record.status} />
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <Meta label="Submitted by" value={<Staff id={record.submittedBy} />} />
        <Meta label="Submitted" value={formatDateTime(record.submittedAt)} />
        <Meta label="Delivery date" value={formatDate(record.deliveryDate)} />
        <Meta label="Invoice" value={record.invoiceRef || 'None'} />
        {record.status === 'approved' && (
          <Meta
            label="Approval"
            value={
              record.reviewedBy === record.submittedBy
                ? `Automatic, from invoice ${record.invoiceRef}`
                : `${app.nameOf(record.reviewedBy)} · ${record.reviewedAt ? formatDateTime(record.reviewedAt) : ''}`
            }
          />
        )}
        <Meta label="Stock units" value={String(stockInUnits(record.items))} />
        <Meta label="Total cost" value={app.money(stockInTotal(record.items))} />
      </dl>
      <ul className="space-y-2 text-sm">
        {record.items.map((item) => {
          const product = app.products.find((entry) => entry.id === item.productId)
          return (
            <li key={item.id} className="rounded-xl bg-stone-50 px-3 py-2">
              <ProductName name={`${product?.name ?? 'Product'}${item.sizeName && item.sizeName !== 'one' ? ` · ${item.sizeName}` : ''}`} src={product?.imageUrl} className="font-medium" />
              <span className="mt-1 block text-stone-600">
                {item.receivedQuantity} {unit(item.receiveUnitId)} × {item.conversionFactor} = {item.stockQuantity} {unit(product?.stockUnitId ?? '')}. Cost {app.money(item.totalCost)}.
              </span>
            </li>
          )
        })}
      </ul>
      {record.notes && <p className="text-sm text-stone-600">{record.notes}</p>}
      <Reason status={record.status} reason={record.rejectionReason} />
      <Decision
        mode={mode}
        status={record.status}
        impact={`Approving ${record.code} will add confirmed stock: ${lines.join('; ')}.`}
        correctTo={`/employee/stock-in?correct=${record.id}`}
        onApprove={() => app.acceptStockIn(record.id)}
        onReject={(reason) => app.declineStockIn(record.id, reason)}
        onWithdraw={(reason) => app.withdraw('stock_in', record.id, reason)}
      />
    </div>
  )
}

export function SaleDetail({ record, mode = 'view' }: { record: SalesTransaction; mode?: 'view' | 'review' | 'own' }) {
  const app = useApp()
  const [lossOpen, setLossOpen] = useState(false)
  const [lossLoading, setLossLoading] = useState(false)
  const lines = record.items.map((item) => {
    const product = app.products.find((entry) => entry.id === item.productId)
    const unit = app.units.find((entry) => entry.id === product?.stockUnitId)?.abbreviation ?? 'units'
    return `${item.quantity} ${unit} of ${product?.name ?? 'product'}`
  })
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">{record.code}</p>
        <StatusBadge status={record.status} />
      </div>
      <dl className="grid grid-cols-2 gap-3">
        {record.recordKind === 'bill' && <Meta label="Customer" value={record.customerName} />}
        <Meta label="Payment" value={record.isLoss ? 'Loss' : record.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'} />
        <Meta label="Generated" value={formatDateTime(record.generatedAt)} />
        <Meta label="Recorded by" value={<Staff id={record.submittedBy} />} />
        <Meta label="Sale total" value={app.money(saleTotal(record.items))} />
        <Meta label="Reviewed" value={record.reviewedAt ? `${app.nameOf(record.reviewedBy)} · ${formatDateTime(record.reviewedAt)}` : 'Not reviewed'} />
      </dl>
      <ul className="space-y-2 text-sm">
        {record.items.map((item) => {
          const product = app.products.find((entry) => entry.id === item.productId)
          return (
            <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2">
              <ProductName name={`${product?.name ?? 'Product'}${item.sizeName && item.sizeName !== 'one' ? ` · ${item.sizeName}` : ''}${item.portion && item.portion !== 'full' ? ` · ${item.portion}` : ''} × ${item.quantity}`} src={product?.imageUrl} />
              <span>{app.money(item.quantity * item.unitPrice)}</span>
            </li>
          )
        })}
      </ul>
      {record.notes && <p className="text-sm text-stone-600">{record.notes}</p>}
      <Reason status={record.status} reason={record.rejectionReason} />
      {record.recordKind === 'bill' && record.paymentStatus !== 'paid' && record.status !== 'cancelled' && record.status !== 'rejected' && (mode === 'own' || mode === 'view') && (
        <Button variant="gold" onClick={() => app.setBillPayment(record.id, 'paid')}>Mark as sold</Button>
      )}
      {mode === 'review' && record.status === 'pending' && record.recordKind === 'bill' && record.paymentStatus !== 'paid' && (
        <>
          <Button variant="danger" onClick={() => setLossOpen(true)}>Record as a loss</Button>
          <ConfirmDialog
            open={lossOpen}
            title="Record this bill as a loss"
            body={`${record.code} stays out of revenue. The stock already taken off when the bill was written is not returned.`}
            confirmLabel="Record as a loss"
            loading={lossLoading}
            onClose={() => setLossOpen(false)}
            onConfirm={async () => {
              setLossLoading(true)
              const result = await app.recordBillLoss(record.id)
              setLossLoading(false)
              if (result.ok) setLossOpen(false)
            }}
          />
        </>
      )}
      <Decision
        mode={mode}
        status={record.status}
        impact={
          record.recordKind === 'bill'
            ? `Approving ${record.code} records ${app.money(saleTotal(record.items))} as paid. The stock was already removed when the bill was written.`
            : `Approving ${record.code} will remove ${lines.join('; ')} from confirmed stock and record ${app.money(saleTotal(record.items))} of revenue. It is ${record.paymentStatus}.`
        }
        correctTo={`${record.recordKind === 'bill' ? '/employee/bills' : '/employee/sales'}?correct=${record.id}`}
        approveLabel={record.recordKind === 'bill' && record.paymentStatus !== 'paid' ? 'Approve as paid' : 'Approve'}
        onApprove={() => app.acceptSale(record.id)}
        onReject={(reason) => app.declineSale(record.id, reason)}
        onWithdraw={(reason) => app.withdraw('sale', record.id, reason)}
      />
    </div>
  )
}

export function ExpenseDetail({ record, mode = 'view' }: { record: ExpenseTransaction; mode?: 'view' | 'review' | 'own' }) {
  const app = useApp()
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{record.code}</p>
          <p className="text-sm text-stone-500">{record.description}</p>
        </div>
        <StatusBadge status={record.status} />
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <Meta label="Amount" value={app.money(record.amount)} />
        <Meta label="Date" value={formatDate(record.spentOn)} />
        <Meta label="Recorded by" value={<Staff id={record.submittedBy} />} />
        <Meta label="Reviewed" value={record.reviewedAt ? `${app.nameOf(record.reviewedBy)} · ${formatDateTime(record.reviewedAt)}` : 'Not reviewed'} />
      </dl>
      {record.notes && <p className="text-sm text-stone-600">{record.notes}</p>}
      <Reason status={record.status} reason={record.rejectionReason} />
      <Decision
        mode={mode}
        status={record.status}
        impact={`Approving ${record.code} will record ${app.money(record.amount)} as a business expense for ${record.description}. Stock will not change.`}
        correctTo={`/employee/expenses?correct=${record.id}`}
        onApprove={() => app.acceptExpense(record.id)}
        onReject={(reason) => app.declineExpense(record.id, reason)}
        onWithdraw={(reason) => app.withdraw('expense', record.id, reason)}
      />
    </div>
  )
}

export function ActivityDetail({ record, mode = 'view' }: { record: ActivityTransaction; mode?: 'view' | 'review' | 'own' }) {
  const app = useApp()
  const type = app.activityTypes.find((item) => item.id === record.activityTypeId)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{record.code}</p>
          <p className="text-sm text-stone-500">{type?.name}</p>
        </div>
        <StatusBadge status={record.status} />
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <Meta label="Collected" value={app.money(record.amount)} />
        <Meta label="Quantity" value={`${record.quantity} ${type?.unitLabel ?? ''}`} />
        <Meta label="Payment" value={paymentLabel(record.paymentMethod)} />
        <Meta label="When" value={formatDateTime(record.occurredAt)} />
        <Meta label="Employee" value={<Staff id={record.submittedBy} />} />
        <Meta label="Reviewed" value={record.reviewedAt ? app.nameOf(record.reviewedBy) : 'Not reviewed'} />
      </dl>
      {record.notes && <p className="text-sm text-stone-600">{record.notes}</p>}
      <Reason status={record.status} reason={record.rejectionReason} />
      <Decision
        mode={mode}
        status={record.status}
        impact={`Approving ${record.code} will add ${app.money(record.amount)} to confirmed ${type?.name.toLowerCase()} income. Beverage stock will not change.`}
        correctTo={`/employee/activities?correct=${record.id}`}
        onApprove={() => app.acceptActivity(record.id)}
        onReject={(reason) => app.declineActivity(record.id, reason)}
        onWithdraw={(reason) => app.withdraw('activity', record.id, reason)}
      />
    </div>
  )
}

function Decision({
  mode,
  status,
  impact,
  correctTo,
  approveLabel = 'Approve',
  onApprove,
  onReject,
  onWithdraw,
}: {
  mode: 'view' | 'review' | 'own'
  status: StockInTransaction['status']
  impact: string
  correctTo: string
  approveLabel?: string
  onApprove: () => Promise<{ ok: boolean }>
  onReject: (reason: string) => Promise<{ ok: boolean }>
  onWithdraw: (reason: string) => Promise<{ ok: boolean }>
}) {
  const { t } = useI18n()
  const [confirm, setConfirm] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (mode === 'review' && status === 'pending') {
    return (
      <>
        <div className="flex flex-wrap gap-2">
          <Button variant="gold" onClick={() => setConfirm(true)}>
            {approveLabel}
          </Button>
          <Button variant="danger" onClick={() => setRejecting(true)}>
            Reject
          </Button>
        </div>
        <ConfirmDialog
          open={confirm}
          title="Approve submission"
          body={impact}
          confirmLabel={approveLabel}
          loading={loading}
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            setLoading(true)
            const result = await onApprove()
            setLoading(false)
            if (result.ok) setConfirm(false)
          }}
        />
        <Modal open={rejecting} title="Reject submission" onClose={() => setRejecting(false)}>
          <Field label="Reason" error={error}>
            <TextArea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Tell the employee what to correct" />
          </Field>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={loading}
              onClick={async () => {
                if (reason.trim().length < 3) {
                  setError('Enter a reason with at least 3 characters.')
                  return
                }
                setLoading(true)
                const result = await onReject(reason.trim())
                setLoading(false)
                if (result.ok) setRejecting(false)
              }}
            >
              Reject
            </Button>
          </div>
        </Modal>
      </>
    )
  }

  if (mode === 'own' && status === 'pending') {
    return (
      <>
        <Button variant="secondary" onClick={() => { setReason(''); setError(''); setCancelling(true) }}>{t('cancelSubmission')}</Button>
        <Modal open={cancelling} title={t('cancelTitle')} onClose={() => setCancelling(false)}>
          <p className="text-sm leading-6 text-stone-600">{t('cancelBody')}</p>
          <div className="mt-3">
            <Field label={t('cancelNote')} error={error}>
              <TextArea value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCancelling(false)}>{t('stockBack')}</Button>
            <Button
              variant="danger"
              loading={loading}
              disabled={reason.trim().length < 3}
              onClick={async () => {
                if (reason.trim().length < 3) {
                  setError(t('cancelNeed'))
                  return
                }
                setError('')
                setLoading(true)
                const result = await onWithdraw(reason.trim())
                setLoading(false)
                if (result.ok) setCancelling(false)
              }}
            >
              {t('cancelSubmission')}
            </Button>
          </div>
        </Modal>
      </>
    )
  }

  if (mode === 'own' && (status === 'rejected' || status === 'cancelled')) {
    return (
      <Link to={correctTo} className="inline-flex h-11 items-center rounded-lg bg-charcoal px-4 text-sm font-semibold text-white">
        Correct and resubmit
      </Link>
    )
  }

  return null
}
