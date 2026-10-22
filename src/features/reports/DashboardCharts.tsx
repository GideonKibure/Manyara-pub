import { useMemo, useState } from 'react'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ProductName } from '@/components/ProductPicker'
import { Panel } from '@/components/ui/Feedback'
import type { DashDayPoint } from '@/features/reports/metrics'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import { formatDate } from '@/utils/dates'
import { cn } from '@/utils/cn'

const mixColors = ['#b45309', '#0f766e', '#1c1917']
const axis = { fontSize: 11, fill: '#78716c' }

export function DashboardCharts({ days }: { days: DashDayPoint[] }) {
  const { money } = useApp()
  const { t } = useI18n()
  const [span, setSpan] = useState<7 | 14 | 30>(7)
  const [picked, setPicked] = useState<string | null>(null)
  const series = useMemo(() => days.slice(-span), [days, span])
  const selected = series.find((item) => item.key === picked) ?? series.at(-1)
  const sellers = useMemo(() => {
    const map = new Map<string, { name: string; imageUrl?: string; units: number; revenue: number }>()
    for (const day of series) {
      for (const product of day.products) {
        const current = map.get(product.id) ?? { name: product.name, imageUrl: product.imageUrl, units: 0, revenue: 0 }
        current.units += product.units
        current.revenue += product.revenue
        map.set(product.id, current)
      }
    }
    return [...map.values()].sort((a, b) => b.units - a.units).slice(0, 5)
  }, [series])
  const mix = [
    { name: t('dashMixSales'), value: series.reduce((sum, day) => sum + day.sales, 0) },
    { name: t('dashMixPool'), value: series.reduce((sum, day) => sum + day.pool, 0) },
    { name: t('dashMixKorokoro'), value: series.reduce((sum, day) => sum + day.korokoro, 0) },
  ]
  const hasMix = mix.some((item) => item.value > 0)
  const moneyTip = (value: number) => money(Number(value))
  const xKey = span === 30 ? 'shortLabel' : 'label'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-stone-600">{t('dashChartHint')}</p>
        <div className="flex rounded-full bg-white/70 p-1 shadow-sm">
          {([7, 14, 30] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setSpan(item)
                setPicked(null)
              }}
              className={cn(
                'min-h-9 rounded-full px-3 text-xs font-semibold transition',
                span === item ? 'bg-stone-950 text-white' : 'text-stone-600 hover:bg-white',
              )}
            >
              {t(item === 7 ? 'dashRange7' : item === 14 ? 'dashRange14' : 'dashRange30')}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel className="dash-chart">
          <h2 className="mb-1 text-base font-semibold">{t('dashRevenueRange')}</h2>
          <p className="mb-3 text-xs text-stone-500">{t('dashChartTap')}</p>
          <div className="h-56 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#b45309" stopOpacity={0.85} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(28,25,23,0.08)" />
                <XAxis dataKey={xKey} tick={axis} interval={span === 30 ? 2 : 0} />
                <YAxis width={48} tick={axis} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
                <Tooltip
                  labelFormatter={(_, payload) => formatDate(String(payload?.[0]?.payload?.key ?? ''))}
                  formatter={(value: number, name: string) => [moneyTip(Number(value)), name]}
                />
                <Legend />
                <Bar
                  dataKey="sales"
                  name={t('statementSales')}
                  fill="url(#dashSales)"
                  radius={[8, 8, 0, 0]}
                  maxBarSize={28}
                  onClick={(entry) => {
                    const key = (entry as DashDayPoint & { payload?: DashDayPoint }).payload?.key ?? (entry as DashDayPoint).key
                    if (key) setPicked(key)
                  }}
                  cursor="pointer"
                />
                <Line type="monotone" dataKey="profit" name={t('remainProfitCol')} stroke="#0f766e" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="dash-chart">
          <h2 className="mb-1 text-base font-semibold">{t('dashStockRange')}</h2>
          <p className="mb-3 text-xs text-stone-500">{t('dashChartTap')}</p>
          <div className="h-56 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(28,25,23,0.08)" />
                <XAxis dataKey={xKey} tick={axis} interval={span === 30 ? 2 : 0} />
                <YAxis width={36} tick={axis} />
                <Tooltip labelFormatter={(_, payload) => formatDate(String(payload?.[0]?.payload?.key ?? ''))} />
                <Legend />
                <Bar dataKey="stockInUnits" name={t('dashChartStockIn')} fill="#b45309" radius={[8, 8, 0, 0]} maxBarSize={22} cursor="pointer" onClick={(entry) => {
                  const key = (entry as DashDayPoint & { payload?: DashDayPoint }).payload?.key ?? (entry as DashDayPoint).key
                  if (key) setPicked(key)
                }} />
                <Bar dataKey="soldUnits" name={t('dashChartSold')} fill="#1c1917" radius={[8, 8, 0, 0]} maxBarSize={22} cursor="pointer" onClick={(entry) => {
                  const key = (entry as DashDayPoint & { payload?: DashDayPoint }).payload?.key ?? (entry as DashDayPoint).key
                  if (key) setPicked(key)
                }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {selected && (
        <Panel className="reveal-card">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">{t('dashDayDetail')}</h2>
              <p className="text-sm text-stone-500">{formatDate(selected.key)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              [t('statementSales'), money(selected.sales)],
              [t('remainProfitCol'), money(selected.profit)],
              [t('navExpenses'), money(selected.expenses)],
              [t('dashChartSold'), String(selected.soldUnits)],
              [t('dashChartStockIn'), String(selected.stockInUnits)],
              [t('dashChartStockCost'), money(selected.stockInCost)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-white/70 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-stone-500">{label}</p>
                <p className="mt-1 break-words text-sm font-semibold tabular-nums text-ink">{value}</p>
              </div>
            ))}
          </div>
          {selected.products.length ? (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {selected.products.slice(0, 6).map((product) => (
                <li key={product.id} className="flex items-center justify-between gap-3 rounded-2xl bg-stone-50/80 px-3 py-2">
                  <ProductName name={product.name} src={product.imageUrl} className="min-w-0" />
                  <span className="shrink-0 text-right text-xs">
                    <span className="block font-semibold tabular-nums">{product.units}</span>
                    <span className="text-stone-500">{money(product.revenue)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-stone-500">{t('dashNoneSales')}</p>
          )}
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="mb-3 text-base font-semibold">{t('dashBestRange')}</h2>
          {sellers.length ? (
            <ul className="space-y-3">
              {sellers.map((product) => {
                const max = sellers[0]?.units || 1
                return (
                  <li key={product.name}>
                    <div className="flex items-center justify-between gap-3">
                      <ProductName name={product.name} src={product.imageUrl} className="min-w-0" />
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{product.units}</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-stone-100">
                      <div className="profit-fill h-2 rounded-full bg-gradient-to-r from-amber-500 to-amber-800" style={{ width: `${Math.max(8, (product.units / max) * 100)}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-stone-500">{t('dashNoneSales')}</p>
          )}
        </Panel>
        <Panel>
          <h2 className="mb-3 text-base font-semibold">{t('dashMixRange')}</h2>
          {hasMix ? (
            <div className="h-56 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={mix} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={3}>
                    {mix.map((entry, index) => (
                      <Cell key={entry.name} fill={mixColors[index % mixColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => money(Number(value))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-stone-500">{t('dashNoneRevenue')}</p>
          )}
        </Panel>
      </div>
    </div>
  )
}
