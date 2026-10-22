import type { Product, StockInTransaction } from '@/types'
import { formatDate } from '@/utils/dates'
import { stockInTotal, stockInUnits } from '@/utils/labels'
import { downloadStyledPdf } from '@/utils/pdf'

export function approvedStockIns(records: StockInTransaction[]) {
  return [...records]
    .filter((item) => item.status === 'approved')
    .sort((a, b) => {
      const byEntered = a.submittedAt.localeCompare(b.submittedAt)
      if (byEntered) return byEntered
      return `${a.deliveryDate}${a.code}`.localeCompare(`${b.deliveryDate}${b.code}`)
    })
}

export function downloadApprovedStockInPdf(input: {
  records: StockInTransaction[]
  products: Product[]
  money: (value: number) => string
  nameOf: (id?: string) => string
  business: string
  title: string
  deliveriesTitle: string
  linesTitle: string
  productsTitle: string
  dateHeader: string
  codeHeader: string
  productHeader: string
  qtyHeader: string
  costHeader: string
  supplierHeader: string
  invoiceHeader: string
  employeeHeader: string
  deliveriesLabel: string
  unitsLabel: string
  costLabel: string
  emptyNote: string
}) {
  const rows = approvedStockIns(input.records)
  const lineRows: string[][] = []
  const productMap = new Map<string, { name: string; units: number; cost: number }>()
  for (const entry of rows) {
    for (const item of entry.items) {
      const product = input.products.find((row) => row.id === item.productId)
      const name = product?.name ?? 'Product'
      lineRows.push([
        formatDate(entry.deliveryDate),
        entry.code,
        name,
        String(item.stockQuantity),
        input.money(item.totalCost),
        entry.supplierName,
      ])
      const current = productMap.get(item.productId) ?? { name, units: 0, cost: 0 }
      current.units += item.stockQuantity
      current.cost += item.totalCost
      productMap.set(item.productId, current)
    }
  }
  const units = rows.reduce((sum, entry) => sum + stockInUnits(entry.items), 0)
  const cost = rows.reduce((sum, entry) => sum + stockInTotal(entry.items), 0)
  const first = rows[0]
  const last = rows.at(-1)
  const period = first && last ? `${formatDate(first.deliveryDate)} – ${formatDate(last.deliveryDate)}` : formatDate(new Date().toISOString())
  downloadStyledPdf(`manyara-stock-in-approved.pdf`, {
    title: input.title,
    subtitle: input.business,
    dateLabel: period,
    stamp: String(rows.length),
    kpis: [
      { label: input.deliveriesLabel, value: String(rows.length) },
      { label: input.unitsLabel, value: String(units) },
      { label: input.costLabel, value: input.money(cost) },
    ],
    charts: [
      {
        title: input.productsTitle,
        bars: [...productMap.values()]
          .sort((a, b) => b.units - a.units)
          .slice(0, 6)
          .map((row) => ({ label: row.name, value: row.units, caption: `${row.units}  ${input.money(row.cost)}` })),
      },
    ],
    tables: [
      {
        title: input.deliveriesTitle,
        columns: [
          { header: input.dateHeader, width: 0.16 },
          { header: input.codeHeader, width: 0.14 },
          { header: input.supplierHeader, width: 0.22 },
          { header: input.invoiceHeader, width: 0.16 },
          { header: input.employeeHeader, width: 0.16 },
          { header: input.costHeader, width: 0.16, align: 'right' },
        ],
        rows: rows.map((entry) => [
          formatDate(entry.deliveryDate),
          entry.code,
          entry.supplierName,
          entry.invoiceRef || '—',
          input.nameOf(entry.submittedBy),
          input.money(stockInTotal(entry.items)),
        ]),
      },
      {
        title: input.linesTitle,
        columns: [
          { header: input.dateHeader, width: 0.16 },
          { header: input.codeHeader, width: 0.14 },
          { header: input.productHeader, width: 0.28 },
          { header: input.qtyHeader, width: 0.12, align: 'right' },
          { header: input.costHeader, width: 0.14, align: 'right' },
          { header: input.supplierHeader, width: 0.16 },
        ],
        rows: lineRows,
      },
    ],
    notes: rows.length ? undefined : [input.emptyNote],
  })
}
