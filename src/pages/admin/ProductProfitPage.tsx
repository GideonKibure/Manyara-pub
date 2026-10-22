import { useMemo, useState } from 'react'
import { ProductThumb } from '@/components/ProductPicker'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { TextInput } from '@/components/ui/Fields'
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

export function ProductProfitPage() {
  const app = useApp()
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [pricing, setPricing] = useState<Product | null>(null)
  const rows = useMemo(
    () =>
      app.products
        .filter((product) => `${product.name} ${product.sku}`.toLowerCase().includes(query.trim().toLowerCase()))
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((product) => {
          const cost = product.costPrice
          const selling = product.sellingPrice
          const profit = profitOf(cost, selling)
          return { product, cost, selling, profit, percent: percentOf(cost, selling) }
        }),
    [app.products, query],
  )
  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0)
  const totalSelling = rows.reduce((sum, row) => sum + row.selling, 0)
  const totalProfit = rows.reduce((sum, row) => sum + row.profit, 0)
  const overallPercent = percentOf(totalCost, totalSelling)

  return (
    <div>
      <PageHeader title={t('pageProductProfit')} description={t('pageProductProfitBody')} />
      <TextInput className="mb-4" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('productsSearch')} aria-label={t('productsSearch')} />
      <DataTable
        rows={rows}
        getRowId={(row) => row.product.id}
        resetKey={query}
        pageSize={20}
        emptyTitle={t('productsEmptyTitle')}
        emptyBody={t('productsEmptyBody')}
        footer={
          <tr className="text-sm">
            <td className="px-4 py-3 font-semibold text-ink" colSpan={4}>
              {t('profitTotal')}
            </td>
            <td className={cn('px-4 py-3 font-semibold tabular-nums', totalProfit < 0 ? 'text-rose-700' : 'text-emerald-800')}>{app.money(totalProfit)}</td>
            <td className={cn('px-4 py-3 font-semibold tabular-nums', (overallPercent ?? 0) < 0 ? 'text-rose-700' : 'text-ink')}>{formatPercent(overallPercent)}</td>
            <td />
          </tr>
        }
        columns={[
          {
            key: 'image',
            header: t('profitImage'),
            render: (row) => <ProductThumb src={row.product.imageUrl} name={row.product.name} className="h-12 w-12 rounded-xl" />,
          },
          {
            key: 'name',
            header: t('productsProduct'),
            sortValue: (row) => row.product.name,
            render: (row) => (
              <span className="block min-w-0">
                <span className="block font-semibold">{row.product.name}</span>
                {row.product.sku ? <span className="block text-xs font-normal text-stone-500">{row.product.sku}</span> : null}
              </span>
            ),
          },
          {
            key: 'cost',
            header: t('productsBuying'),
            sortValue: (row) => row.cost,
            render: (row) => app.money(row.cost),
          },
          {
            key: 'selling',
            header: t('productsSelling'),
            sortValue: (row) => row.selling,
            render: (row) => app.money(row.selling),
          },
          {
            key: 'profit',
            header: t('profitAmount'),
            sortValue: (row) => row.profit,
            render: (row) => <span className={cn('font-semibold tabular-nums', row.profit < 0 ? 'text-rose-700' : 'text-emerald-800')}>{app.money(row.profit)}</span>,
          },
          {
            key: 'percent',
            header: t('profitPercent'),
            sortValue: (row) => row.percent ?? -Infinity,
            render: (row) => <span className={cn('tabular-nums', (row.percent ?? 0) < 0 ? 'text-rose-700' : '')}>{formatPercent(row.percent)}</span>,
          },
          {
            key: 'change',
            header: '',
            render: (row) => (
              <Button size="sm" variant="secondary" onClick={() => setPricing(row.product)}>
                {t('priceChange')}
              </Button>
            ),
          },
        ]}
      />
      {pricing && <PriceChangeDialog product={pricing} onClose={() => setPricing(null)} />}
      {rows.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="glass-panel rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{t('profitTotal')}</p>
            <p className={cn('mt-1 text-2xl font-semibold tabular-nums', totalProfit < 0 ? 'text-rose-700' : 'text-emerald-800')}>{app.money(totalProfit)}</p>
          </div>
          <div className="glass-panel rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{t('profitOverall')}</p>
            <p className={cn('mt-1 text-2xl font-semibold tabular-nums', (overallPercent ?? 0) < 0 ? 'text-rose-700' : 'text-ink')}>{formatPercent(overallPercent)}</p>
          </div>
        </div>
      )}
    </div>
  )
}
