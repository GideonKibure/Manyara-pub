import { uid } from '@/utils/id'
import type { DayDebt, DebtPaymentStatus } from '@/types'

export function blankDebt(): DayDebt {
  return { id: uid(), customerName: '', amount: 0, products: '', paidAmount: 0, paymentStatus: 'unpaid' }
}

export function debtPaid(item: DayDebt) {
  const amount = Math.max(0, Math.floor(item.amount || 0))
  return Math.min(amount, Math.max(0, Math.floor(item.paidAmount || 0)))
}

export function debtRemaining(item: DayDebt) {
  return Math.max(0, Math.floor(item.amount || 0) - debtPaid(item))
}

export function debtStatus(item: DayDebt): DebtPaymentStatus {
  if (debtPaid(item) <= 0) return 'unpaid'
  if (item.paymentStatus === 'approved') return 'approved'
  return 'pending'
}

export function debtOutstanding(item: DayDebt) {
  return debtRemaining(item)
}

export function hasPendingDebtPayment(item: DayDebt) {
  return debtStatus(item) === 'pending'
}

export function setDebtPayment(item: DayDebt, paidAmount: number, asAdmin = false): DayDebt {
  const amount = Math.max(0, Math.floor(item.amount || 0))
  const paid = Math.min(amount, Math.max(0, Math.floor(paidAmount || 0)))
  if (paid <= 0) {
    return { ...item, amount, paidAmount: 0, paymentStatus: 'unpaid', paidApprovedAmount: undefined }
  }
  if (asAdmin) {
    return { ...item, amount, paidAmount: paid, paymentStatus: 'approved', paidApprovedAmount: paid }
  }
  if (item.paymentStatus === 'approved' && paid === (item.paidApprovedAmount ?? paid)) {
    return { ...item, amount, paidAmount: paid, paymentStatus: 'approved', paidApprovedAmount: paid }
  }
  return { ...item, amount, paidAmount: paid, paymentStatus: 'pending' }
}

export function applyDebtPaymentReview(item: DayDebt, approve: boolean): DayDebt {
  if (!approve) return setDebtPayment(item, 0)
  const paid = debtPaid(item)
  if (paid <= 0) return { ...item, paymentStatus: 'unpaid', paidAmount: 0, paidApprovedAmount: undefined }
  return { ...item, paidAmount: paid, paymentStatus: 'approved', paidApprovedAmount: paid }
}

export function approvePendingDebts(items: DayDebt[]) {
  return items.map((item) => (debtPaid(item) > 0 ? applyDebtPaymentReview(item, true) : item))
}
