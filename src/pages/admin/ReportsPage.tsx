import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { SelectInput } from '@/components/ui/Fields'
import { ProductName } from '@/components/ProductPicker'
import { PageHeader, Panel, StatCard, StockBadge } from '@/components/ui/Feedback'
import { buildDayStatement, buildReport } from '@/features/reports/metrics'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import { dateKey, rangeForPreset } from '@/utils/dates'
import { downloadCsv } from '@/utils/csv'
import { downloadStyledPdf } from '@/utils/pdf'
import { stockLabel } from '@/utils/labels'

const presets = [
  ['today', 'rangeToday'],
  ['7d', 'range7d'],
  ['30d', 'range30d'],
  ['month', 'rangeMonth'],
  ['year', 'rangeYear'],
] as const

export function ReportsPage() {
  const app = useApp()
  const { t } = useI18n()
  const [preset, setPreset] = useState<(typeof presets)[number][0] | 'custom'>('7d')
  const [range, setRange] = useState(rangeForPreset('7d'))
  const [categoryId, setCategoryId] = useState('all')
  const [tab, setTab] = useState<'inventory' | 'sales' | 'revenue'>('sales')
  const [statementDay, setStatementDay] = useState(dateKey())
  const report = useMemo(() => buildReport({
    version: 1,
    accounts: [],
    resetTokens: [],
    profiles: app.profiles,
    categories: app.categories,
    units: app.units,
    products: app.products,
    priceChanges: app.priceChanges,
    suppliers: app.suppliers,
    stockIns: app.stockIns,
    restockOrders: app.restockOrders ?? [],
    sales: app.sales,
    movements: app.movements,
    activityTypes: app.activityTypes,
    activities: app.activities,
    notifications: [],
    auditLogs: [],
    settings: app.settings,
    expenses: app.expenses,
    dayCloses: app.dayCloses,
    counters: { stockIn: 0, sale: 0, activity: 0, expense: 0, adjustment: 0 },
  }, { ...range, categoryId }), [app, range, categoryId])

  const statement = useMemo(() => buildDayStatement({
    version: 1,
    accounts: [],
    resetTokens: [],
    profiles: app.profiles,
    categories: app.categories,
    units: app.units,
    products: app.products,
    priceChanges: app.priceChanges,
    suppliers: app.suppliers,
    stockIns: app.stockIns,
    restockOrders: app.restockOrders ?? [],
    sales: app.sales,
    movements: app.movements,
    activityTypes: app.activityTypes,
    activities: app.activities,
    notifications: [],
    auditLogs: [],
    settings: app.settings,
    expenses: app.expenses,
    dayCloses: app.dayCloses,
    counters: { stockIn: 0, sale: 0, activity: 0, expense: 0, adjustment: 0 },
  }, statementDay), [app, statementDay])

  const downloadStatement = (asCsv = false) => {
    const money = app.money
    if (asCsv) {
      downloadCsv(`manyara-statement-${statement.date}.csv`, [
        { section: 'sold', item: 'Sales revenue', amount: statement.salesRevenue },
        { section: 'sold', item: 'Cost of goods', amount: statement.goodsCost },
        { section: 'sold', item: 'Gross profit', amount: statement.goodsProfit },
        { section: 'income', item: 'Other income', amount: statement.otherIncomeTotal },
        { section: 'expenses', item: 'Expenses', amount: statement.expensesTotal },
        { section: 'result', item: 'Profit or loss', amount: statement.net },
        ...statement.sold.map((row) => ({ section: 'items sold', item: row.name, units: row.units, amount: row.revenue, profit: row.profit })),
        ...statement.bought.map((row) => ({ section: 'items bought', item: row.name, units: row.units, amount: row.cost })),
        ...statement.expenses.map((row) => ({ section: 'expenses', item: row.description, amount: row.amount })),
        ...statement.toBuy.map((row) => ({ section: 'to buy', item: row.name, units: row.buy, available: row.available })),
      ])
      return
    }
    downloadStyledPdf(`manyara-statement-${statement.date}.pdf`, {
      title: t('pdfDaily'),
      subtitle: app.settings.businessName,
      dateLabel: statement.date,
      kpis: [
        { label: t('statementSales'), value: money(statement.salesRevenue) },
        { label: t('pdfGrossProfit'), value: money(statement.goodsProfit) },
        { label: t('statementExpenses'), value: money(statement.expensesTotal) },
        { label: t('pdfNet'), value: money(statement.net) },
      ],
      charts: [
        {
          title: t('pdfTopSold'),
          bars: [...statement.sold].sort((a, b) => b.units - a.units).slice(0, 5).map((row) => ({
            label: row.name,
            value: row.units,
            caption: `${row.units}  ${money(row.profit)}`,
          })),
        },
      ],
      tables: [
        {
          title: t('pdfItemsSold'),
          columns: [
            { header: t('reportColProduct'), width: 0.4 },
            { header: t('pdfQty'), width: 0.15, align: 'right' },
            { header: t('statementSales'), width: 0.225, align: 'right' },
            { header: t('remainProfitCol'), width: 0.225, align: 'right' },
          ],
          rows: statement.sold.map((row) => [row.name, String(row.units), money(row.revenue), money(row.profit)]),
        },
        {
          title: t('pdfItemsBought'),
          columns: [
            { header: t('reportColProduct'), width: 0.55 },
            { header: t('pdfQty'), width: 0.15, align: 'right' },
            { header: t('pdfCost'), width: 0.3, align: 'right' },
          ],
          rows: statement.bought.map((row) => [row.name, String(row.units), money(row.cost)]),
        },
        {
          title: t('pdfStockToBuy'),
          columns: [
            { header: t('reportColProduct'), width: 0.5 },
            { header: t('pdfNow'), width: 0.25, align: 'right' },
            { header: t('pdfBuy'), width: 0.25, align: 'right' },
          ],
          rows: statement.toBuy.map((row) => [row.name, String(row.available), String(row.buy)]),
        },
      ],
    })
  }

  const downloadPdf = () => {
    const period = `${range.from} to ${range.to}`
    if (tab === 'inventory') {
      downloadStyledPdf(`manyara-${tab}.pdf`, {
        title: t('pdfInventory'),
        subtitle: app.settings.businessName,
        dateLabel: period,
        tables: [{
          title: t('pdfStockNow'),
          columns: [
            { header: t('reportColProduct'), width: 0.34 },
            { header: t('reportColConfirmed'), width: 0.16, align: 'right' },
            { header: t('reportColReserved'), width: 0.16, align: 'right' },
            { header: t('reportColAvailable'), width: 0.16, align: 'right' },
            { header: t('reportColStatus'), width: 0.18 },
          ],
          rows: report.inventory.map((row) => [row.name, String(row.confirmed), String(row.reserved), String(row.available), stockLabel(row.level)]),
        }],
      })
      return
    }
    if (tab === 'sales') {
      downloadStyledPdf(`manyara-${tab}.pdf`, {
        title: t('pdfSalesReport'),
        subtitle: app.settings.businessName,
        dateLabel: period,
        kpis: [{ label: t('reportBeverage'), value: app.money(report.beverageRevenue) }],
        charts: [{
          title: t('pdfTopProducts'),
          bars: report.salesByProduct.slice(0, 5).map((row) => ({ label: row.name, value: row.units, caption: `${row.units}  ${app.money(row.profit)}` })),
        }],
        tables: [{
          title: t('pdfApprovedSales'),
          columns: [
            { header: t('reportColProduct'), width: 0.34 },
            { header: t('pdfQty'), width: 0.14, align: 'right' },
            { header: t('statementSales'), width: 0.26, align: 'right' },
            { header: t('remainProfitCol'), width: 0.26, align: 'right' },
          ],
          rows: report.salesByProduct.map((row) => [row.name, String(row.units), app.money(row.revenue), app.money(row.profit)]),
        }],
      })
      return
    }
    downloadStyledPdf(`manyara-${tab}.pdf`, {
      title: t('pdfRevenueReport'),
      subtitle: app.settings.businessName,
      dateLabel: period,
      kpis: [
        { label: t('reportBeverage'), value: app.money(report.beverageRevenue) },
        { label: t('reportPool'), value: app.money(report.poolRevenue) },
        { label: t('reportKorokoro'), value: app.money(report.korokoroRevenue) },
        { label: t('pdfGrossProfit'), value: app.money(report.grossProfit) },
      ],
    })
  }

  const exportRows = () => {
    if (tab === 'inventory') {
      return downloadCsv('manyara-inventory.csv', report.inventory.map((row) => ({ product: row.name, sku: row.sku, category: row.category, confirmed: row.confirmed, reserved: row.reserved, available: row.available, minimum: row.minimum, status: stockLabel(row.level) })))
    }
    if (tab === 'sales') {
      return downloadCsv('manyara-sales.csv', report.salesByProduct.map((row) => ({ product: row.name, category: row.category, units: row.units, revenue: row.revenue, cost: row.cost, profit: row.profit })))
    }
    return downloadCsv('manyara-revenue.csv', [{ beverage: report.beverageRevenue, pool: report.poolRevenue, korokoro: report.korokoroRevenue, total: report.totalRevenue, cost: report.cogs, profit: report.grossProfit }])
  }

  return (
    <div className="print-area">
      <PageHeader
        title={t('pageReports')}
        description={t('pageReportsBody')}
        actions={
          <div className="no-print flex w-full flex-wrap gap-2 sm:w-auto">
            <Button variant="gold" className="flex-1 sm:flex-none" onClick={downloadPdf}>{t('pagePdf')}</Button>
            <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => exportRows()}>{t('pageExport')}</Button>
            <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => window.print()}>{t('pagePrint')}</Button>
          </div>
        }
      />
      <Panel className="no-print mb-4">
        <h2 className="font-semibold">{t('statementTitle')}</h2>
        <p className="mt-1 text-sm text-stone-500">{t('statementBody')}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex min-w-0 flex-1 items-center gap-2 text-sm sm:flex-none">
            {t('statementDate')}
            <input type="date" className="min-w-0 flex-1 rounded-lg border border-stone-300 px-2 py-2 sm:flex-none" value={statementDay} max={dateKey()} onChange={(event) => setStatementDay(event.target.value)} />
          </label>
          <div className="flex gap-2">
            <Button variant="gold" className="flex-1 sm:flex-none" onClick={() => downloadStatement(false)}>{t('statementPdf')}</Button>
            <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => downloadStatement(true)}>{t('statementCsv')}</Button>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <p className="text-sm">{t('statementSales')}: {app.money(statement.salesRevenue)}</p>
          <p className="text-sm">{t('statementExpenses')}: {app.money(statement.expensesTotal)}</p>
          <p className="text-sm font-semibold">{t('statementNet')}: {app.money(statement.net)}</p>
        </div>
      </Panel>
      <div className="no-print mb-4 flex flex-wrap gap-2">
        {presets.map(([key, label]) => (
          <Button key={key} variant={preset === key ? 'primary' : 'secondary'} size="sm" onClick={() => { setPreset(key); setRange(rangeForPreset(key)) }}>{t(label)}</Button>
        ))}
        <label className="flex items-center gap-2 text-sm">
          {t('labelFrom')}
          <input type="date" className="rounded-lg border border-stone-300 px-2 py-1" value={range.from} max={dateKey()} onChange={(event) => { setPreset('custom'); setRange((current) => ({ ...current, from: event.target.value })) }} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          {t('labelTo')}
          <input type="date" className="rounded-lg border border-stone-300 px-2 py-1" value={range.to} max={dateKey()} onChange={(event) => { setPreset('custom'); setRange((current) => ({ ...current, to: event.target.value })) }} />
        </label>
        <SelectInput className="w-auto" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} aria-label={t('labelCategory')}>
          <option value="all">{t('allCategories')}</option>
          {app.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </SelectInput>
      </div>
      <div className="no-print mb-4 flex flex-wrap gap-2">
        {([
          ['inventory', 'tabInventory'],
          ['sales', 'tabSales'],
          ['revenue', 'tabRevenue'],
        ] as const).map(([item, label]) => (
          <Button key={item} variant={tab === item ? 'primary' : 'secondary'} onClick={() => setTab(item)}>{t(label)}</Button>
        ))}
      </div>
      {tab === 'inventory' && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <StatCard label={t('reportLowNow')} value={String(report.low.length)} />
            <StatCard label={t('reportOutNow')} value={String(report.out.length)} />
            <StatCard label={t('reportAdjustments')} value={String(report.adjustments.length)} />
          </div>
          <DataTable rows={report.inventory} getRowId={(row) => row.id} pageSize={10} emptyTitle={t('reportNoProducts')} columns={[
            { key: 'name', header: t('reportColProduct'), render: (row) => <ProductName name={row.name} src={row.imageUrl} /> },
            { key: 'confirmed', header: t('reportColConfirmed'), render: (row) => `${row.confirmed} ${row.unit}` },
            { key: 'reserved', header: t('reportColReserved'), render: (row) => row.reserved },
            { key: 'available', header: t('reportColAvailable'), render: (row) => row.available },
            { key: 'level', header: t('reportColStatus'), render: (row) => <StockBadge level={row.level} /> },
            { key: 'value', header: t('reportColCostValue'), className: 'hidden lg:table-cell', render: (row) => app.money(row.costValue) },
          ]} />
        </div>
      )}
      {tab === 'sales' && (
        <div className="space-y-4">
          <Panel>
            <h2 className="mb-3 font-semibold">{t('reportApprovedInRange')}</h2>
            <div className="h-52 w-full min-w-0 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.salesByDay.length > 45 ? report.salesByMonth.map((item) => ({ label: item.month, revenue: item.revenue })) : report.salesByDay.map((item) => ({ label: item.label, revenue: item.revenue }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => app.money(Number(value))} />
                  <Bar dataKey="revenue" fill="#b45309" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <DataTable rows={report.salesByProduct} getRowId={(row) => row.name} emptyTitle={t('reportNoSales')} columns={[
            { key: 'name', header: t('reportColProduct'), render: (row) => <ProductName name={row.name} src={row.imageUrl} /> },
            { key: 'category', header: t('reportColCategory'), render: (row) => row.category },
            { key: 'units', header: t('reportColUnits'), render: (row) => row.units },
            { key: 'revenue', header: t('reportColRevenue'), render: (row) => app.money(row.revenue) },
            { key: 'profit', header: t('reportColProfit'), render: (row) => app.money(row.profit) },
          ]} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <h2 className="mb-3 font-semibold">{t('reportByEmployee')}</h2>
              {report.salesByEmployee.map((row) => <p key={row.name} className="flex justify-between py-1 text-sm"><span>{row.name} · {row.transactions}</span><span>{app.money(row.revenue)}</span></p>)}
              {!report.salesByEmployee.length && <p className="text-sm text-stone-500">{t('reportNoSalesShort')}</p>}
            </Panel>
            <Panel>
              <h2 className="mb-3 font-semibold">{t('reportPendingRejected')}</h2>
              <p className="text-sm text-stone-600">{t('reportPendingRejectedBody').replace('{pending}', String(report.pending.length)).replace('{rejected}', String(report.rejected.length))}</p>
            </Panel>
          </div>
        </div>
      )}
      {tab === 'revenue' && (
        <div className="grid gap-3 md:grid-cols-3">
          <StatCard label={t('reportBeverage')} value={app.money(report.beverageRevenue)} hint={t('reportApprovedOnly')} />
          <StatCard label={t('reportPool')} value={app.money(report.poolRevenue)} />
          <StatCard label={t('reportKorokoro')} value={app.money(report.korokoroRevenue)} />
          <StatCard label={t('reportTotalRevenue')} value={app.money(report.totalRevenue)} tone="good" />
          <StatCard label={t('reportCogs')} value={app.money(report.cogs)} hint={report.costIncomplete ? t('reportCogsMissing') : t('reportCogsHint')} />
          <StatCard label={t('reportGross')} value={app.money(report.grossProfit)} hint={t('reportGrossHint')} />
        </div>
      )}
    </div>
  )
}
