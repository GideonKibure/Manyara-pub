import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { SelectInput } from '@/components/ui/Fields'
import { ProductName } from '@/components/ProductPicker'
import { PageHeader, Panel, StatCard, StockBadge } from '@/components/ui/Feedback'
import { buildReport } from '@/features/reports/metrics'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import { dateKey, rangeForPreset } from '@/utils/dates'
import { downloadCsv } from '@/utils/csv'
import { downloadTextPdf } from '@/utils/pdf'
import { stockLabel } from '@/utils/labels'

const presets = [
  ['today', 'Today'],
  ['7d', '7 days'],
  ['30d', '30 days'],
  ['month', 'This month'],
  ['year', 'This year'],
] as const

export function ReportsPage() {
  const app = useApp()
  const { t } = useI18n()
  const [preset, setPreset] = useState<(typeof presets)[number][0] | 'custom'>('7d')
  const [range, setRange] = useState(rangeForPreset('7d'))
  const [categoryId, setCategoryId] = useState('all')
  const [tab, setTab] = useState<'inventory' | 'sales' | 'revenue'>('sales')
  const report = useMemo(() => buildReport({
    version: 1,
    accounts: [],
    resetTokens: [],
    profiles: app.profiles,
    categories: app.categories,
    units: app.units,
    products: app.products,
    suppliers: app.suppliers,
    stockIns: app.stockIns,
    sales: app.sales,
    movements: app.movements,
    activityTypes: app.activityTypes,
    activities: app.activities,
    notifications: [],
    auditLogs: [],
    settings: app.settings,
    expenses: app.expenses,
    counters: { stockIn: 0, sale: 0, activity: 0, expense: 0, adjustment: 0 },
  }, { ...range, categoryId }), [app, range, categoryId])

  const downloadPdf = () => {
    const title = `${app.settings.businessName} report`
    const period = `${range.from} to ${range.to}`
    const lines = [title, period, '']
    if (tab === 'inventory') {
      lines.push('Inventory')
      report.inventory.forEach((row) => lines.push(`${row.name} | confirmed ${row.confirmed} | reserved ${row.reserved} | available ${row.available} | ${stockLabel(row.level)} | ${app.money(row.costValue)}`))
    } else if (tab === 'sales') {
      lines.push('Approved sales')
      lines.push(`Beverage revenue ${app.money(report.beverageRevenue)}`)
      report.salesByProduct.forEach((row) => lines.push(`${row.name} | ${row.units} units | ${app.money(row.revenue)} | profit ${app.money(row.profit)}`))
    } else {
      lines.push('Revenue', `Beverage sales ${app.money(report.beverageRevenue)}`, `Pool table ${app.money(report.poolRevenue)}`, `Korokoro ${app.money(report.korokoroRevenue)}`, `Total ${app.money(report.totalRevenue)}`, `Cost of goods ${app.money(report.cogs)}`, `Gross profit ${app.money(report.grossProfit)}`)
    }
    downloadTextPdf(`manyara-${tab}.pdf`, lines)
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
          <div className="no-print flex gap-2">
            <Button variant="gold" onClick={downloadPdf}>{t('pagePdf')}</Button>
            <Button variant="secondary" onClick={() => exportRows()}>{t('pageExport')}</Button>
            <Button variant="secondary" onClick={() => window.print()}>{t('pagePrint')}</Button>
          </div>
        }
      />
      <div className="no-print mb-4 flex flex-wrap gap-2">
        {presets.map(([key, label]) => (
          <Button key={key} variant={preset === key ? 'primary' : 'secondary'} size="sm" onClick={() => { setPreset(key); setRange(rangeForPreset(key)) }}>{label}</Button>
        ))}
        <label className="flex items-center gap-2 text-sm">
          From
          <input type="date" className="rounded-lg border border-stone-300 px-2 py-1" value={range.from} max={dateKey()} onChange={(event) => { setPreset('custom'); setRange((current) => ({ ...current, from: event.target.value })) }} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          To
          <input type="date" className="rounded-lg border border-stone-300 px-2 py-1" value={range.to} max={dateKey()} onChange={(event) => { setPreset('custom'); setRange((current) => ({ ...current, to: event.target.value })) }} />
        </label>
        <SelectInput className="w-auto" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} aria-label="Category">
          <option value="all">All categories</option>
          {app.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </SelectInput>
      </div>
      <div className="no-print mb-4 flex gap-2">
        {(['inventory', 'sales', 'revenue'] as const).map((item) => (
          <Button key={item} variant={tab === item ? 'primary' : 'secondary'} onClick={() => setTab(item)}>{item[0].toUpperCase() + item.slice(1)}</Button>
        ))}
      </div>
      {tab === 'inventory' && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <StatCard label="Low stock now" value={String(report.low.length)} />
            <StatCard label="Out of stock now" value={String(report.out.length)} />
            <StatCard label="Adjustments in range" value={String(report.adjustments.length)} />
          </div>
          <DataTable rows={report.inventory} getRowId={(row) => row.id} pageSize={10} emptyTitle="No products" columns={[
            { key: 'name', header: 'Product', render: (row) => <ProductName name={row.name} src={row.imageUrl} /> },
            { key: 'confirmed', header: 'Confirmed', render: (row) => `${row.confirmed} ${row.unit}` },
            { key: 'reserved', header: 'Reserved', render: (row) => row.reserved },
            { key: 'available', header: 'Available', render: (row) => row.available },
            { key: 'level', header: 'Status', render: (row) => <StockBadge level={row.level} /> },
            { key: 'value', header: 'Cost value', className: 'hidden lg:table-cell', render: (row) => app.money(row.costValue) },
          ]} />
        </div>
      )}
      {tab === 'sales' && (
        <div className="space-y-4">
          <Panel>
            <h2 className="mb-3 font-semibold">Approved sales in range</h2>
            <div className="h-64">
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
          <DataTable rows={report.salesByProduct} getRowId={(row) => row.name} emptyTitle="No approved sales in this range" columns={[
            { key: 'name', header: 'Product', render: (row) => <ProductName name={row.name} src={row.imageUrl} /> },
            { key: 'category', header: 'Category', render: (row) => row.category },
            { key: 'units', header: 'Units', render: (row) => row.units },
            { key: 'revenue', header: 'Revenue', render: (row) => app.money(row.revenue) },
            { key: 'profit', header: 'Est. profit', render: (row) => app.money(row.profit) },
          ]} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <h2 className="mb-3 font-semibold">By employee</h2>
              {report.salesByEmployee.map((row) => <p key={row.name} className="flex justify-between py-1 text-sm"><span>{row.name} · {row.transactions} sales</span><span>{app.money(row.revenue)}</span></p>)}
              {!report.salesByEmployee.length && <p className="text-sm text-stone-500">No approved sales.</p>}
            </Panel>
            <Panel>
              <h2 className="mb-3 font-semibold">Pending and rejected</h2>
              <p className="text-sm text-stone-600">Pending: {report.pending.length}. Rejected: {report.rejected.length}. These are excluded from the revenue above.</p>
            </Panel>
          </div>
        </div>
      )}
      {tab === 'revenue' && (
        <div className="grid gap-3 md:grid-cols-3">
          <StatCard label="Beverage sales" value={app.money(report.beverageRevenue)} hint="Approved only" />
          <StatCard label="Pool table" value={app.money(report.poolRevenue)} />
          <StatCard label="Korokoro" value={app.money(report.korokoroRevenue)} />
          <StatCard label="Total approved revenue" value={app.money(report.totalRevenue)} tone="good" />
          <StatCard label="Estimated cost of goods" value={app.money(report.cogs)} hint={report.costIncomplete ? 'Some sales have no cost snapshot' : 'From the cost saved on each sale'} />
          <StatCard label="Estimated gross profit" value={app.money(report.grossProfit)} hint="Beverage revenue minus recorded cost. Activity income is not reduced by drink cost." />
        </div>
      )}
    </div>
  )
}
