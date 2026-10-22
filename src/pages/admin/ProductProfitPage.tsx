import { useMemo, useState } from 'react'
import { Percent, Search, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { ProductThumb } from '@/components/ProductPicker'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/Feedback'
import { PriceChangeDialog } from '@/features/products/PriceChangeDialog'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { Product } from '@/types'
import { cn } from '@/utils/cn'

function profitOf(cost: number, selling: number) {
  return selling - cost
}

function percentOf(cost: number, selling: number) {
  if (!(cost > 0)) return null
  return ((selling - cost) / cost) * 100
}

function formatPercent(value: number | null) {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(1)}%`
}

type SortKey = 'name' | 'profit' | 'percent'
type FilterKey = 'all' | 'gain' | 'loss'

export function ProductProfitPage() {
  const app = useApp()
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('name')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [pricing, setPricing] = useState<Product | null>(null)

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = app.products
      .filter((product) => `${product.name} ${product.sku}`.toLowerCase().includes(needle))
      .map((product) => {
        const cost = product.costPrice
        const selling = product.sellingPrice
        const profit = profitOf(cost, selling)
        return { product, cost, selling, profit, percent: percentOf(cost, selling) }
      })
      .filter((row) => (filter === 'gain' ? row.profit > 0 : filter === 'loss' ? row.profit < 0 : true))
    return list.sort((a, b) => {
      if (sort === 'profit') return b.profit - a.profit
      if (sort === 'percent') return (b.percent ?? -Infinity) - (a.percent ?? -Infinity)
      return a.product.name.localeCompare(b.product.name)
    })
  }, [app.products, query, sort, filter])

  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0)
  const totalSelling = rows.reduce((sum, row) => sum + row.selling, 0)
  const totalProfit = rows.reduce((sum, row) => sum + row.profit, 0)
  const overallPercent = percentOf(totalCost, totalSelling)
  const maxPercent = Math.max(1, ...rows.map((row) => Math.abs(row.percent ?? 0)))
  const gainCount = app.products.filter((product) => product.sellingPrice - product.costPrice > 0).length
  const lossCount = app.products.filter((product) => product.sellingPrice - product.costPrice < 0).length

  const summary = [
    { label: t('navProducts'), value: String(rows.length), icon: Wallet, tone: 'from-stone-800 to-stone-950 text-white' },
    { label: t('profitTotal'), value: app.money(totalProfit), icon: totalProfit < 0 ? TrendingDown : TrendingUp, tone: totalProfit < 0 ? 'from-rose-700 to-rose-900 text-white' : 'from-emerald-600 to-emerald-900 text-white' },
    { label: t('profitOverall'), value: formatPercent(overallPercent), icon: Percent, tone: 'from-amber-500 to-amber-800 text-white' },
  ] as const

  const chips: Array<{ id: FilterKey | SortKey; label: string; active: boolean; onClick: () => void }> = [
    { id: 'all', label: t('profitAll'), active: filter === 'all', onClick: () => setFilter('all') },
    { id: 'gain', label: `${t('remainGain')} (${gainCount})`, active: filter === 'gain', onClick: () => setFilter('gain') },
    { id: 'loss', label: `${t('remainLoss')} (${lossCount})`, active: filter === 'loss', onClick: () => setFilter('loss') },
    { id: 'name', label: t('profitSortName'), active: sort === 'name', onClick: () => setSort('name') },
    { id: 'profit', label: t('profitAmount'), active: sort === 'profit', onClick: () => setSort('profit') },
    { id: 'percent', label: t('profitSortBest'), active: sort === 'percent', onClick: () => setSort('percent') },
  ]

  return (
    <div className="employee-dash remaining-close relative -mx-3 -mt-4 min-h-[calc(100dvh-4.5rem)] px-3 pb-28 pt-5 sm:-mx-4 sm:-mt-6 sm:px-4 sm:pt-6 md:-mx-8 md:-mb-8 md:px-8 md:pb-10">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <PageHeader title={t('pageProductProfit')} description={t('pageProductProfitBody')} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {summary.map((item, index) => (
            <div
              key={item.label}
              className={cn('reveal-card relative overflow-hidden rounded-3xl bg-gradient-to-br p-4 shadow-[0_12px_28px_rgba(28,25,23,0.08)]', item.tone)}
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <item.icon className="mb-3 h-5 w-5 opacity-80" />
              <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{item.label}</p>
              <p className="mt-1 break-words text-xl font-semibold tabular-nums sm:text-2xl">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="glass-panel review-sheet sticky top-2 z-20 space-y-3 rounded-[1.75rem] p-3 sm:p-4">
          <label className="flex items-center gap-2 rounded-2xl bg-white/70 px-3 py-2">
            <Search className="h-5 w-5 shrink-0 text-amber-800" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('productsSearch')}
              aria-label={t('productsSearch')}
              className="min-w-0 flex-1 bg-transparent text-base font-semibold text-ink outline-none placeholder:font-normal placeholder:text-stone-400"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={chip.onClick}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition active:scale-95',
                  chip.active ? 'bg-amber-700 text-white shadow-sm' : 'bg-white/70 text-stone-600 hover:bg-amber-50',
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {!rows.length && (
          <p className="rounded-3xl border border-dashed border-stone-300 bg-white/60 px-4 py-10 text-center text-sm text-stone-500">
            {t('productsEmptyTitle')}. {t('productsEmptyBody')}
          </p>
        )}

        <div className="grid gap-3">
          {rows.map((row, index) => {
            const open = openId === row.product.id
            const width = Math.min(100, ((Math.abs(row.percent ?? 0) / maxPercent) * 100) || 0)
            return (
              <article
                key={row.product.id}
                className="review-line glass-panel overflow-hidden rounded-[1.75rem]"
                style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}
              >
                <button
                  type="button"
                  className="flex w-full flex-col gap-3 p-3 text-left sm:flex-row sm:items-center sm:px-4 sm:py-3"
                  onClick={() => setOpenId(open ? null : row.product.id)}
                  aria-expanded={open}
                  aria-label={`${t('profitOpen')} ${row.product.name}`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <ProductThumb src={row.product.imageUrl} name={row.product.name} className="h-14 w-14 shrink-0 rounded-2xl" />
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-base font-semibold text-ink">{row.product.name}</h2>
                      <p className="text-xs text-stone-500">{row.product.sku || t('productsProduct')}</p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200/80">
                        <div
                          className={cn('profit-fill h-full rounded-full', row.profit < 0 ? 'bg-rose-500' : 'bg-emerald-500')}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold tabular-nums text-stone-600">{app.money(row.cost)}</span>
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold tabular-nums text-amber-950">{app.money(row.selling)}</span>
                    <span className={cn('rounded-full px-3 py-1 text-sm font-semibold tabular-nums', row.profit < 0 ? 'bg-rose-100 text-rose-900' : 'bg-emerald-100 text-emerald-900')}>
                      {app.money(row.profit)} · {formatPercent(row.percent)}
                    </span>
                  </div>
                </button>
                {open && (
                  <div className="review-sheet grid gap-3 border-t border-white/70 bg-gradient-to-r from-amber-50/80 to-transparent p-3 sm:grid-cols-4 sm:p-4">
                    <div className="rounded-2xl bg-white/80 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-wide text-stone-500">{t('productsBuying')}</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums">{app.money(row.cost)}</p>
                    </div>
                    <div className="rounded-2xl bg-white/80 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-wide text-stone-500">{t('productsSelling')}</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums">{app.money(row.selling)}</p>
                    </div>
                    <div className={cn('rounded-2xl px-3 py-3', row.profit < 0 ? 'bg-rose-50' : 'bg-emerald-50')}>
                      <p className="text-[11px] uppercase tracking-wide text-stone-500">{t('profitAmount')}</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums">{app.money(row.profit)}</p>
                    </div>
                    <Button
                      variant="gold"
                      className="h-auto min-h-11 rounded-2xl"
                      onClick={() => setPricing(row.product)}
                    >
                      {t('priceChange')}
                    </Button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </div>
      {pricing && <PriceChangeDialog product={pricing} onClose={() => setPricing(null)} />}
    </div>
  )
}
