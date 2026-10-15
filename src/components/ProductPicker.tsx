import { useMemo } from 'react'
import type { Product, StockSnapshot } from '@/types'
import { StockBadge } from '@/components/ui/Feedback'
import { useI18n } from '@/i18n/LanguageContext'
import { cn } from '@/utils/cn'

export function ProductName({ name, src, className, thumbClassName = 'h-10 w-10' }: { name: string; src?: string; className?: string; thumbClassName?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <ProductThumb src={src} name={name} className={cn('shrink-0', thumbClassName)} />
      <span className="min-w-0 truncate">{name}</span>
    </span>
  )
}

export function productFromNotice(products: Array<{ id: string; name: string; imageUrl?: string }>, notice: { dedupeKey?: string; title: string; message: string }) {
  const key = notice.dedupeKey ?? ''
  const marked = key.startsWith('low_stock:') || key.startsWith('out_of_stock:') ? key.slice(key.indexOf(':') + 1) : ''
  if (marked) return products.find((product) => product.id === marked)
  return [...products].sort((a, b) => b.name.length - a.name.length).find((product) => notice.title.includes(product.name) || notice.message.includes(product.name))
}

export function PersonName({ name, src, className }: { name: string; src?: string; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <PersonPhoto src={src} name={name} className="h-8 w-8" />
      <span className="min-w-0 truncate">{name}</span>
    </span>
  )
}

export function PersonPhoto({ src, name, className }: { src?: string; name: string; className?: string }) {
  if (!src) {
    return <span className={cn('grid shrink-0 place-items-center rounded-full bg-amber-100 text-sm font-semibold text-amber-950', className)}>{name.slice(0, 1).toUpperCase()}</span>
  }
  return <img src={src} alt="" className={cn('shrink-0 rounded-full object-cover', className)} />
}

export function ProductThumb({ src, name, className }: { src?: string; name: string; className?: string }) {
  if (!src) {
    return <span className={cn('grid place-items-center rounded-lg bg-stone-200 text-sm font-semibold text-stone-600', className)}>{name.slice(0, 1).toUpperCase()}</span>
  }
  return <img src={src} alt="" className={cn('rounded-lg object-cover', className)} />
}

export function ProductPicker({
  products,
  selectedId,
  onSelect,
  query,
  onQuery,
  snapshots,
  canSeeStock,
  stockLeft,
  images = 'always',
}: {
  products: Product[]
  selectedId: string
  onSelect: (productId: string) => void
  query: string
  onQuery: (value: string) => void
  snapshots?: StockSnapshot[]
  canSeeStock?: boolean
  stockLeft?: (productId: string) => number
  images?: 'always' | 'selected'
}) {
  const { t } = useI18n()
  const needle = query.trim().toLowerCase()
  const visible = useMemo(() => {
    if (!needle) return []
    return products.filter((product) => `${product.name} ${product.sku}`.toLowerCase().includes(needle)).slice(0, 8)
  }, [products, needle])
  const selected = products.find((product) => product.id === selectedId)

  return (
    <div className="space-y-3">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-ink">{t('pickerSearch')}</span>
        <input
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-ink shadow-sm outline-none transition-colors placeholder:text-stone-400 focus:border-amber-700"
          value={query}
          placeholder={t('pickerPlaceholder')}
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>
      {needle && <div className="max-h-72 space-y-2 overflow-y-auto" role="listbox" aria-label={t('productsProduct')}>
        {visible.map((product) => {
          const snap = snapshots?.find((item) => item.productId === product.id)
          const left = stockLeft ? stockLeft(product.id) : snap?.available
          const level = left == null ? snap?.level : left <= 0 ? 'out' : left <= (snap?.minimum ?? 0) ? 'low' : 'normal'
          const active = product.id === selectedId
          return (
            <button
              key={product.id}
              type="button"
              role="option"
              aria-selected={active}
              className={cn('flex min-h-14 w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left touch-manipulation transition-colors', active ? 'border-amber-700 bg-amber-50 shadow-sm' : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50 active:bg-amber-50')}
              onClick={() => onSelect(product.id)}
            >
              {images === 'always' && <ProductThumb src={product.imageUrl} name={product.name} className="h-12 w-12 shrink-0" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold leading-5 text-ink">{product.name}</span>
                <span className="mt-1 flex items-center gap-2 text-xs text-stone-500">
                  <span className="truncate">{product.sku || '—'}</span>
                  {canSeeStock && level && level !== 'normal' && <StockBadge level={level} />}
                </span>
              </span>
              {canSeeStock && left != null && (
                <span className={cn('grid min-w-[4.25rem] shrink-0 place-items-center rounded-xl px-2 py-1.5 text-center', level === 'out' ? 'bg-rose-100 text-rose-950' : level === 'low' ? 'bg-amber-100 text-amber-950' : 'bg-stone-100 text-ink')}>
                  <span className="text-lg font-semibold tabular-nums leading-none">{left}</span>
                  <span className="mt-1 text-[10px] font-medium uppercase tracking-wide">{t('pickerLeft')}</span>
                </span>
              )}
            </button>
          )
        })}
        {!visible.length && <p className="text-sm text-stone-500">{t('pickerEmpty')}</p>}
      </div>}
      {!needle && selected && (
        <div className="flex items-center gap-3 rounded-xl bg-stone-50 p-3">
          <ProductThumb src={selected.imageUrl} name={selected.name} className="h-20 w-20 shrink-0" />
          <div>
            <p className="font-semibold">{selected.name}</p>
            <p className="text-sm text-stone-500">{selected.sku || '—'}</p>
          </div>
        </div>
      )}
    </div>
  )
}
