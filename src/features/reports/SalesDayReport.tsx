import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import { formatDate } from '@/utils/dates'
import { cogsTotals } from '@/features/dayClose/cogs'
import { debtPaid, debtRemaining, debtStatus } from '@/features/dayClose/debts'
import { downloadStyledPdf, type StyledReport } from '@/utils/pdf'
import { cn } from '@/utils/cn'
import type { Database, DayDebt, SalesTransaction } from '@/types'
import { snapshotFor } from '@/features/inventory/stock'

export interface SalesDayRow {
  name: string
  remaining: number
  sold: number
  amount: number
  profit: number
}

export function salesDayPdf(input: {
  title: string
  business: string
  day: string
  left: string
  sold: string
  revenue: string
  profit: string
  topTitle: string
  tableTitle: string
  product: string
  remainLeft: string
  remainQty: string
  remainRevenue: string
  remainProfit: string
  rows: SalesDayRow[]
  top5: SalesDayRow[]
  money: (value: number) => string
}): StyledReport {
  return {
    title: input.title,
    subtitle: input.business,
    dateLabel: formatDate(input.day),
    kpis: [
      { label: input.remainLeft, value: input.left },
      { label: input.remainQty, value: input.sold },
      { label: input.remainRevenue, value: input.revenue },
      { label: input.remainProfit, value: input.profit },
    ],
    charts: [
      {
        title: input.topTitle,
        bars: input.top5.map((row) => ({ label: row.name, value: row.sold, caption: `${row.sold}  ${input.money(row.profit)}` })),
      },
    ],
    tables: [
      {
        title: input.tableTitle,
        columns: [
          { header: input.product, width: 0.34 },
          { header: input.remainLeft, width: 0.16, align: 'right' },
          { header: input.remainQty, width: 0.16, align: 'right' },
          { header: input.remainRevenue, width: 0.17, align: 'right' },
          { header: input.remainProfit, width: 0.17, align: 'right' },
        ],
        rows: input.rows.map((row) => [row.name, String(row.remaining), String(row.sold), input.money(row.amount), input.money(row.profit)]),
      },
    ],
  }
}

export function reportFromCount(db: Pick<Database, 'products' | 'sales' | 'movements'>, sale: SalesTransaction): SalesDayRow[] {
  const sold = new Map(sale.items.map((item) => [item.productId, item]))
  return db.products
    .filter((product) => product.isActive)
    .map((product) => {
      const item = sold.get(product.id)
      const remaining = snapshotFor(db, product.id).available
      const qty = item?.quantity ?? 0
      const price = item?.unitPrice ?? product.sellingPrice
      const cost = item?.unitCost ?? product.costPrice
      return {
        name: product.name,
        remaining,
        sold: qty,
        amount: qty * price,
        profit: qty * (price - cost),
      }
    })
    .filter((row) => row.sold > 0 || row.remaining > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function SalesDayReport({
  rows,
  day,
  compact = false,
}: {
  rows: SalesDayRow[]
  day: string
  compact?: boolean
}) {
  const app = useApp()
  const { t } = useI18n()
  const soldRows = [...rows].filter((row) => row.sold > 0).sort((a, b) => b.sold - a.sold || b.amount - a.amount)
  const top5 = soldRows.slice(0, 5)
  const left = rows.reduce((sum, row) => sum + row.remaining, 0)
  const sold = rows.reduce((sum, row) => sum + row.sold, 0)
  const amount = rows.reduce((sum, row) => sum + row.amount, 0)
  const profit = rows.reduce((sum, row) => sum + row.profit, 0)
  const maxSold = Math.max(...top5.map((row) => row.sold), 1)

  const download = () => {
    downloadStyledPdf(
      `sales-report-${day}.pdf`,
      salesDayPdf({
        title: t('remainPdfTitle'),
        business: app.settings.businessName,
        day,
        left: String(left),
        sold: String(sold),
        revenue: app.money(amount),
        profit: app.money(profit),
        topTitle: t('remainPdfTop'),
        tableTitle: t('remainPdfSoldTitle'),
        product: t('navProducts'),
        remainLeft: t('remainLeft'),
        remainQty: t('remainQty'),
        remainRevenue: t('remainRevenue'),
        remainProfit: t('remainProfitCol'),
        rows,
        top5,
        money: app.money,
      }),
    )
  }

  return (
    <div className={cn('overflow-hidden', compact ? '' : 'rounded-[1.5rem] border border-white/80 bg-white/85 shadow-sm backdrop-blur-xl sm:rounded-[1.75rem]')}>
      <div className={cn('bg-gradient-to-br from-stone-950 via-stone-900 to-amber-950 px-4 py-4 text-white sm:px-5', compact ? 'rounded-2xl' : '')}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">{t('remainSentAdmin')}</p>
        <h2 className="mt-1 font-display text-2xl leading-tight">{t('remainPdfTitle')}</h2>
        <p className="mt-1 text-sm text-stone-300">{formatDate(day)} · {app.settings.businessName}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            [t('remainLeft'), String(left)],
            [t('remainQty'), String(sold)],
            [t('remainRevenue'), app.money(amount)],
            [t('remainProfitCol'), app.money(profit)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10">
              <p className="text-[10px] uppercase tracking-wide text-amber-200/80">{label}</p>
              <p className="mt-1 break-words text-sm font-semibold tabular-nums sm:text-base">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className={cn(compact ? 'pt-4' : 'p-3 sm:p-5')}>
        {top5.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">{t('remainPdfTop')}</p>
            <div className="mt-3 space-y-2">
              {top5.map((row, index) => (
                <div key={row.name} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-stone-950 text-[11px] font-bold text-amber-300">{index + 1}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{row.name}</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-200">
                      <div className="h-full rounded-full bg-amber-600" style={{ width: `${Math.max(8, (row.sold / maxSold) * 100)}%` }} />
                    </div>
                  </div>
                  <p className="text-right text-xs tabular-nums text-stone-600">{row.sold}<span className="block text-[11px] text-emerald-800">{app.money(row.profit)}</span></p>
                </div>
              ))}
            </div>
            <div className="mt-4 h-40 w-full min-w-0 sm:h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top5} layout="vertical" margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={78} tick={{ fontSize: 10, fill: '#44403c' }} />
                  <Tooltip formatter={(value: number) => [value, t('remainQty')]} />
                  <Bar dataKey="sold" fill="#b45309" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200">
          <div className="divide-y divide-stone-200 md:hidden">
            {rows.map((row) => (
              <article key={row.name} className="space-y-1.5 px-3 py-3">
                <p className="font-semibold text-ink">{row.name}</p>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <div className="flex justify-between gap-2"><dt className="text-stone-500">{t('remainLeft')}</dt><dd className="tabular-nums">{row.remaining}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-stone-500">{t('remainQty')}</dt><dd className="tabular-nums">{row.sold}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-stone-500">{t('remainRevenue')}</dt><dd className="tabular-nums">{app.money(row.amount)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-stone-500">{t('remainProfitCol')}</dt><dd className={cn('tabular-nums', row.profit < 0 ? 'text-rose-700' : 'text-emerald-800')}>{app.money(row.profit)}</dd></div>
                </dl>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-stone-950 text-amber-200">
                <tr>
                  <th className="px-3 py-2.5 font-medium">{t('navProducts')}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t('remainLeft')}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t('remainQty')}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t('remainRevenue')}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t('remainProfitCol')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.name} className={index % 2 ? 'bg-stone-50' : 'bg-white'}>
                    <td className="px-3 py-2.5 font-medium">{row.name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.remaining}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.sold}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{app.money(row.amount)}</td>
                    <td className={cn('px-3 py-2.5 text-right tabular-nums', row.profit < 0 ? 'text-rose-700' : 'text-emerald-800')}>{app.money(row.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="sticky bottom-0 mt-4 flex flex-col gap-2 bg-gradient-to-t from-white via-white to-transparent pt-3 sm:flex-row">
          <Button variant="gold" className="w-full sm:flex-1" onClick={download}>{t('remainPdf')}</Button>
        </div>
      </div>
    </div>
  )
}

export function CogsSheet({
  rows,
  day,
  expenses,
  debts,
  mobile,
  staff,
  approved = false,
}: {
  rows: SalesDayRow[]
  day: string
  expenses: number
  debts: DayDebt[]
  mobile: number
  staff?: string
  approved?: boolean
}) {
  const app = useApp()
  const { t } = useI18n()
  const totals = cogsTotals(rows, expenses, debts, mobile)
  const lines = [
    [t('remainRevenue'), app.money(totals.sales)],
    [t('cogsCost'), app.money(totals.cogs)],
    [t('cogsGross'), app.money(totals.gross)],
    [t('navExpenses'), app.money(totals.expenses)],
    [t('cogsStepDebts'), app.money(totals.debtTotal)],
    [t('cogsCollections'), app.money(totals.collections)],
    [t('cogsMobileTitle'), app.money(totals.mobile)],
    [t('cogsCash'), app.money(totals.cash)],
    [t('cogsNet'), app.money(totals.net)],
  ] as const

  const download = () => {
    downloadStyledPdf(`cogs-${day}.pdf`, {
      title: t('cogsSheetTitle'),
      subtitle: `${app.settings.businessName}${staff ? ` · ${staff}` : ''}`,
      dateLabel: formatDate(day),
      stamp: approved ? t('statusApproved').toUpperCase() : t('statusPending').toUpperCase(),
      kpis: [
        { label: t('remainRevenue'), value: app.money(totals.sales) },
        { label: t('cogsCost'), value: app.money(totals.cogs) },
        { label: t('cogsCash'), value: app.money(totals.cash) },
        { label: t('cogsNet'), value: app.money(totals.net) },
      ],
      tables: [
        {
          title: t('remainPdfSoldTitle'),
          columns: [
            { header: t('navProducts'), width: 0.4 },
            { header: t('remainQty'), width: 0.15, align: 'right' },
            { header: t('remainRevenue'), width: 0.22, align: 'right' },
            { header: t('cogsCost'), width: 0.23, align: 'right' },
          ],
          rows: rows.filter((row) => row.sold > 0).map((row) => [row.name, String(row.sold), app.money(row.amount), app.money(row.amount - row.profit)]),
        },
        {
          title: t('cogsStepDebts'),
          columns: [
            { header: t('cogsCustomer'), width: 0.28 },
            { header: t('cogsDebtAmount'), width: 0.18, align: 'right' },
            { header: t('cogsDebtPaidAmount'), width: 0.18, align: 'right' },
            { header: t('cogsDebtRemaining'), width: 0.18, align: 'right' },
            { header: t('labelStatus'), width: 0.18 },
          ],
          rows: debts.length
            ? debts.map((item) => [
              item.customerName,
              app.money(item.amount),
              app.money(debtPaid(item)),
              app.money(debtRemaining(item)),
              debtStatus(item) === 'approved' ? t('cogsDebtPaid') : debtStatus(item) === 'pending' ? t('cogsDebtAwaiting') : t('cogsDebtUnpaid'),
            ])
            : [['—', app.money(0), app.money(0), app.money(0), t('cogsNoDebts')]],
        },
        {
          title: t('cogsSheetTitle'),
          columns: [
            { header: t('summaryCol'), width: 0.6 },
            { header: t('cogsDebtAmount'), width: 0.4, align: 'right' },
          ],
          rows: lines.map(([label, value]) => [label, value]),
        },
      ],
    })
  }

  return (
    <div className="glass-panel reveal-card overflow-hidden rounded-[1.75rem]">
      <div className="bg-gradient-to-br from-stone-950 via-stone-900 to-amber-950 px-4 py-5 text-white sm:px-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">{t('cogsSheetTitle')}</p>
        <h2 className="mt-1 font-display text-2xl leading-tight">{formatDate(day)}</h2>
        <span className={cn('mt-2 inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide', approved ? 'bg-emerald-400/20 text-emerald-200' : 'bg-amber-400/20 text-amber-200')}>
          {approved ? t('statusApproved') : t('statusPending')}
        </span>
        {staff && <p className="mt-1 text-sm text-stone-300">{staff}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            [t('remainRevenue'), app.money(totals.sales)],
            [t('cogsCost'), app.money(totals.cogs)],
            [t('cogsCash'), app.money(totals.cash)],
            [t('cogsNet'), app.money(totals.net)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10">
              <p className="text-[10px] uppercase tracking-wide text-amber-200/80">{label}</p>
              <p className="mt-1 break-words text-sm font-semibold tabular-nums sm:text-base">{value}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3 p-4 sm:p-5">
        {lines.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 rounded-2xl bg-white/50 px-3 py-2.5 text-sm">
            <span className="text-stone-600">{label}</span>
            <span className="font-semibold tabular-nums text-ink">{value}</span>
          </div>
        ))}
        {debts.length > 0 && (
          <div className="rounded-2xl bg-white/50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">{t('cogsStepDebts')}</p>
            <ul className="mt-2 space-y-2">
              {debts.map((item, index) => (
                <li key={item.id ?? `${item.customerName}-${index}`} className="space-y-1 text-sm">
                  <span className="flex justify-between gap-3">
                    <span>
                      <span className="font-medium">{item.customerName}</span>
                      {item.products ? <span className="mt-0.5 block text-xs text-stone-500">{item.products}</span> : null}
                    </span>
                    <span className="tabular-nums">{app.money(debtRemaining(item))}</span>
                  </span>
                  <span className="flex justify-between gap-3 text-xs text-stone-500">
                    <span>{t('cogsDebtPaidAmount')} {app.money(debtPaid(item))}</span>
                    <span>{debtStatus(item) === 'approved' ? t('cogsDebtPaid') : debtStatus(item) === 'pending' ? t('cogsDebtAwaiting') : t('cogsDebtUnpaid')}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Button variant="gold" className="w-full" onClick={download}>{t('remainPdf')}</Button>
      </div>
    </div>
  )
}
