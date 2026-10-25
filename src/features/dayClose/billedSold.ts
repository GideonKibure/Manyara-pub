import type { SalesTransaction } from '@/types'
import { asDateKey } from '@/utils/dates'

export function isRemainingCountSale(sale: SalesTransaction) {
  return (sale.notes ?? '').trim() === 'Remaining stock count'
}

export function billedSoldQty(sales: SalesTransaction[], productId: string, day: string, userId?: string) {
  return sales.reduce((sum, sale) => {
    if (userId && sale.submittedBy !== userId) return sum
    if (sale.status === 'rejected' || sale.status === 'cancelled') return sum
    if (isRemainingCountSale(sale)) return sum
    if (!sale.items.length) return sum
    if (asDateKey(sale.generatedAt || sale.submittedAt) !== day) return sum
    return sum + sale.items.reduce((line, item) => (item.productId === productId ? line + item.quantity : line), 0)
  }, 0)
}
