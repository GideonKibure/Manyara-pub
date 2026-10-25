import { isRemainingCountSale } from '@/features/dayClose/billedSold'
import { datedItemMoney } from '@/features/reports/metrics'
import type { CogsLine, DayClose, Product, ProductPriceChange, SalesTransaction, StockInTransaction } from '@/types'
import { asDateKey } from '@/utils/dates'
import { billBalance, stockInUnits } from '@/utils/labels'

export function employeeDaySales(
  sales: SalesTransaction[],
  dayCloses: DayClose[],
  products: Product[],
  priceChanges: ProductPriceChange[],
  userId: string,
  day: string,
) {
  const close = dayCloses.find((item) => item.day === day && item.submittedBy === userId && (item.lines?.length ?? 0) > 0)
  const unpaidBills = () => {
    let bills = 0
    for (const sale of sales) {
      if (sale.submittedBy !== userId) continue
      if (sale.status === 'rejected' || sale.status === 'cancelled') continue
      if (sale.recordKind !== 'bill' || sale.paymentStatus === 'paid') continue
      if (asDateKey(sale.generatedAt || sale.submittedAt) !== day) continue
      bills += billBalance(sale)
    }
    return bills
  }
  if (close?.lines?.length) {
    return {
      sales: close.lines.reduce((sum, line) => sum + line.amount, 0),
      soldUnits: close.lines.reduce((sum, line) => sum + line.sold, 0),
      bills: unpaidBills(),
      fromCogs: true,
      lines: close.lines as CogsLine[],
    }
  }

  let salesTotal = 0
  let soldUnits = 0
  let bills = 0
  for (const sale of sales) {
    if (sale.submittedBy !== userId) continue
    if (sale.status === 'rejected' || sale.status === 'cancelled') continue
    if (isRemainingCountSale(sale)) continue
    if (asDateKey(sale.generatedAt || sale.submittedAt) !== day) continue
    const units = sale.items.reduce((sum, item) => sum + item.quantity, 0)
    if (sale.recordKind === 'bill' && sale.paymentStatus !== 'paid') {
      bills += billBalance(sale)
      soldUnits += units
      continue
    }
    if (sale.status !== 'approved') continue
    soldUnits += units
    if (typeof sale.settledAmount === 'number') {
      salesTotal += sale.settledAmount
      continue
    }
    salesTotal += sale.items.reduce((sum, item) => sum + datedItemMoney({ products, priceChanges }, item, day).revenue, 0)
  }
  return { sales: salesTotal, soldUnits, bills, fromCogs: false, lines: [] as CogsLine[] }
}

export function employeeDayStockIn(stockIns: StockInTransaction[], userId: string, day: string) {
  return stockIns
    .filter((entry) => entry.submittedBy === userId && entry.status === 'approved' && entry.deliveryDate === day)
    .reduce((sum, entry) => sum + stockInUnits(entry.items), 0)
}
