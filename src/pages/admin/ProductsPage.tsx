import { useEffect, useMemo, useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { ProductThumb } from '@/components/ProductPicker'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, NumberInput, SelectInput, TextInput } from '@/components/ui/Fields'
import { PageHeader, StockBadge } from '@/components/ui/Feedback'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import { compileOffer, offerDraftFrom, SIZE_ORDER, type OfferDraft } from '@/features/products/offer'
import { PriceChangeDialog } from '@/features/products/PriceChangeDialog'
import { productSchema, type ProductValues } from '@/schemas'
import type { Product, ProductSizeName } from '@/types'
import { storeProductImage } from '@/utils/image'

const emptyValues: ProductValues = {
  name: '',
  categoryId: '',
  sku: '',
  imageUrl: '',
  stockUnitId: '',
  receiveUnitId: '',
  conversionFactor: 1,
  costPrice: 0,
  sellingPrice: 0,
  sizeMode: 'one',
  sizes: [],
  cupPrice: null,
  halfPrice: null,
  minStock: 0,
  isActive: true,
}

export function ProductsPage() {
  const app = useApp()
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState('all')
  const [status, setStatus] = useState('all')
  const [editing, setEditing] = useState<Product | null>(null)
  const [open, setOpen] = useState(false)
  const [removing, setRemoving] = useState<Product | null>(null)
  const [removingBusy, setRemovingBusy] = useState(false)
  const [pricing, setPricing] = useState<Product | null>(null)

  const rows = useMemo(
    () =>
      app.products.filter((product) => {
        const haystack = `${product.name} ${product.sku}`.toLowerCase()
        const matchesQuery = haystack.includes(query.trim().toLowerCase())
        const matchesCategory = categoryId === 'all' || product.categoryId === categoryId
        const matchesStatus = status === 'all' || (status === 'active' ? product.isActive : !product.isActive)
        return matchesQuery && matchesCategory && matchesStatus
      }),
    [app.products, query, categoryId, status],
  )

  return (
    <div>
      <PageHeader
        title={t('productsTitle')}
        description={t('productsDescription')}
        actions={
          <Button
            variant="gold"
            onClick={() => {
              setEditing(null)
              setOpen(true)
            }}
          >
            {t('productsAdd')}
          </Button>
        }
      />
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('productsSearch')} aria-label={t('productsSearch')} />
        <SelectInput value={categoryId} onChange={(event) => setCategoryId(event.target.value)} aria-label={t('productsCategory')}>
          <option value="all">{t('productsAllCategories')}</option>
          {app.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </SelectInput>
        <SelectInput value={status} onChange={(event) => setStatus(event.target.value)} aria-label={t('productsAllStatuses')}>
          <option value="all">{t('productsAllStatuses')}</option>
          <option value="active">{t('productsActive')}</option>
          <option value="inactive">{t('productsInactive')}</option>
        </SelectInput>
      </div>
      <p className="mb-3 text-sm text-stone-600">
        <span className="font-semibold tabular-nums text-ink">{app.products.length}</span> {t('dashStockCount').toLowerCase()}
        <span className="mx-1.5">·</span>
        <span className="font-semibold tabular-nums text-ink">{rows.length}</span> {t('productsShown')}
      </p>
      {rows.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => {
            const snap = app.snapshots.find((item) => item.productId === row.id)
            const unit = app.units.find((item) => item.id === row.stockUnitId)?.abbreviation ?? ''
            const price = row.sizeMode === 'many'
              ? row.sizes.map((size) => `${t(size.name === 'small' ? 'productsSizeSmall' : size.name === 'medium' ? 'productsSizeMedium' : 'productsSizeBig')} ${app.money(size.price)}`).join(' · ')
              : app.money(row.sellingPrice)
            return (
              <article key={row.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-3 shadow-sm sm:p-4">
                <div className="flex items-start gap-3">
                  <ProductThumb src={row.imageUrl} name={row.name} className="h-14 w-14 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold leading-5 text-ink">{row.name}</h2>
                    <p className="mt-1 text-sm text-stone-500">{app.categories.find((item) => item.id === row.categoryId)?.name}</p>
                    {row.sku && <p className="text-xs text-stone-400">{row.sku}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-2xl font-semibold tabular-nums leading-none text-ink">{snap?.available ?? 0}</p>
                    <p className="mt-1 text-[11px] text-stone-500">{unit} {t('productsOnHand')}</p>
                  </div>
                </div>
                <p className="text-sm leading-5 text-stone-600">{price}</p>
                <div className="mt-auto flex items-center justify-between gap-2">
                  {snap && <StockBadge level={snap.level} />}
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button size="sm" variant="secondary" onClick={() => { setEditing(row); setOpen(true) }}>{t('productsEdit')}</Button>
                    <Button size="sm" variant="secondary" onClick={() => setPricing(row)}>{t('priceChange')}</Button>
                    <Button size="sm" variant="danger" onClick={() => setRemoving(row)}>{t('productsDelete')}</Button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-10 text-center text-sm text-stone-500">{t('productsEmptyTitle')}. {t('productsEmptyBody')}</p>
      )}
      {open && (
        <ProductDialog
          product={editing}
          onClose={() => setOpen(false)}
        />
      )}
      {pricing && <PriceChangeDialog product={pricing} onClose={() => setPricing(null)} />}
      <ConfirmDialog
        open={Boolean(removing)}
        title={t('productsDeleteTitle')}
        body={removing ? `${removing.name}. ${t('productsDeleteBody')}` : ''}
        confirmLabel={t('productsDelete')}
        cancelLabel={t('productsCancel')}
        tone="danger"
        loading={removingBusy}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return
          setRemovingBusy(true)
          const result = await app.removeProduct(removing.id)
          setRemovingBusy(false)
          if (result.ok) setRemoving(null)
        }}
      />
    </div>
  )
}

function ProductDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const app = useApp()
  const { t } = useI18n()
  const fileRef = useRef<HTMLInputElement>(null)
  const [photoError, setPhotoError] = useState('')
  const [offerError, setOfferError] = useState('')
  const [offer, setOffer] = useState<OfferDraft>(() => offerDraftFrom(product))
  const patchSize = (name: ProductSizeName, patch: Partial<OfferDraft['sizes'][ProductSizeName]>) => {
    setOffer((current) => ({ ...current, sizes: { ...current.sizes, [name]: { ...current.sizes[name], ...patch } } }))
  }
  const form = useForm<ProductValues>({
    resolver: zodResolver(productSchema),
    defaultValues: product
      ? {
          name: product.name,
          categoryId: product.categoryId,
          sku: product.sku,
          imageUrl: product.imageUrl ?? '',
          stockUnitId: product.stockUnitId,
          receiveUnitId: product.receiveUnitId,
          conversionFactor: product.conversionFactor,
          costPrice: product.costPrice,
          sellingPrice: product.sellingPrice,
          sizeMode: product.sizeMode ?? 'one',
          sizes: product.sizes ?? [],
          cupPrice: product.cupPrice ?? null,
          halfPrice: product.halfPrice ?? null,
          minStock: product.minStock,
          isActive: product.isActive,
        }
      : { ...emptyValues, categoryId: app.categories[0]?.id ?? '', stockUnitId: app.units[0]?.id ?? '', receiveUnitId: app.units[0]?.id ?? '' },
  })
  const stockUnit = form.watch('stockUnitId')
  const receiveUnit = form.watch('receiveUnitId')
  const imageUrl = form.watch('imageUrl')
  useEffect(() => {
    if (stockUnit && stockUnit === receiveUnit && form.getValues('conversionFactor') !== 1) {
      form.setValue('conversionFactor', 1)
    }
  }, [stockUnit, receiveUnit, form])

  return (
    <Modal open title={product ? t('productsEditTitle') : t('productsAddTitle')} onClose={onClose} wide>
        <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={form.handleSubmit(async (values) => {
          const compiled = compileOffer({
            ...offer,
            costPrice: Number.isFinite(values.costPrice) ? values.costPrice : null,
            sellingPrice: Number.isFinite(values.sellingPrice) ? values.sellingPrice : null,
          })
          if (!compiled.ok) {
            setOfferError(compiled.error)
            return
          }
          setOfferError('')
          const result = product
            ? await app.editProduct(product.id, { ...values, ...compiled })
            : await app.addProduct({ ...values, ...compiled })
          if (result.ok) onClose()
        })}
      >
        <Field label={t('productsName')} error={form.formState.errors.name?.message}>
          <TextInput {...form.register('name')} />
        </Field>
        <Field label={t('productsCategory')} error={form.formState.errors.categoryId?.message}>
          <SelectInput {...form.register('categoryId')}>
            {app.categories.filter((category) => category.isActive || category.id === product?.categoryId).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <div className="md:col-span-2">
          <Field label={t('productsSku')} hint={t('productsSkuHint')} error={form.formState.errors.sku?.message}>
            <TextInput {...form.register('sku')} placeholder="BEER-SAF" />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label={t('productsPhoto')} hint={t('productsPhotoHint')} error={photoError || form.formState.errors.imageUrl?.message}>
          <div className="flex items-center gap-3">
            <ProductThumb src={imageUrl || undefined} name={form.watch('name') || 'P'} className="h-16 w-16" />
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={async (event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (!file) return
                  setPhotoError('')
                  try {
                    form.setValue('imageUrl', await storeProductImage(file), { shouldValidate: true })
                  } catch (error) {
                    setPhotoError(error instanceof Error ? error.message : t('productsPhotoError'))
                  }
                }}
              />
              <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>{t('productsChoosePhoto')}</Button>
              {imageUrl && <Button type="button" variant="secondary" onClick={() => form.setValue('imageUrl', '', { shouldValidate: true })}>{t('productsRemovePhoto')}</Button>}
            </div>
          </div>
        </Field>
        </div>
        <Field label={t('productsStockUnit')} error={form.formState.errors.stockUnitId?.message}>
          <SelectInput {...form.register('stockUnitId')}>
            {app.units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label={t('productsReceiveUnit')} error={form.formState.errors.receiveUnitId?.message}>
          <SelectInput {...form.register('receiveUnitId')}>
            {app.units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label={t('productsConversion')} hint={stockUnit === receiveUnit ? t('productsConversionSame') : t('productsConversionHint')} error={form.formState.errors.conversionFactor?.message}>
          <Controller name="conversionFactor" control={form.control} render={({ field }) => <NumberInput value={Number.isFinite(field.value) ? field.value : null} onValueChange={(next) => field.onChange(next ?? Number.NaN)} disabled={stockUnit === receiveUnit} />} />
        </Field>
        <Field label={t('productsMinimum')} error={form.formState.errors.minStock?.message}>
          <Controller name="minStock" control={form.control} render={({ field }) => <NumberInput value={Number.isFinite(field.value) ? field.value : null} onValueChange={(next) => field.onChange(next ?? Number.NaN)} />} />
        </Field>
        {offer.sizeMode === 'one' && (
          <Field label={t('productsBuying')} error={form.formState.errors.costPrice?.message}>
            <Controller name="costPrice" control={form.control} render={({ field }) => <NumberInput value={Number.isFinite(field.value) ? field.value : null} onValueChange={(next) => field.onChange(next ?? Number.NaN)} />} />
          </Field>
        )}
        <div className="space-y-3 md:col-span-2">
          <p className="text-sm font-medium text-ink">{t('productsSelling')}</p>
          <p className="text-sm text-stone-500">{t('productsSizeHint')}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={offer.sizeMode === 'one' ? 'primary' : 'secondary'} onClick={() => setOffer((current) => ({ ...current, sizeMode: 'one' }))}>{t('productsOneSize')}</Button>
            <Button type="button" variant={offer.sizeMode === 'many' ? 'primary' : 'secondary'} onClick={() => setOffer((current) => ({ ...current, sizeMode: 'many' }))}>{t('productsManySizes')}</Button>
          </div>
          {offer.sizeMode === 'one' && (
            <Field label={t('productsSelling')} error={form.formState.errors.sellingPrice?.message}>
              <Controller name="sellingPrice" control={form.control} render={({ field }) => <NumberInput value={Number.isFinite(field.value) ? field.value : null} onValueChange={(next) => field.onChange(next ?? Number.NaN)} />} />
            </Field>
          )}
          {offer.sizeMode === 'many' && (
            <div className="space-y-3">
              {SIZE_ORDER.map((name) => (
                <div key={name} className="rounded-xl border border-line p-3">
                  <Checkbox label={t(name === 'small' ? 'productsSizeSmall' : name === 'medium' ? 'productsSizeMedium' : 'productsSizeBig')} checked={offer.sizes[name].enabled} onChange={(event) => patchSize(name, { enabled: event.target.checked })} />
                  {offer.sizes[name].enabled && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Field label={t('productsBuying')}><NumberInput value={offer.sizes[name].cost} onValueChange={(next) => patchSize(name, { cost: next })} /></Field>
                      <Field label={t('productsSelling')}><NumberInput value={offer.sizes[name].price} onValueChange={(next) => patchSize(name, { price: next })} /></Field>
                      {offer.sellByCup && <Field label={t('productsCupPrice')}><NumberInput value={offer.sizes[name].cupPrice} onValueChange={(next) => patchSize(name, { cupPrice: next })} /></Field>}
                      {offer.sellByHalf && <Field label={t('productsHalfPrice')}><NumberInput value={offer.sizes[name].halfPrice} onValueChange={(next) => patchSize(name, { halfPrice: next })} /></Field>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-4">
            <Checkbox label={t('productsSellCup')} checked={offer.sellByCup} onChange={(event) => setOffer((current) => ({ ...current, sellByCup: event.target.checked }))} />
            <Checkbox label={t('productsSellHalf')} checked={offer.sellByHalf} onChange={(event) => setOffer((current) => ({ ...current, sellByHalf: event.target.checked }))} />
          </div>
          {offer.sizeMode === 'one' && (offer.sellByCup || offer.sellByHalf) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {offer.sellByCup && <Field label={t('productsCupPrice')}><NumberInput value={offer.cupPrice} onValueChange={(next) => setOffer((current) => ({ ...current, cupPrice: next }))} /></Field>}
              {offer.sellByHalf && <Field label={t('productsHalfPrice')}><NumberInput value={offer.halfPrice} onValueChange={(next) => setOffer((current) => ({ ...current, halfPrice: next }))} /></Field>}
            </div>
          )}
          {offerError && <p className="text-sm text-rose-700">{offerError}</p>}
        </div>
        <div className="md:col-span-2">
          <Checkbox label={t('productsActiveCheck')} {...form.register('isActive')} />
        </div>
        <div className="flex justify-end gap-2 md:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('productsCancel')}
          </Button>
          <Button type="submit" variant="gold" loading={form.formState.isSubmitting}>
            {t('productsSave')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
