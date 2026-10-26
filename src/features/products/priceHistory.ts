import { ensureProduct } from '@/features/products/offer'
import type { CogsLine, Product, ProductPriceChange, SizeOffer } from '@/types'
import { roundBuyingPrice } from '@/utils/money'

export function applyCurrentPrices(product: Product, cost: number, selling: number, sizes?: SizeOffer[]): Product {
  const ready = ensureProduct(product)
  if (sizes?.length) {
    const nextSizes = sizes.map((size) => ({
      ...size,
      cost: roundBuyingPrice(size.cost),
      price: Math.round(size.price),
    }))
    return ensureProduct({
      ...ready,
      sizeMode: 'many',
      costPrice: nextSizes[0]?.cost ?? cost,
      sellingPrice: nextSizes[0]?.price ?? selling,
      sizes: nextSizes,
    })
  }
  if (ready.sizeMode === 'many' && ready.sizes.length) {
    return {
      ...ready,
      costPrice: cost,
      sellingPrice: selling,
      sizes: ready.sizes.map((size) => ({ ...size, cost, price: selling })),
    }
  }
  return { ...ready, costPrice: cost, sellingPrice: selling }
}

export function lineMatchesProduct(line: CogsLine, product: Product) {
  if (line.productId && line.productId === product.id) return true
  return line.name.trim().toLowerCase() === product.name.trim().toLowerCase()
}

export function repriceCogsLine(line: CogsLine, product: Product, cost: number, selling: number): CogsLine {
  const sold = Number.isFinite(line.sold) ? line.sold : 0
  return {
    ...line,
    productId: line.productId || product.id,
    amount: Math.round(sold * selling),
    profit: Math.round(sold * (selling - cost)),
  }
}

export function nextPriceChangeDate(changes: ProductPriceChange[], productId: string, day: string) {
  const later = changes
    .filter((item) => item.productId === productId && item.effectiveDate > day)
    .map((item) => item.effectiveDate)
    .sort()
  return later[0]
}

export function latestPriceChange(changes: ProductPriceChange[], productId: string) {
  return [...changes]
    .filter((item) => item.productId === productId)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.createdAt.localeCompare(b.createdAt))
    .at(-1)
}

export function pricesOnDay(product: Product, changes: ProductPriceChange[] | undefined, day: string) {
  const applicable = (changes ?? [])
    .filter((item) => item.productId === product.id && item.effectiveDate <= day)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.createdAt.localeCompare(b.createdAt))
  const hit = applicable.at(-1)
  if (hit) return { costPrice: hit.costPrice, sellingPrice: hit.sellingPrice, dated: true as const }
  return { costPrice: product.costPrice, sellingPrice: product.sellingPrice, dated: false as const }
}

export function repriceDayCloses<T extends { day: string; lines: CogsLine[] }>(
  dayCloses: T[],
  product: Product,
  day: string,
  cost: number,
  selling: number,
  until?: string,
) {
  let updated = 0
  const next = dayCloses.map((close) => {
    if (close.day < day) return close
    if (until && close.day >= until) return close
    let touched = false
    const lines = (close.lines ?? []).map((line) => {
      if (!lineMatchesProduct(line, product)) return line
      touched = true
      return repriceCogsLine(line, product, cost, selling)
    })
    if (!touched) return close
    updated += 1
    return { ...close, lines }
  })
  return { dayCloses: next, updated }
}
