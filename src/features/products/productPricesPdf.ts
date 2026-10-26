import { SIZE_ORDER } from '@/features/products/offer'
import type { Category, Product } from '@/types'
import { dateKey, formatDate } from '@/utils/dates'
import { downloadStyledPdf } from '@/utils/pdf'

const dash = '—'

export function downloadProductPricesPdf(input: {
  products: Product[]
  categories: Category[]
  money: (value: number) => string
  business: string
  title: string
  tableTitle: string
  productHeader: string
  categoryHeader: string
  sizeHeader: string
  buyingHeader: string
  sellingHeader: string
  oneSize: string
  sizeSmall: string
  sizeMedium: string
  sizeBig: string
  cupLabel: string
  halfLabel: string
  activeLabel: string
  inactiveLabel: string
  productsLabel: string
  emptyNote: string
}) {
  const sizeName = {
    small: input.sizeSmall,
    medium: input.sizeMedium,
    big: input.sizeBig,
  } as const
  const categoryOf = (id: string) => input.categories.find((item) => item.id === id)?.name ?? dash
  const sorted = [...input.products].sort((a, b) => {
    const category = categoryOf(a.categoryId).localeCompare(categoryOf(b.categoryId))
    return category || a.name.localeCompare(b.name)
  })

  const rows: string[][] = []
  for (const product of sorted) {
    const category = categoryOf(product.categoryId)
    const status = product.isActive ? input.activeLabel : input.inactiveLabel
    const name = product.sku ? `${product.name} (${product.sku})` : product.name
    const label = `${name} · ${status}`
    if (product.sizeMode === 'many') {
      for (const key of SIZE_ORDER) {
        const size = product.sizes.find((item) => item.name === key)
        if (!size) continue
        rows.push([label, category, sizeName[key], input.money(size.cost), input.money(size.price)])
        if (size.cupPrice != null) {
          rows.push([label, category, `${sizeName[key]} · ${input.cupLabel}`, input.money(size.cost), input.money(size.cupPrice)])
        }
        if (size.halfPrice != null) {
          rows.push([label, category, `${sizeName[key]} · ${input.halfLabel}`, input.money(size.cost), input.money(size.halfPrice)])
        }
      }
    } else {
      rows.push([label, category, input.oneSize, input.money(product.costPrice), input.money(product.sellingPrice)])
      if (product.cupPrice != null) {
        rows.push([label, category, input.cupLabel, input.money(product.costPrice), input.money(product.cupPrice)])
      }
      if (product.halfPrice != null) {
        rows.push([label, category, input.halfLabel, input.money(product.costPrice), input.money(product.halfPrice)])
      }
    }
  }

  const today = dateKey()
  downloadStyledPdf(`manyara-product-prices-${today}.pdf`, {
    title: input.title,
    subtitle: input.business,
    dateLabel: formatDate(today),
    landscape: true,
    kpis: [{ label: input.productsLabel, value: String(input.products.length) }],
    tables: [
      {
        title: input.tableTitle,
        columns: [
          { header: input.productHeader, width: 0.34 },
          { header: input.categoryHeader, width: 0.18 },
          { header: input.sizeHeader, width: 0.16 },
          { header: input.buyingHeader, width: 0.16, align: 'right' },
          { header: input.sellingHeader, width: 0.16, align: 'right' },
        ],
        rows: rows.length ? rows : [[input.emptyNote, '', '', '', '']],
      },
    ],
  })
}
