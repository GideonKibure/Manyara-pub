import type { DayDebt } from '@/types'
import { debtOutstanding } from '@/features/dayClose/debts'

export interface CogsTotals {
  sales: number
  cogs: number
  gross: number
  expenses: number
  debtTotal: number
  collections: number
  mobile: number
  cash: number
  net: number
}

export function cogsTotals(rows: Array<{ amount: number; profit: number }>, expenses: number, debts: DayDebt[], mobile: number): CogsTotals {
  const sales = Math.round(rows.reduce((sum, row) => sum + row.amount, 0))
  const cogs = Math.round(rows.reduce((sum, row) => sum + (row.amount - row.profit), 0))
  const gross = sales - cogs
  const debtTotal = debts.reduce((sum, row) => sum + debtOutstanding(row), 0)
  const collections = sales - debtTotal
  const mobileSafe = Math.max(0, Math.round(mobile || 0))
  const expenseSafe = Math.max(0, Math.round(expenses || 0))
  const cash = collections - mobileSafe
  return { sales, cogs, gross, expenses: expenseSafe, debtTotal, collections, mobile: mobileSafe, cash, net: gross - expenseSafe }
}
