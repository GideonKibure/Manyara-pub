import type { DayDebt } from '@/types'

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
  const sales = rows.reduce((sum, row) => sum + row.amount, 0)
  const cogs = rows.reduce((sum, row) => sum + (row.amount - row.profit), 0)
  const gross = sales - cogs
  const debtTotal = debts.reduce((sum, row) => sum + row.amount, 0)
  const collections = sales - debtTotal
  const cash = collections - mobile
  return { sales, cogs, gross, expenses, debtTotal, collections, mobile, cash, net: gross - expenses }
}
