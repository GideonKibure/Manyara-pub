import { Link } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ProductName } from '@/components/ProductPicker'
import { PageHeader, Panel, StatCard, StockBadge } from '@/components/ui/Feedback'
import { DashboardCharts } from '@/features/reports/DashboardCharts'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import { formatDateTime } from '@/utils/dates'

const axis = { fontSize: 11, fill: '#78716c' }

export function DashboardPage() {
  const { dashboard, money, settings } = useApp()
  const { t } = useI18n()
  const waiting = [
    { label: t('dashPendingStock'), value: dashboard.pendingStockIn },
    { label: t('dashPendingSales'), value: dashboard.pendingSales },
    { label: t('dashPendingActivities'), value: dashboard.pendingActivities },
    { label: t('dashPendingExpenses'), value: dashboard.pendingExpenses },
  ]

  return (
    <div className="space-y-4">
      <PageHeader title={t('navDashboard')} description={`${settings.businessName} ${t('dashAdminDescription')}`} />

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">{t('dashToday')}</h2>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t('dashSalesMine')} value={money(dashboard.todaySalesRevenue)} tone="good" />
          <StatCard label={t('dashPool')} value={money(dashboard.todayPool)} />
          <StatCard label={t('dashKorokoro')} value={money(dashboard.todayKorokoro)} />
          <StatCard label={t('dashReceived')} value={String(dashboard.todayStockReceivedUnits)} hint={money(dashboard.todayStockReceivedCost)} />
        </div>
        <p className="mt-2 text-sm text-stone-600">{t('dashCombined')}: <span className="font-semibold text-ink">{money(dashboard.todayTotalRevenue)}</span></p>
        <Link to="/admin/remaining" className="mt-3 block rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 hover:bg-amber-100">
          {t('remainToday')}
        </Link>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">{t('dashWaiting')}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {waiting.map((item) => (
            <Link key={item.label} to="/admin/approvals" className="min-w-0 rounded-2xl border border-line bg-white p-3 shadow-sm transition-colors hover:bg-stone-50 sm:p-4">
              <p className="text-xs leading-5 text-stone-500 sm:text-sm">{item.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{item.value}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">{t('dashStockSection')}</h2>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label={t('dashActive')} value={String(dashboard.activeProducts)} />
          <StatCard label={t('dashConfirmed')} value={String(dashboard.totalUnits)} hint={t('dashUnits')} />
          <StatCard label={t('stockLow')} value={String(dashboard.lowCount)} tone={dashboard.lowCount ? 'warn' : 'default'} />
          <StatCard label={t('stockOut')} value={String(dashboard.outCount)} tone={dashboard.outCount ? 'danger' : 'default'} />
        </div>
      </section>

      <DashboardCharts days={dashboard.last30Days ?? []} />

      <Panel>
        <h2 className="mb-3 text-base font-semibold">{t('dashMonths')}</h2>
        <div className="h-56 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dashboard.last6Months} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(28,25,23,0.08)" />
              <XAxis dataKey="label" tick={axis} />
              <YAxis width={48} tick={axis} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
              <Tooltip formatter={(value: number) => money(Number(value))} />
              <Line type="monotone" dataKey="revenue" name={t('statementSales')} stroke="#b45309" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="mb-3 text-base font-semibold">{t('dashRecent')}</h2>
          <ul className="divide-y divide-line">
            {dashboard.recent.map((item) => (
              <li key={item.id} className="py-3">
                <p className="text-sm font-medium leading-5">{item.summary}</p>
                <p className="mt-1 text-xs text-stone-500">{item.actor} · {formatDateTime(item.at)}</p>
              </li>
            ))}
            {!dashboard.recent.length && <li className="py-3 text-sm text-stone-500">{t('dashNoneSales')}</li>}
          </ul>
        </Panel>
        <Panel>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold">{t('dashAlerts')}</h2>
            <p className="text-sm font-semibold tabular-nums text-ink">{dashboard.lowProducts.length}</p>
          </div>
          {dashboard.lowProducts.length ? (
            <div className="grid gap-2">
              {dashboard.lowProducts.map((product) => (
                <div key={product.id} className="flex items-center gap-3 rounded-xl bg-stone-50 px-3 py-2">
                  <ProductName name={product.name} src={product.imageUrl} className="min-w-0 flex-1 font-medium" />
                  <span className="shrink-0 text-lg font-semibold tabular-nums text-ink">{product.available}</span>
                  <StockBadge level={product.level} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-500">{t('dashNoneAlerts')}</p>
          )}
        </Panel>
      </div>
    </div>
  )
}
