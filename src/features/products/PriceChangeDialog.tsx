import { useState } from 'react'
import { ProductThumb } from '@/components/ProductPicker'
import { Button } from '@/components/ui/Button'
import { Field, NumberInput } from '@/components/ui/Fields'
import { Modal } from '@/components/ui/Modal'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { Product } from '@/types'
import { dateKey, formatDate } from '@/utils/dates'

export function PriceChangeDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const app = useApp()
  const { t } = useI18n()
  const [day, setDay] = useState(dateKey())
  const [cost, setCost] = useState<number | null>(product.costPrice)
  const [selling, setSelling] = useState<number | null>(product.sellingPrice)
  const [busy, setBusy] = useState(false)
  const history = (app.priceChanges ?? [])
    .filter((item) => item.productId === product.id)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.createdAt.localeCompare(a.createdAt))
  const canSave = cost != null && cost >= 0 && selling != null && selling >= 0 && Boolean(day) && day <= dateKey()

  return (
    <Modal open title={t('priceChangeTitle')} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!canSave || cost == null || selling == null) return
          setBusy(true)
          const result = await app.applyPriceChange({ productId: product.id, day, costPrice: cost, sellingPrice: selling })
          setBusy(false)
          if (result.ok) onClose()
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
        <Field label={t('productsBuying')}>
          <NumberInput value={cost} onValueChange={setCost} />
        </Field>
        <Field label={t('productsSelling')}>
          <NumberInput value={selling} onValueChange={setSelling} />
        </Field>
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
