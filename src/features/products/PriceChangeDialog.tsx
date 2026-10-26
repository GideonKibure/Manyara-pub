import { useState } from 'react'
import { ProductThumb } from '@/components/ProductPicker'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, NumberInput } from '@/components/ui/Fields'
import { Modal } from '@/components/ui/Modal'
import { useApp } from '@/context/AppContext'
import { compileOffer, offerDraftFrom, SIZE_ORDER, type OfferDraft } from '@/features/products/offer'
import { useI18n } from '@/i18n/LanguageContext'
import type { Product, ProductSizeName } from '@/types'
import { dateKey, formatDate } from '@/utils/dates'

export function PriceChangeDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const app = useApp()
  const { t } = useI18n()
  const [day, setDay] = useState(dateKey())
  const [offer, setOffer] = useState<OfferDraft>(() => offerDraftFrom(product))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const history = (app.priceChanges ?? [])
    .filter((item) => item.productId === product.id)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.createdAt.localeCompare(a.createdAt))
  const compiled = compileOffer(offer)
  const canSave = compiled.ok && Boolean(day) && day <= dateKey()
  const patchSize = (name: ProductSizeName, patch: Partial<OfferDraft['sizes'][ProductSizeName]>) => {
    setOffer((current) => ({ ...current, sizes: { ...current.sizes, [name]: { ...current.sizes[name], ...patch } } }))
  }

  return (
    <Modal open title={t('priceChangeTitle')} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault()
          const next = compileOffer(offer)
          if (!next.ok || !canSave) {
            setError(next.ok ? t('priceChangeDay') : next.error)
            return
          }
          setError('')
          setBusy(true)
          const result = await app.applyPriceChange({
            productId: product.id,
            day,
            costPrice: next.costPrice,
            sellingPrice: next.sellingPrice,
            sizes: next.sizeMode === 'many' ? next.sizes : undefined,
            cupPrice: next.cupPrice,
            halfPrice: next.halfPrice,
          })
          setBusy(false)
          if (result.ok) onClose()
          else setError(result.error)
        }}
      >
        <div className="flex items-center gap-3 rounded-2xl bg-stone-50 p-3">
          <ProductThumb src={product.imageUrl} name={product.name} className="h-12 w-12 rounded-xl" />
          <div className="min-w-0">
            <p className="font-semibold text-ink">{product.name}</p>
            <p className="text-sm text-stone-500">
              {app.money(product.costPrice)} → {app.money(product.sellingPrice)}
            </p>
          </div>
        </div>
        <p className="text-sm leading-6 text-stone-600">{t('priceChangeBody')}</p>
        <Field label={t('priceChangeDay')}>
          <input
            type="date"
            max={dateKey()}
            value={day}
            onChange={(event) => setDay(event.target.value)}
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-ink shadow-sm outline-none focus:border-amber-700"
          />
        </Field>
        {offer.sizeMode === 'one' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('productsBuying')}>
              <NumberInput value={offer.costPrice} onValueChange={(costPrice) => setOffer((current) => ({ ...current, costPrice }))} />
            </Field>
            <Field label={t('productsSelling')}>
              <NumberInput value={offer.sellingPrice} onValueChange={(sellingPrice) => setOffer((current) => ({ ...current, sellingPrice }))} />
            </Field>
          </div>
        )}
        {offer.sizeMode === 'many' && (
          <div className="space-y-3">
            {SIZE_ORDER.map((name) =>
              offer.sizes[name].enabled ? (
                <div key={name} className="rounded-xl border border-line p-3">
                  <p className="text-sm font-semibold text-ink">{t(name === 'small' ? 'productsSizeSmall' : name === 'medium' ? 'productsSizeMedium' : 'productsSizeBig')}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label={t('productsBuying')}>
                      <NumberInput value={offer.sizes[name].cost} onValueChange={(cost) => patchSize(name, { cost })} />
                    </Field>
                    <Field label={t('productsSelling')}>
                      <NumberInput value={offer.sizes[name].price} onValueChange={(price) => patchSize(name, { price })} />
                    </Field>
                    {offer.sellByCup && (
                      <Field label={t('productsCupPrice')}>
                        <NumberInput value={offer.sizes[name].cupPrice} onValueChange={(cupPrice) => patchSize(name, { cupPrice })} />
                      </Field>
                    )}
                    {offer.sellByHalf && (
                      <Field label={t('productsHalfPrice')}>
                        <NumberInput value={offer.sizes[name].halfPrice} onValueChange={(halfPrice) => patchSize(name, { halfPrice })} />
                      </Field>
                    )}
                  </div>
                </div>
              ) : null,
            )}
          </div>
        )}
        {offer.sizeMode === 'one' && (offer.sellByCup || offer.sellByHalf) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {offer.sellByCup && (
              <Field label={t('productsCupPrice')}>
                <NumberInput value={offer.cupPrice} onValueChange={(cupPrice) => setOffer((current) => ({ ...current, cupPrice }))} />
              </Field>
            )}
            {offer.sellByHalf && (
              <Field label={t('productsHalfPrice')}>
                <NumberInput value={offer.halfPrice} onValueChange={(halfPrice) => setOffer((current) => ({ ...current, halfPrice }))} />
              </Field>
            )}
          </div>
        )}
        {offer.sizeMode === 'one' && (
          <div className="flex flex-wrap gap-4">
            <Checkbox label={t('productsSellCup')} checked={offer.sellByCup} onChange={(event) => setOffer((current) => ({ ...current, sellByCup: event.target.checked }))} />
            <Checkbox label={t('productsSellHalf')} checked={offer.sellByHalf} onChange={(event) => setOffer((current) => ({ ...current, sellByHalf: event.target.checked }))} />
          </div>
        )}
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        {!compiled.ok ? <p className="text-sm text-rose-700">{compiled.error}</p> : null}
        <Button type="submit" variant="gold" className="w-full" loading={busy} disabled={!canSave}>
          {t('priceChangeSave')}
        </Button>
        <div>
          <h3 className="text-sm font-semibold text-ink">{t('priceChangeHistory')}</h3>
          <ul className="mt-2 divide-y divide-line">
            {history.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>{formatDate(item.effectiveDate)}</span>
                <span className="tabular-nums text-stone-600">
                  {app.money(item.costPrice)} → {app.money(item.sellingPrice)}
                </span>
              </li>
            ))}
            {!history.length && <li className="py-2 text-sm text-stone-500">{t('priceChangeEmpty')}</li>}
          </ul>
        </div>
      </form>
    </Modal>
  )
}
