import type { SalesTransaction } from '@/types'

export const UNPAID_BILL_HOLD_MS = 3 * 24 * 60 * 60 * 1000

export function unpaidBillHeld(sale: Pick<SalesTransaction, 'status' | 'recordKind' | 'paymentStatus' | 'submittedAt' | 'generatedAt'>, at = Date.now()) {
  if (sale.status !== 'pending' || sale.recordKind !== 'bill' || sale.paymentStatus === 'paid') return false
  const saved = new Date(sale.submittedAt || sale.generatedAt).getTime()
  return Number.isFinite(saved) && at - saved < UNPAID_BILL_HOLD_MS
}

export function pendingForAdmin(sale: SalesTransaction) {
  return sale.status === 'pending' && sale.recordKind !== 'bill'
}

export function overdueUnpaidBill(_sale: SalesTransaction, _at = Date.now()) {
  return false
}
