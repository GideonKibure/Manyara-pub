import { setDebtPayment } from '@/features/dayClose/debts'
import type { ActionResult, DayClose, DayDebt } from '@/types'
import { uid } from '@/utils/id'

function customerKey(name: string) {
  return name.trim().toLowerCase()
}

export async function syncDayBillToCogs(
  app: {
    user?: { id: string } | null
    dayCloses?: DayClose[]
    saveDayClose: (input: {
      day: string
      remainingSaleId?: string
      debts: DayDebt[]
      mobileReceived: number
      expenseTotal?: number
      lines?: DayClose['lines']
      expenseItems?: DayClose['expenseItems']
      mobileItems?: DayClose['mobileItems']
    }) => Promise<ActionResult>
    setDayCloseDebtPayment?: (
      closeId: string,
      debtId: string,
      paidAmount: number,
      details?: { customerName?: string; amount?: number; products?: string },
    ) => Promise<ActionResult>
  },
  input: { day: string; customerName: string; amount: number; paidAmount: number; products?: string },
): Promise<ActionResult> {
  const owner = app.user?.id
  if (!owner) return { ok: false, error: 'You are not signed in.' }
  const close = (app.dayCloses ?? []).find((item) => item.day === input.day && item.submittedBy === owner)
  const details = {
    customerName: input.customerName.trim(),
    amount: input.amount,
    products: (input.products ?? '').trim(),
  }
  if (close && app.setDayCloseDebtPayment) {
    const debt = close.debts.find((item) => customerKey(item.customerName) === customerKey(input.customerName))
    return app.setDayCloseDebtPayment(close.id, debt?.id ?? '', input.paidAmount, details)
  }
  const debts = [...(close?.debts ?? [])]
  const index = debts.findIndex((item) => customerKey(item.customerName) === customerKey(input.customerName))
  const base: DayDebt = index >= 0
    ? debts[index]
    : {
        id: uid(),
        customerName: details.customerName,
        amount: input.amount,
        products: details.products,
        paidAmount: 0,
        paymentStatus: 'unpaid',
      }
  const next = setDebtPayment({ ...base, amount: Math.max(base.amount, input.amount) }, input.paidAmount)
  if (index >= 0) debts[index] = next
  else debts.push(next)
  return app.saveDayClose({
    day: input.day,
    remainingSaleId: close?.remainingSaleId,
    debts,
    mobileReceived: close?.mobileReceived ?? 0,
    expenseTotal: close?.expenseTotal ?? 0,
    lines: close?.lines ?? [],
    expenseItems: close?.expenseItems ?? [],
    mobileItems: close?.mobileItems ?? [],
  })
}
