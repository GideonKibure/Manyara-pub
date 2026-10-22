import type { Product, StockInTransaction } from '@/types'

export function stockInProductNames(record: StockInTransaction, products: Product[]) {
  const seen = new Set<string>()
  const names: string[] = []
  for (const item of record.items) {
    const name = products.find((product) => product.id === item.productId)?.name?.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }
  return names
}

export function stockInMatchesQuery(record: StockInTransaction, products: Product[], query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const names = stockInProductNames(record, products).join(' ')
  const haystack = `${record.code} ${record.supplierName} ${record.invoiceRef} ${record.notes} ${names}`.toLowerCase()
  return haystack.includes(needle)
}
