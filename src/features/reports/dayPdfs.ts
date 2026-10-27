import { cogsTotals } from '@/features/dayClose/cogs'
import { debtPaid, debtRemaining, debtStatus } from '@/features/dayClose/debts'
import type { MessageKey } from '@/i18n/messages'
import type { CogsExpenseLine, CogsLine, CogsMobileItem, DayDebt } from '@/types'
import { formatDate } from '@/utils/dates'
import { downloadStyledPdf } from '@/utils/pdf'

const dash = '—'

function qty(value: number) {
  const rounded = Math.round(value * 2) / 2
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
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
  nameHeader: string
  productsHeader: string
  openingHeader: string
  leftHeader: string
  soldHeader: string
  salesHeader: string
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
  grossHeader: string
  cashHeader: string
  totalLabel: string
  expenseTotalLabel: string
  lipaTotalLabel: string
  totalType: string
  paidLabel: string
  pendingLabel: string
  unpaidLabel: string
  approvedLabel: string
  pendingStamp: string
}) {
  const expenseTotal = input.expenseTotal ?? (input.expenses ?? []).reduce((sum, item) => sum + (item.amount || 0), 0)
  const mobile = input.mobile ?? (input.mobileItems ?? []).reduce((sum, item) => sum + (item.amount || 0), 0)
  const products = [...input.rows]
    .filter((item) => item.sold > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
  const totals = cogsTotals(products, expenseTotal, input.debts, mobile)
  const remainingUnits = products.reduce((sum, row) => sum + row.remaining, 0)
  const soldUnits = products.reduce((sum, row) => sum + row.sold, 0)
  const openingUnits = remainingUnits + soldUnits
  const expenses = (input.expenses ?? []).filter((item) => item.description || item.amount)
  const debts = input.debts.filter((item) => (item.amount || 0) > 0)
  const mobileItems = (input.mobileItems ?? []).filter((item) => item.amount)

  const tables = [
    {
      title: input.soldType,
      columns: [
        { header: input.nameHeader, width: 0.28 },
        { header: input.openingHeader, width: 0.12, align: 'right' as const },
        { header: input.leftHeader, width: 0.12, align: 'right' as const },
        { header: input.soldHeader, width: 0.12, align: 'right' as const },
        { header: input.salesHeader, width: 0.12, align: 'right' as const },
        { header: input.costHeader, width: 0.12, align: 'right' as const },
        { header: input.profitHeader, width: 0.12, align: 'right' as const },
      ],
      rows: [
        ...products.map((row) => [
          row.name,
          qty(row.remaining + row.sold),
          qty(row.remaining),
          qty(row.sold),
          input.money(row.amount),
          input.money(row.amount - row.profit),
          input.money(row.profit),
        ]),
        [
          input.totalLabel,
          qty(openingUnits),
          qty(remainingUnits),
          qty(soldUnits),
          input.money(totals.sales),
          input.money(totals.cogs),
          input.money(totals.gross),
        ],
      ],
    },
  ]

  if (expenses.length) {
    tables.push({
      title: input.expenseType,
      columns: [
        { header: input.nameHeader, width: 0.46 },
        { header: input.notesHeader, width: 0.34 },
        { header: input.amountHeader, width: 0.2, align: 'right' as const },
      ],
      rows: [
        ...expenses.map((item) => [item.description || dash, item.notes || dash, input.money(item.amount || 0)]),
        [input.expenseTotalLabel, dash, input.money(totals.expenses)],
      ],
    })
  }

  if (debts.length) {
    tables.push({
      title: input.billType,
      columns: [
        { header: input.nameHeader, width: 0.22 },
        { header: input.productsHeader, width: 0.22 },
        { header: input.amountHeader, width: 0.14, align: 'right' as const },
        { header: input.paidHeader, width: 0.14, align: 'right' as const },
        { header: input.balanceHeader, width: 0.14, align: 'right' as const },
        { header: input.statusHeader, width: 0.14 },
      ],
      rows: debts.map((item) => {
        const status = debtStatus(item)
        return [
          item.customerName.trim() || dash,
          item.products.trim() || dash,
          input.money(item.amount),
          input.money(debtPaid(item)),
          input.money(debtRemaining(item)),
          status === 'approved' ? input.paidLabel : status === 'pending' ? input.pendingLabel : input.unpaidLabel,
        ]
      }),
    })
  }

  if (mobileItems.length) {
    tables.push({
      title: input.lipaType,
      columns: [
        { header: input.nameHeader, width: 0.7 },
        { header: input.amountHeader, width: 0.3, align: 'right' as const },
      ],
      rows: [
        ...mobileItems.map((item) => [item.date ? formatDate(item.date) : dash, input.money(item.amount)]),
        [input.lipaTotalLabel, input.money(totals.mobile)],
      ],
    })
  }

  tables.push({
    title: input.tableTitle,
    columns: [
      { header: input.nameHeader, width: 0.62 },
      { header: input.amountHeader, width: 0.38, align: 'right' as const },
    ],
    rows: [
      [input.soldType, input.money(totals.sales)],
      [input.costHeader, input.money(totals.cogs)],
      [input.grossHeader, input.money(totals.gross)],
      [input.expenseType, input.money(totals.expenses)],
      [input.billType, input.money(totals.debtTotal)],
      [input.lipaType, input.money(totals.mobile)],
      [input.cashHeader, input.money(totals.cash)],
      [input.totalType, input.money(totals.net)],
    ],
  })

  downloadStyledPdf(`cogs-${input.day}.pdf`, {
    title: input.title,
    subtitle: `${input.business}${input.staff ? ` · ${input.staff}` : ''}`,
    dateLabel: formatDate(input.day),
    stamp: input.approved ? input.approvedLabel.toUpperCase() : input.pendingStamp.toUpperCase(),
    kpis: [
      { label: input.soldType, value: input.money(totals.sales) },
      { label: input.costHeader, value: input.money(totals.cogs) },
      { label: input.grossHeader, value: input.money(totals.gross) },
      { label: input.totalType, value: input.money(totals.net) },
    ],
    tables,
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
    nameHeader: t('cogsPdfName'),
    productsHeader: t('cogsDebtProducts'),
    openingHeader: t('remainOpening'),
    leftHeader: t('remainLeft'),
    soldHeader: t('remainQty'),
    salesHeader: t('remainRevenue'),
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
    grossHeader: t('cogsGross'),
    cashHeader: t('cogsCash'),
    totalLabel: t('cogsPdfTotal'),
    expenseTotalLabel: t('cogsExpenseTotal'),
    lipaTotalLabel: t('cogsLipaTotal'),
    totalType: t('cogsNet'),
    paidLabel: t('cogsDebtPaid'),
    pendingLabel: t('cogsDebtAwaiting'),
    unpaidLabel: t('cogsDebtUnpaid'),
    approvedLabel: t('statusApproved'),
    pendingStamp: t('statusPending'),
  }
}
