import { useMemo, useState } from 'react'
import { ClipboardCheck, Package, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { NumberInput } from '@/components/ui/Fields'
import { Modal } from '@/components/ui/Modal'
import { ProductThumb } from '@/components/ProductPicker'
import { snapshotFor } from '@/features/inventory/stock'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import { reportFromCount, SalesDayReport, type SalesDayRow } from '@/features/reports/SalesDayReport'
import { asDateKey, formatDate, formatDateTime } from '@/utils/dates'
import { cn } from '@/utils/cn'

export function RemainingStockPage() {
  const app = useApp()
  const { t } = useI18n()
  const allowed = app.user?.role === 'admin' || app.settings.allowRemainingCount
  const today = asDateKey(new Date().toISOString())
  const rows = useMemo(
    () =>
      app.products
        .filter((product) => product.isActive)
        .map((product) => ({
          product,
          opening: snapshotFor(
            { products: app.products, sales: app.sales, movements: app.movements },
            product.id,
          ).available,
        }))
        .filter((row) => row.opening > 0)
        .sort((a, b) => a.product.name.localeCompare(b.product.name)),
    [app.products, app.sales, app.movements],
  )
  const [remaining, setRemaining] = useState<Record<string, number | null>>({})
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [adminReport, setAdminReport] = useState<SalesDayRow[] | null>(null)
  const reportKey = `manyara.remain.report.${app.user?.id ?? 'guest'}.${today}`
  const [report, setReport] = useState<SalesDayRow[] | null>(() => {
    try {
      const raw = sessionStorage.getItem(reportKey)
      return raw ? (JSON.parse(raw) as SalesDayRow[]) : null
    } catch {
      return null
    }
  })

  const filled = rows.map(({ product, opening }) => {
    const value = remaining[product.id]
    const left = value == null ? opening : value
    const sold = Math.max(0, opening - left)
    const profit = sold * (product.sellingPrice - product.costPrice)
    return {
      product,
      opening,
      left,
      sold,
      profit,
      revenue: sold * product.sellingPrice,
      over: left > opening || left < 0 || !Number.isInteger(left),
    }
  })
  const openingUnits = filled.reduce((sum, row) => sum + row.opening, 0)
  const soldUnits = filled.reduce((sum, row) => sum + row.sold, 0)
  const leftUnits = filled.reduce((sum, row) => sum + Math.max(0, row.left), 0)
  const profit = filled.reduce((sum, row) => sum + row.profit, 0)
  const revenue = filled.reduce((sum, row) => sum + row.revenue, 0)
  const blocked = filled.some((row) => row.over)

  const todayCounts = app.sales
    .filter((sale) => sale.notes === 'Remaining stock count' && sale.status === 'approved' && asDateKey(sale.reviewedAt ?? sale.submittedAt) === today)
    .sort((a, b) => (b.reviewedAt ?? '').localeCompare(a.reviewedAt ?? ''))

  const summary = [
    { label: t('remainOpening'), value: String(openingUnits), hint: t('remainUnits'), icon: Package, tone: 'from-stone-800 to-stone-950 text-white' },
    { label: t('remainSold'), value: String(soldUnits), hint: app.money(revenue), icon: TrendingUp, tone: 'from-amber-500 to-amber-800 text-white' },
    { label: t('remainResult'), value: app.money(profit), hint: profit < 0 ? t('remainLoss') : t('remainGain'), icon: profit < 0 ? TrendingDown : Wallet, tone: profit < 0 ? 'from-rose-700 to-rose-900 text-white' : 'from-emerald-600 to-emerald-900 text-white' },
    { label: t('remainLeft'), value: String(leftUnits), hint: t('remainUnits'), icon: ClipboardCheck, tone: 'from-white to-amber-50 text-ink border border-white/80' },
  ] as const

  return (
    <div className="employee-dash remaining-close relative -mx-3 -mt-4 min-h-[calc(100dvh-4.5rem)] px-3 pb-40 pt-5 sm:-mx-4 sm:-mt-6 sm:px-4 sm:pt-6 md:-mx-8 md:-mb-8 md:px-8 md:pb-10">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">{t('remainSection')}</p>
            <h1 className="mt-1 font-display text-3xl text-ink sm:text-4xl">{t('remainTitle')}</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">{t('remainBody')}</p>
          </div>
          <span className="rounded-full border border-white/80 bg-white/70 px-4 py-2 text-sm font-semibold text-ink shadow-sm backdrop-blur">{formatDate(today)}</span>
        </header>

        {!allowed && (
          <div className="rounded-3xl border border-amber-200 bg-amber-50/90 p-5 text-sm leading-6 text-amber-950">
            {t('remainLocked')}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {summary.map((item) => (
            <div key={item.label} className={cn('relative overflow-hidden rounded-3xl bg-gradient-to-br p-4 shadow-[0_12px_28px_rgba(28,25,23,0.08)]', item.tone)}>
              <item.icon className="mb-3 h-5 w-5 opacity-80" />
              <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{item.label}</p>
              <p className="mt-1 break-words text-xl font-semibold tabular-nums sm:text-2xl">{item.value}</p>
              <p className="mt-1 text-xs opacity-80">{item.hint}</p>
            </div>
          ))}
        </div>

        {allowed && (
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault()
              if (blocked) return
              setBusy(true)
              const snapshot = filled.map((row) => ({
                name: row.product.name,
                remaining: row.left,
                sold: row.sold,
                amount: row.revenue,
                profit: row.profit,
              }))
              const result = await app.sendRemainingCount(filled.map((row) => ({ productId: row.product.id, remaining: row.left })))
              setBusy(false)
              if (result.ok) {
                setRemaining({})
                setReport(snapshot)
                sessionStorage.setItem(reportKey, JSON.stringify(snapshot))
                setOpen(true)
              }
            }}
          >
            {!filled.length && <p className="rounded-3xl border border-dashed border-stone-300 bg-white/60 px-4 py-8 text-center text-sm text-stone-500">{t('remainNoneInStock')}</p>}
            <div className="grid gap-3">
              {filled.map((row) => (
                <article key={row.product.id} className="overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/65 shadow-[0_10px_30px_rgba(28,25,23,0.06)] backdrop-blur-xl">
                  <div className="flex items-center gap-3 border-b border-white/70 bg-gradient-to-r from-amber-50/80 to-transparent px-4 py-3">
                    <ProductThumb src={row.product.imageUrl} name={row.product.name} className="h-14 w-14 rounded-2xl" />
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-base font-semibold text-ink">{row.product.name}</h2>
                      <p className="text-xs text-stone-500">{t('remainOpening')} {row.opening}</p>
                    </div>
                    <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', row.profit < 0 ? 'bg-rose-100 text-rose-900' : 'bg-emerald-100 text-emerald-900')}>
                      {app.money(row.profit)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
                    <label className="col-span-2 sm:col-span-1">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-500">{t('remainLeft')}</span>
                      <NumberInput
                        value={remaining[row.product.id] ?? row.opening}
                        onValueChange={(next) => setRemaining((current) => ({ ...current, [row.product.id]: next }))}
                        className="rounded-2xl border-amber-200/80 bg-white text-lg font-semibold"
                      />
                    </label>
                    <div className="rounded-2xl bg-stone-950 px-3 py-3 text-white">
                      <p className="text-[11px] uppercase tracking-wide text-stone-400">{t('remainSold')}</p>
                      <p className="mt-1 text-xl font-semibold tabular-nums">{row.sold}</p>
                    </div>
                    <div className="rounded-2xl bg-amber-50 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-wide text-amber-800">{t('remainRevenue')}</p>
                      <p className="mt-1 text-sm font-semibold tabular-nums text-ink">{app.money(row.revenue)}</p>
                    </div>
                    <div className={cn('rounded-2xl px-3 py-3', row.profit < 0 ? 'bg-rose-50' : 'bg-emerald-50')}>
                      <p className={cn('text-[11px] uppercase tracking-wide', row.profit < 0 ? 'text-rose-800' : 'text-emerald-800')}>{t('remainResult')}</p>
                      <p className="mt-1 text-sm font-semibold tabular-nums text-ink">{app.money(row.profit)}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {blocked && <p className="text-sm text-rose-700">{t('remainOver')}</p>}
            <div className="hidden justify-end md:flex">
              <Button type="submit" variant="gold" loading={busy} disabled={blocked || !rows.length}>
                {t('remainSave')}
              </Button>
            </div>
            <div className="fixed inset-x-3 z-30 md:hidden" style={{ bottom: 'calc(6.75rem + env(safe-area-inset-bottom))' }}>
              <Button type="submit" variant="gold" className="w-full rounded-2xl shadow-lg" loading={busy} disabled={blocked || !rows.length}>
                {t('remainSave')} · {app.money(profit)}
              </Button>
            </div>
          </form>
        )}

        {report && app.user?.role !== 'admin' && (
          <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setOpen(true)}>{t('remainOpenReport')}</Button>
        )}

        <Modal open={open} title={t('remainPdfTitle')} onClose={() => setOpen(false)} wide>
          <p className="mb-4 text-sm leading-6 text-stone-600">{t('remainPopupHint')}</p>
          {report && <SalesDayReport rows={report} day={today} compact />}
          <Button variant="secondary" className="mt-3 w-full" onClick={() => setOpen(false)}>{t('remainCloseReport')}</Button>
        </Modal>

        <Modal open={Boolean(adminReport)} title={t('remainPdfTitle')} onClose={() => setAdminReport(null)} wide>
          <p className="mb-4 text-sm leading-6 text-stone-600">{t('remainPopupHint')}</p>
          {adminReport && <SalesDayReport rows={adminReport} day={today} compact />}
          <Button variant="secondary" className="mt-3 w-full" onClick={() => setAdminReport(null)}>{t('remainCloseReport')}</Button>
        </Modal>

        {app.user?.role === 'admin' && (
          <section className="rounded-[1.75rem] border border-white/80 bg-white/70 p-4 shadow-sm backdrop-blur-xl sm:p-5">
            <h2 className="font-semibold text-ink">{t('remainToday')}</h2>
            <p className="mt-1 text-sm text-stone-500">{t('remainTodayBody')}</p>
            <div className="mt-4 space-y-3">
              {todayCounts.map((sale) => {
                const units = sale.items.reduce((sum, item) => sum + item.quantity, 0)
                const value = sale.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
                const gain = sale.items.reduce((sum, item) => sum + item.quantity * (item.unitPrice - item.unitCost), 0)
                return (
                  <button
                    type="button"
                    key={sale.id}
                    className="flex w-full flex-wrap items-center justify-between gap-2 rounded-2xl bg-stone-950 px-4 py-3 text-left text-white"
                    onClick={() => setAdminReport(reportFromCount({ products: app.products, sales: app.sales, movements: app.movements }, sale))}
                  >
                    <div>
                      <p className="font-semibold">{sale.code} · {app.nameOf(sale.submittedBy)}</p>
                      <p className="text-xs text-stone-400">{formatDateTime(sale.reviewedAt ?? sale.submittedAt)}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p>{units} {t('remainUnits')} · {app.money(value)}</p>
                      <p className={gain < 0 ? 'text-rose-300' : 'text-emerald-300'}>{app.money(gain)}</p>
                      <p className="text-xs text-amber-300">{t('remainOpenReport')}</p>
                    </div>
                  </button>
                )
              })}
              {!todayCounts.length && <p className="text-sm text-stone-500">{t('remainEmptyToday')}</p>}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
