import { useMemo, useState } from 'react'
import { PageHeader, Panel, StatusBadge } from '@/components/ui/Feedback'
import { SelectInput } from '@/components/ui/Fields'
import { Modal } from '@/components/ui/Modal'
import { ProductName } from '@/components/ProductPicker'
import { SaleDetail } from '@/features/transactions/Details'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { SalesTransaction } from '@/types'
import { formatDateTime } from '@/utils/dates'
import { billBalance, recordedTotal } from '@/utils/labels'

export function OrdersPage() {
  const app = useApp()
  const { t } = useI18n()
  const [kind, setKind] = useState<'all' | 'sale' | 'bill'>('all')
  const [selected, setSelected] = useState<SalesTransaction | null>(null)
  const orders = useMemo(
    () => app.sales
      .filter((sale) => sale.submittedBy === app.user?.id)
      .filter((sale) => kind === 'all' || (sale.recordKind ?? 'sale') === kind)
      .sort((a, b) => (b.submittedAt || b.generatedAt).localeCompare(a.submittedAt || a.generatedAt)),
    [app.sales, app.user?.id, kind],
  )

  return (
    <div>
      <PageHeader title={t('pageOrders')} description={t('pageOrdersBody')} />
      <div className="mb-4 max-w-xs">
        <SelectInput value={kind} onChange={(event) => setKind(event.target.value as 'all' | 'sale' | 'bill')} aria-label={t('pageOrders')}>
          <option value="all">{t('dashAll')}</option>
          <option value="sale">{t('navSales')}</option>
          <option value="bill">{t('navBills')}</option>
        </SelectInput>
      </div>
      <div className="space-y-3">
        {orders.map((order) => {
          const bill = order.recordKind === 'bill'
          const first = order.items[0]
          const product = app.products.find((item) => item.id === first?.productId)
          const extra = Math.max(0, order.items.length - 1)
          return (
            <button key={order.id} type="button" className="w-full rounded-2xl border border-line bg-white p-4 text-left shadow-sm transition hover:bg-stone-50 active:scale-[0.99] md:p-5" onClick={() => setSelected(order)}>
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-semibold leading-5 text-ink">{bill ? order.customerName || t('navBills') : t('navSales')}</span>
                    <span className="mt-1 block text-sm text-stone-500">{order.code} · {bill ? t('navBills') : t('navSales')} · {formatDateTime(order.submittedAt || order.generatedAt)}</span>
                    {product && (
                      <span className="mt-2 block">
                        <ProductName name={extra > 0 ? `${product.name} +${extra}` : product.name} src={product.imageUrl} />
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold tabular-nums text-ink">{app.money(bill ? billBalance(order) : recordedTotal(order))}</span>
                    <span className="mt-1 block text-xs text-stone-500">{order.isLoss ? t('orderLoss') : order.paymentStatus === 'paid' ? t('billPaid') : t('billUnpaid')}</span>
                    <span className="mt-2 inline-flex"><StatusBadge status={order.status} /></span>
                  </span>
                </span>
            </button>
          )
        })}
        {!orders.length && <Panel><p className="text-sm text-stone-500">{t('pageOrdersEmpty')}</p></Panel>}
      </div>
      <Modal open={Boolean(selected)} title={selected?.recordKind === 'bill' ? t('pageBillDetails') : t('pageSaleDetails')} onClose={() => setSelected(null)} wide>
        {selected && <SaleDetail record={selected} mode="own" />}
      </Modal>
    </div>
  )
}
