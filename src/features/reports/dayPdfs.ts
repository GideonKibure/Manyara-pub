import { cogsTotals } from '@/features/dayClose/cogs'
import { debtPaid, debtRemaining, debtStatus } from '@/features/dayClose/debts'
import type { MessageKey } from '@/i18n/messages'
import type { CogsExpenseLine, CogsLine, CogsMobileItem, DayDebt } from '@/types'
import { formatDate } from '@/utils/dates'
import { downloadStyledPdf } from '@/utils/pdf'

const dash = '—'

function qty(value: number | null | undefined) {
  if (value == null) return dash
  return String(value)
}

export function downloadCogsDayPdf(input: {
  day: string
  business: string
  staff?: string
  approved?: boolean
  rows: Array<Pick<CogsLine, 'name' | 'remaining' | 'sold' | 'amount' | 'profit' | 'unitCost'>>
  expenses?: CogsExpenseLine[]
  expenseTotal?: number
  debts: DayDebt[]
  mobileItems?: CogsMobileItem[]
  mobile?: number
  money: (value: number) => string
  title: string
  tableTitle: string
  typeHeader: string
  nameHeader: string
  productsHeader: string
  leftHeader: string
  soldHeader: string
  amountHeader: string
  costHeader: string
  profitHeader: string
  paidHeader: string
  balanceHeader: string
  statusHeader: string
  notesHeader: string
  soldType: string
  expenseType: string
  billType: string
  lipaType: string
  totalType: string
  paidLabel: string
  pendingLabel: string
  unpaidLabel: string
  approvedLabel: string
  pendingStamp: string
}) {
  const expenseTotal = input.expenseTotal ?? (input.expenses ?? []).reduce((sum, item) => sum + (item.amount || 0), 0)
  const mobile = input.mobile ?? (input.mobileItems ?? []).reduce((sum, item) => sum + (item.amount || 0), 0)
  const totals = cogsTotals(input.rows, expenseTotal, input.debts, mobile)
  const table: string[][] = []

  for (const row of input.rows.filter((item) => item.sold > 0 || item.remaining > 0 || item.amount > 0)) {
    const cost = row.amount - row.profit
    table.push([
      input.soldType,
      row.name,
      dash,
      qty(row.remaining),
      qty(row.sold),
      input.money(row.amount),
      input.money(cost),
      input.money(row.profit),
      dash,
      dash,
      dash,
      row.unitCost ? input.money(row.unitCost) : dash,
    ])
  }

  for (const item of input.expenses ?? []) {
    if (!item.description && !item.amount) continue
    table.push([
      input.expenseType,
      item.description || dash,
      dash,
      dash,
      dash,
      input.money(item.amount || 0),
      dash,
      dash,
      dash,
      dash,
      dash,
      item.notes || dash,
    ])
  }

  for (const item of input.debts) {
    if ((item.amount || 0) <= 0) continue
    const status = debtStatus(item)
    table.push([
      input.billType,
      item.customerName.trim() || dash,
      item.products.trim() || dash,
      dash,
      dash,
      input.money(item.amount),
      dash,
      dash,
      input.money(debtPaid(item)),
      input.money(debtRemaining(item)),
      status === 'approved' ? input.paidLabel : status === 'pending' ? input.pendingLabel : input.unpaidLabel,
      dash,
    ])
  }

  for (const item of input.mobileItems ?? []) {
    if (!item.amount) continue
    table.push([
      input.lipaType,
      item.date ? formatDate(item.date) : dash,
      dash,
      dash,
      dash,
      input.money(item.amount),
      dash,
      dash,
      input.money(item.amount),
      dash,
      dash,
      dash,
    ])
  }

  const summary: Array<[string, number]> = [
    [input.soldType, totals.sales],
    [input.costHeader, totals.cogs],
    [input.profitHeader, totals.gross],
    [input.expenseType, totals.expenses],
    [input.billType, totals.debtTotal],
    [input.lipaType, totals.mobile],
    [input.totalType, totals.net],
  ]
  for (const [label, amount] of summary) {
    table.push([
      input.totalType,
      label,
      dash,
      dash,
      dash,
      input.money(amount),
      dash,
      dash,
      dash,
      dash,
      dash,
      dash,
    ])
  }

  downloadStyledPdf(`cogs-${input.day}.pdf`, {
    title: input.title,
    subtitle: `${input.business}${input.staff ? ` · ${input.staff}` : ''}`,
    dateLabel: formatDate(input.day),
    stamp: input.approved ? input.approvedLabel.toUpperCase() : input.pendingStamp.toUpperCase(),
    landscape: true,
    kpis: [
      { label: input.soldType, value: input.money(totals.sales) },
      { label: input.costHeader, value: input.money(totals.cogs) },
      { label: input.billType, value: input.money(totals.debtTotal) },
      { label: input.totalType, value: input.money(totals.net) },
    ],
    tables: [
      {
        title: input.tableTitle,
        columns: [
          { header: input.typeHeader, width: 0.08 },
          { header: input.nameHeader, width: 0.14 },
          { header: input.productsHeader, width: 0.12 },
          { header: input.leftHeader, width: 0.07, align: 'right' },
          { header: input.soldHeader, width: 0.07, align: 'right' },
          { header: input.amountHeader, width: 0.1, align: 'right' },
          { header: input.costHeader, width: 0.09, align: 'right' },
          { header: input.profitHeader, width: 0.09, align: 'right' },
          { header: input.paidHeader, width: 0.08, align: 'right' },
          { header: input.balanceHeader, width: 0.08, align: 'right' },
          { header: input.statusHeader, width: 0.08 },
          { header: input.notesHeader, width: 0.1 },
        ],
        rows: table,
      },
    ],
  })
}

export function downloadBillsDayPdf(input: {
  day: string
  business: string
  title: string
  tableTitle: string
  rows: Array<{
    customerName: string
    products: string
    amount: number
    paid: number
    remaining: number
    status: string
    employee: string
  }>
  money: (value: number) => string
  dateHeader: string
  customerHeader: string
  productsHeader: string
  amountHeader: string
  paidHeader: string
  remainingHeader: string
  statusHeader: string
  employeeHeader: string
  emptyNote: string
}) {
  const owed = input.rows.reduce((sum, row) => sum + row.remaining, 0)
  const billed = input.rows.reduce((sum, row) => sum + row.amount, 0)
  const paid = input.rows.reduce((sum, row) => sum + row.paid, 0)
  downloadStyledPdf(`bills-${input.day}.pdf`, {
    title: input.title,
    subtitle: input.business,
    dateLabel: formatDate(input.day),
    stamp: String(input.rows.length),
    landscape: true,
    kpis: [
      { label: input.amountHeader, value: input.money(billed) },
      { label: input.paidHeader, value: input.money(paid) },
      { label: input.remainingHeader, value: input.money(owed) },
    ],
    tables: [
      {
        title: input.tableTitle,
        columns: [
          { header: input.dateHeader, width: 0.12 },
          { header: input.customerHeader, width: 0.16 },
          { header: input.productsHeader, width: 0.18 },
          { header: input.amountHeader, width: 0.12, align: 'right' },
          { header: input.paidHeader, width: 0.12, align: 'right' },
          { header: input.remainingHeader, width: 0.12, align: 'right' },
          { header: input.statusHeader, width: 0.09 },
          { header: input.employeeHeader, width: 0.09 },
        ],
        rows: input.rows.map((row) => [
          formatDate(input.day),
          row.customerName || dash,
          row.products || dash,
          input.money(row.amount),
          input.money(row.paid),
          input.money(row.remaining),
          row.status,
          row.employee || dash,
        ]),
      },
    ],
    notes: input.rows.length ? undefined : [input.emptyNote],
  })
}

export function cogsPdfLabels(t: (key: MessageKey) => string) {
  return {
    title: t('cogsSheetTitle'),
    tableTitle: t('cogsSheetTitle'),
    typeHeader: t('cogsPdfType'),
    nameHeader: t('cogsPdfName'),
    productsHeader: t('cogsDebtProducts'),
    leftHeader: t('remainLeft'),
    soldHeader: t('remainQty'),
    amountHeader: t('cogsDebtAmount'),
    costHeader: t('cogsCost'),
    profitHeader: t('remainProfitCol'),
    paidHeader: t('cogsDebtPaidAmount'),
    balanceHeader: t('cogsDebtRemaining'),
    statusHeader: t('labelStatus'),
    notesHeader: t('cogsPdfNotes'),
    soldType: t('remainPdfSoldTitle'),
    expenseType: t('navExpenses'),
    billType: t('cogsStepDebts'),
    lipaType: t('cogsMobileTitle'),
    totalType: t('cogsNet'),
    paidLabel: t('cogsDebtPaid'),
    pendingLabel: t('cogsDebtAwaiting'),
    unpaidLabel: t('cogsDebtUnpaid'),
    approvedLabel: t('statusApproved'),
    pendingStamp: t('statusPending'),
  }
}
