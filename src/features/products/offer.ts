import type { Product, ProductSizeName, SalePortion, SaleSize, SizeOffer } from '@/types'

export const SIZE_ORDER: ProductSizeName[] = ['small', 'medium', 'big']

export interface SizeDraft {
  enabled: boolean
  cost: number | null
  price: number | null
  cupPrice: number | null
  halfPrice: number | null
}

export interface OfferDraft {
  sizeMode: 'one' | 'many'
  costPrice: number | null
  sellingPrice: number | null
  sellByCup: boolean
  sellByHalf: boolean
  cupPrice: number | null
  halfPrice: number | null
  sizes: Record<ProductSizeName, SizeDraft>
}

export interface SaleChoice {
  sizeName: SaleSize
  portion: SalePortion
  price: number
}

const emptySize = (): SizeDraft => ({ enabled: false, cost: null, price: null, cupPrice: null, halfPrice: null })

export function emptyOfferDraft(): OfferDraft {
  return {
    sizeMode: 'one',
    costPrice: null,
    sellingPrice: null,
    sellByCup: false,
    sellByHalf: false,
    cupPrice: null,
    halfPrice: null,
    sizes: { small: emptySize(), medium: emptySize(), big: emptySize() },
  }
}

export function offerDraftFrom(product: Product | null): OfferDraft {
  const draft = emptyOfferDraft()
  if (!product) return draft
  draft.costPrice = product.costPrice
  draft.sellingPrice = product.sellingPrice
  if (product.sizeMode !== 'many') {
    draft.sellByCup = product.cupPrice != null
    draft.sellByHalf = product.halfPrice != null
    draft.cupPrice = product.cupPrice
    draft.halfPrice = product.halfPrice
    return draft
  }
  draft.sizeMode = 'many'
  draft.sellByCup = product.sizes.some((size) => size.cupPrice != null)
  draft.sellByHalf = product.sizes.some((size) => size.halfPrice != null)
  for (const size of product.sizes) {
    draft.sizes[size.name] = { enabled: true, cost: size.cost, price: size.price, cupPrice: size.cupPrice, halfPrice: size.halfPrice }
  }
  return draft
}

function whole(value: number | null) {
  return value != null && Number.isInteger(value) && value >= 0 && value <= 100_000_000
}

export function compileOffer(input: OfferDraft): { ok: true; costPrice: number; sellingPrice: number; sizeMode: 'one' | 'many'; sizes: SizeOffer[]; cupPrice: number | null; halfPrice: number | null } | { ok: false; error: string } {
  if (input.sizeMode === 'one') {
    if (!whole(input.costPrice)) return { ok: false, error: 'Enter the cost price.' }
    if (!whole(input.sellingPrice)) return { ok: false, error: 'Enter the selling price.' }
    if (input.sellByCup && !whole(input.cupPrice)) return { ok: false, error: 'Enter the cup price.' }
    if (input.sellByHalf && !whole(input.halfPrice)) return { ok: false, error: 'Enter the half price.' }
    return {
      ok: true,
      sizeMode: 'one',
      costPrice: input.costPrice ?? 0,
      sellingPrice: input.sellingPrice ?? 0,
      sizes: [],
      cupPrice: input.sellByCup ? input.cupPrice : null,
      halfPrice: input.sellByHalf ? input.halfPrice : null,
    }
  }
  const sizes = SIZE_ORDER.filter((name) => input.sizes[name].enabled).map((name) => input.sizes[name])
  if (!sizes.length) return { ok: false, error: 'Choose at least one size.' }
  for (const size of sizes) {
    if (!whole(size.cost)) return { ok: false, error: 'Enter the cost price for each size.' }
    if (!whole(size.price)) return { ok: false, error: 'Enter the selling price for each size.' }
    if (input.sellByCup && !whole(size.cupPrice)) return { ok: false, error: 'Enter the cup price for each size.' }
    if (input.sellByHalf && !whole(size.halfPrice)) return { ok: false, error: 'Enter the half price for each size.' }
  }
  const saved: SizeOffer[] = SIZE_ORDER.filter((name) => input.sizes[name].enabled).map((name) => ({
    name,
    cost: input.sizes[name].cost ?? 0,
    price: input.sizes[name].price ?? 0,
    cupPrice: input.sellByCup ? input.sizes[name].cupPrice : null,
    halfPrice: input.sellByHalf ? input.sizes[name].halfPrice : null,
  }))
  return { ok: true, sizeMode: 'many', costPrice: saved[0]?.cost ?? 0, sellingPrice: saved[0]?.price ?? 0, sizes: saved, cupPrice: null, halfPrice: null }
}

export function ensureProduct<T extends Partial<Product> & Pick<Product, 'sellingPrice'>>(product: T): T & Pick<Product, 'sizeMode' | 'sizes' | 'cupPrice' | 'halfPrice'> {
  const sizeMode = product.sizeMode === 'many' ? 'many' : 'one'
  const fallbackCost = typeof product.costPrice === 'number' ? product.costPrice : 0
  const sizes = sizeMode === 'many' && Array.isArray(product.sizes)
    ? product.sizes.flatMap((size) => {
        if (size?.name !== 'small' && size?.name !== 'medium' && size?.name !== 'big') return []
        const cost = typeof size.cost === 'number' && Number.isInteger(size.cost) && size.cost >= 0 ? size.cost : fallbackCost
        return [{ name: size.name, cost, price: size.price, cupPrice: size.cupPrice ?? null, halfPrice: size.halfPrice ?? null }]
      })
    : []
  return {
    ...product,
    sizeMode,
    sizes,
    cupPrice: sizeMode === 'one' && typeof product.cupPrice === 'number' ? product.cupPrice : null,
    halfPrice: sizeMode === 'one' && typeof product.halfPrice === 'number' ? product.halfPrice : null,
  }
}

export function saleOptions(product: Product): SaleChoice[] {
  const ready = ensureProduct(product)
  if (ready.sizeMode !== 'many') {
    const options: SaleChoice[] = [{ sizeName: 'one', portion: 'full', price: ready.sellingPrice }]
    if (ready.cupPrice != null) options.push({ sizeName: 'one', portion: 'cup', price: ready.cupPrice })
    if (ready.halfPrice != null) options.push({ sizeName: 'one', portion: 'half', price: ready.halfPrice })
    return options
  }
  return ready.sizes.flatMap((size) => {
    const options: SaleChoice[] = [{ sizeName: size.name, portion: 'full', price: size.price }]
    if (size.cupPrice != null) options.push({ sizeName: size.name, portion: 'cup', price: size.cupPrice })
    if (size.halfPrice != null) options.push({ sizeName: size.name, portion: 'half', price: size.halfPrice })
    return options
  })
}

export function sizeCost(product: Product, sizeName?: string) {
  const ready = ensureProduct(product)
  if (ready.sizeMode !== 'many') return ready.costPrice
  return ready.sizes.find((size) => size.name === sizeName)?.cost ?? ready.costPrice
}

export function portionPrice(product: Product, sizeName?: string, portion?: string) {
  const choice = saleOptions(product).find((item) => item.sizeName === (sizeName || 'one') && item.portion === (portion === 'cup' || portion === 'half' ? portion : 'full'))
  return choice?.price ?? null
}
