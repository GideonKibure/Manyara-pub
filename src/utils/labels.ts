import type { ApprovalStatus, PaymentMethod, PricingMode, StockLevel } from '@/types'

export function statusLabel(status: ApprovalStatus) {
  if (status === 'pending') return 'Pending'
  if (status === 'approved') return 'Approved'
  if (status === 'rejected') return 'Rejected'
  return 'Cancelled'
}

export function stockLabel(level: StockLevel) {
  if (level === 'low') return 'Low stock'
  if (level === 'out') return 'Out of stock'
  return 'In stock'
}

export function paymentLabel(method: PaymentMethod) {
  if (method === 'mobile_money') return 'Mobile money'
  if (method === 'card') return 'Card'
  if (method === 'other') return 'Other'
  return 'Cash'
}

export function pricingLabel(mode: PricingMode) {
  if (mode === 'per_game') return 'Per game'
  if (mode === 'per_session') return 'Per session'
  if (mode === 'per_play') return 'Per play'
  return 'Flat amount'
}

export function saleTotal(items: Array<{ quantity: number; unitPrice: number }>) {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
}

export function billBalance(sale: { items: Array<{ quantity: number; unitPrice: number }>; amountPaid?: number }) {
  return Math.max(0, saleTotal(sale.items) - (sale.amountPaid ?? 0))
}

export function recordedTotal(sale: { items: Array<{ quantity: number; unitPrice: number }>; settledAmount?: number }) {
  return typeof sale.settledAmount === 'number' ? sale.settledAmount : saleTotal(sale.items)
}

export function saleCost(items: Array<{ quantity: number; unitCost: number }>) {
  return items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0)
}

export function stockInTotal(items: Array<{ totalCost: number }>) {
  return items.reduce((sum, item) => sum + item.totalCost, 0)
}

export function stockInUnits(items: Array<{ stockQuantity: number }>) {
  return items.reduce((sum, item) => sum + item.stockQuantity, 0)
}
