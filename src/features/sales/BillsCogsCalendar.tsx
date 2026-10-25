import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Download, Receipt, X } from 'lucide-react'
import { ProductThumb } from '@/components/ProductPicker'
import { Button } from '@/components/ui/Button'
import { useApp } from '@/context/AppContext'
import { DebtPayDialog } from '@/features/dayClose/DebtCard'
import { debtPaid, debtRemaining } from '@/features/dayClose/debts'
import { downloadBillsDayPdf } from '@/features/reports/dayPdfs'
import { syncDayBillToCogs } from '@/features/sales/syncBillCogs'
import { useI18n } from '@/i18n/LanguageContext'
import type { DayDebt, Product, SalesTransaction } from '@/types'
import { cn } from '@/utils/cn'
import { asDateKey, dateKey, formatDate } from '@/utils/dates'
import { billBalance, saleTotal } from '@/utils/labels'

type BillTone = 'unpaid' | 'partial' | 'pending' | 'paid'

type DayBillRow = {
  key: string
  customerName: string
  amount: number
  paid: number
  remaining: number
  tone: BillTone
  products: string
  thumbs: Product[]
  closeId?: string
  debt?: DayDebt
  billId?: string
  locked?: boolean
  employee: string
}

function monthCells(year: number, month: number) {
  const first = new Date(year, month, 1)
  const pad = (first.getDay() + 6) % 7
  const days = new Date(year, month + 1, 0).getDate()
  const cells: Array<{ key: string; day: number } | null> = []
  for (let index = 0; index < pad; index += 1) cells.push(null)
  for (let day = 1; day <= days; day += 1) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    cells.push({ key, day })
  }
  while (cells.length % 7) cells.push(null)
  return cells
}

function customerKey(name: string) {
  return name.trim().toLowerCase()
}

function productMatches(text: string, products: Product[]) {
  const tokens = text
    .split(/[,;/|]+/)
    .map((item) => item.trim())
    .filter(Boolean)
  const found: Product[] = []
  for (const token of tokens) {
    const needle = token.toLowerCase()
    const match = products.find((product) => product.name.toLowerCase() === needle)
      ?? products.find((product) => product.name.toLowerCase().includes(needle) || needle.includes(product.name.toLowerCase()))
    if (match && !found.some((item) => item.id === match.id)) found.push(match)
  }
  return found
}

function thumbsFromBill(bill: SalesTransaction, products: Product[]) {
  const found: Product[] = []
  for (const line of bill.items) {
    const match = products.find((product) => product.id === line.productId)
    if (match && !found.some((item) => item.id === match.id)) found.push(match)
  }
  return found
}

function debtTone(item: DayDebt): BillTone {
  const remaining = debtRemaining(item)
  const paid = debtPaid(item)
  if (paid <= 0) return 'unpaid'
  if (remaining <= 0) return 'paid'
  if (item.paymentStatus === 'pending') return 'pending'
  return 'partial'
}

function billTone(bill: SalesTransaction): BillTone {
  const remaining = billBalance(bill)
  const paid = bill.amountPaid ?? 0
  if (bill.paymentStatus === 'paid' || remaining <= 0) return 'paid'
  if (paid > 0) return 'partial'
  return 'unpaid'
}

function fromDebt(item: DayDebt, index: number, products: Product[], closeId: string, locked: boolean, employee: string): DayBillRow | null {
  const amount = Math.max(0, Math.floor(item.amount || 0))
  if (amount <= 0) return null
  const paid = debtPaid(item)
  return {
    key: `cogs-${item.id || index}`,
    customerName: item.customerName.trim() || '—',
    amount,
    paid,
    remaining: debtRemaining(item),
    tone: debtTone(item),
    products: item.products.trim(),
    thumbs: productMatches(item.products, products),
    closeId,
    debt: item,
    locked,
    employee,
  }
}

function fromBill(bill: SalesTransaction, products: Product[], employee: string): DayBillRow {
  const amount = saleTotal(bill.items)
  return {
    key: `bill-${bill.id}`,
    customerName: bill.customerName.trim() || '—',
    amount,
    paid: bill.amountPaid ?? 0,
    remaining: billBalance(bill),
    tone: billTone(bill),
    products: bill.items.map((line) => products.find((product) => product.id === line.productId)?.name ?? '').filter(Boolean).join(', '),
    thumbs: thumbsFromBill(bill, products),
    billId: bill.id,
    employee,
  }
}

export function BillsCogsCalendar() {
  const app = useApp()
  const { t } = useI18n()
  const [cursor, setCursor] = useState(() => new Date())
  const [selected, setSelected] = useState<string | null>(null)
  const [paying, setPaying] = useState<DayBillRow | null>(null)
  const [busyKey, setBusyKey] = useState('')
  const [payError, setPayError] = useState('')
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const today = dateKey()
  const title = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1))
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const cells = useMemo(() => monthCells(year, month), [month, year])
  const rowsByDay = useMemo(() => {
    const map = new Map<string, DayBillRow[]>()
    const userId = app.user?.id
    if (!userId) return map
    const mineOnly = app.user?.role !== 'admin'
    for (const close of app.dayCloses ?? []) {
      if (mineOnly && close.submittedBy !== userId) continue
      const employee = app.nameOf(close.submittedBy)
      const rows = (close.debts ?? []).map((item, index) => fromDebt(item, index, app.products, close.id, false, employee)).filter((row): row is DayBillRow => Boolean(row))
      if (!rows.length) continue
      map.set(close.day, [...(map.get(close.day) ?? []), ...rows])
    }
    for (const bill of app.sales) {
      if (mineOnly && bill.submittedBy !== userId) continue
      if (bill.status === 'cancelled' || bill.status === 'rejected') continue
      if (bill.recordKind !== 'bill') continue
      const day = asDateKey(bill.generatedAt)
      if (!day) continue
      const existing = map.get(day) ?? []
      const name = customerKey(bill.customerName)
      const match = existing.find((row) => customerKey(row.customerName) === name)
      if (match) {
        match.billId = bill.id
        if (!match.employee) match.employee = app.nameOf(bill.submittedBy)
        continue
      }
      map.set(day, [...existing, fromBill(bill, app.products, app.nameOf(bill.submittedBy))])
    }
    for (const [day, rows] of map) {
      rows.sort((a, b) => Number(a.remaining <= 0) - Number(b.remaining <= 0) || a.customerName.localeCompare(b.customerName))
      map.set(day, rows)
    }
    return map
  }, [app.dayCloses, app.nameOf, app.products, app.sales, app.user?.id, app.user?.role])
  const rows = selected ? rowsByDay.get(selected) ?? [] : []
  const unpaidRows = rows.filter((row) => row.remaining > 0)
  const paidRows = rows.filter((row) => row.remaining <= 0)
  const owed = unpaidRows.reduce((sum, row) => sum + row.remaining, 0)
  const billed = rows.reduce((sum, row) => sum + row.amount, 0)

  useEffect(() => {
    if (!selected) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [selected])

  function toneLabel(tone: BillTone) {
    if (tone === 'paid') return t('cogsDebtFullyPaid')
    if (tone === 'pending') return t('cogsDebtAwaiting')
    if (tone === 'partial') return t('cogsDebtPartial')
    return t('billUnpaid')
  }

  async function settleRow(row: DayBillRow, paidAmount: number) {
    if (busyKey || !selected) return false
    const target = Math.max(0, Math.min(row.amount, Math.floor(paidAmount)))
    setBusyKey(row.key)
    setPayError('')
    const saved = await syncDayBillToCogs(app, {
      day: selected,
      customerName: row.customerName,
      amount: row.amount,
      paidAmount: target,
      products: row.products,
    })
    if (!saved.ok) {
      setBusyKey('')
      setPayError(saved.error)
      return false
    }
    const extra = target - row.paid
    const remainingMode = app.user?.role !== 'admin' && app.settings.allowRemainingCount
    if (row.billId && extra >= 1 && !remainingMode) {
      const billed = await app.recordBillPayment(row.billId, extra)
      if (!billed.ok) {
        setBusyKey('')
        setPaying(null)
        return true
      }
    }
    setBusyKey('')
    setPaying(null)
    return true
  }

  function BillCard({ row, index }: { row: DayBillRow; index: number }) {
    const fill = row.amount > 0 ? Math.min(100, Math.round((row.paid / row.amount) * 100)) : 0
    return (
      <button
        type="button"
        className={cn('sales-day-card bills-day-card w-full', row.remaining > 0 ? 'is-unpaid' : 'is-paid')}
        style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}
        onClick={() => {
          setPayError('')
          setPaying(row)
        }}
      >
        <div className="flex shrink-0 items-center">
          {row.thumbs.slice(0, 2).map((product, thumb) => (
            <ProductThumb
              key={product.id}
              src={product.imageUrl}
              name={product.name}
              className={cn('h-14 w-14 rounded-2xl ring-2 ring-white sm:h-16 sm:w-16', thumb ? '-ml-4' : '')}
            />
          ))}
          {!row.thumbs.length && (
            <span className={cn('grid h-14 w-14 place-items-center rounded-2xl sm:h-16 sm:w-16', row.remaining > 0 ? 'bg-gradient-to-br from-rose-200 to-rose-100 text-rose-900' : 'bg-gradient-to-br from-emerald-200 to-emerald-100 text-emerald-950')}>
              <Receipt className="h-6 w-6" />
            </span>
          )}
        </div>
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-base font-semibold text-ink">{row.customerName}</span>
          {row.products ? <span className="mt-0.5 block line-clamp-2 text-xs text-stone-500">{row.products}</span> : null}
          <span className="bills-pay-track mt-2" aria-hidden="true">
            <span className="bills-pay-fill" style={{ width: `${fill}%` }} />
          </span>
          <span className="mt-1 block text-sm font-semibold tabular-nums text-ink">
            {app.money(row.remaining > 0 ? row.remaining : row.amount)}
            <span className="ml-1 text-xs font-medium text-stone-400">{row.remaining > 0 ? t('cogsDebtRemaining') : t('billPaid')}</span>
          </span>
          <span className="mt-1.5 block text-xs font-semibold text-amber-800">{t('cogsDebtPayTitle')}</span>
        </span>
        <span className={cn('bills-pay-pill', `is-${row.tone}`)}>{toneLabel(row.tone)}</span>
      </button>
    )
  }

  return (
    <section className="sales-cal-wrap bills-cal-wrap">
      <div className="bills-cal-glow" aria-hidden="true" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-900">
            <Receipt className="h-3.5 w-3.5" />
            {t('billsCogsTitle')}
          </p>
          <h2 className="mt-1 font-display text-xl leading-tight text-ink sm:text-2xl">{t('billsCogsHeading')}</h2>
          <p className="mt-1 text-sm text-stone-500">{t('billsCogsBody')}</p>
        </div>
      </div>

      <div className="relative mt-4 flex items-center justify-between gap-3">
        <Button variant="secondary" size="sm" aria-label={t('tablePrev')} onClick={() => setCursor(new Date(year, month - 1, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="font-display text-lg text-ink sm:text-xl">{title}</h3>
        <Button variant="secondary" size="sm" aria-label={t('tableNext')} onClick={() => setCursor(new Date(year, month + 1, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="relative mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-rose-900/70 sm:text-[11px]">
        {weekdays.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="sales-cal relative mt-1.5">
        {cells.map((cell, index) => {
          if (!cell) return <div key={`empty-${index}`} />
          const dayRows = rowsByDay.get(cell.key) ?? []
          const ready = dayRows.length > 0
          const hasUnpaid = dayRows.some((row) => row.remaining > 0)
          const future = cell.key > today
          const isToday = cell.key === today
          return (
            <button
              key={cell.key}
              type="button"
              disabled={future}
              onClick={() => { setPayError(''); setSelected(cell.key) }}
              className={cn(
                'sales-cal-day bills-cal-day',
                ready && (hasUnpaid ? 'has-unpaid' : 'has-paid'),
                isToday && 'is-today',
                selected === cell.key && 'is-open',
                future && 'is-future',
              )}
              style={{ animationDelay: `${Math.min(index, 20) * 18}ms` }}
            >
              <span className="sales-cal-num">{cell.day}</span>
              {ready ? (
                <>
                  <span className={cn('sales-cal-dot', hasUnpaid ? 'bills-cal-dot-unpaid' : 'bills-cal-dot-paid')} />
                  <span className={cn('sales-cal-count', hasUnpaid ? 'bills-cal-count' : 'bills-cal-count-paid')}>{dayRows.length}</span>
                </>
              ) : (
                <span className="sales-cal-idle" />
              )}
            </button>
          )
        })}
      </div>
      {!rowsByDay.size && <p className="relative mt-3 text-center text-sm text-stone-500">{t('billsCogsNone')}</p>}

      {selected &&
        createPortal(
          <div className="sales-day-pop pop-center">
            <button type="button" className="sales-day-pop-scrim" aria-label={t('closeDialog')} onClick={() => setSelected(null)} />
            <div role="dialog" aria-modal="true" className="sales-day-pop-sheet bills-day-sheet">
              <header className="sales-day-pop-head bills-day-pop-head">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-200">{t('billsCogsDay')}</p>
                  <h2 className="mt-0.5 font-display text-xl leading-tight text-white">{formatDate(selected)}</h2>
                  <p className="mt-1 text-sm text-rose-100/85">
                    {unpaidRows.length} {t('billUnpaid').toLowerCase()} · {paidRows.length} {t('billPaid').toLowerCase()} · {app.money(owed)}
                  </p>
                  <p className="mt-0.5 text-xs text-white/65">{t('billLineTotal')} {app.money(billed)}</p>
                  {payError ? <p className="mt-2 text-xs text-rose-200">{payError}</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {rows.length > 0 && (
                    <Button
                      size="sm"
                      variant="gold"
                      className="rounded-full"
                      onClick={() =>
                        downloadBillsDayPdf({
                          day: selected,
                          business: app.settings.businessName,
                          title: t('billPdfTitle'),
                          tableTitle: t('billPdfTitle'),
                          rows: rows.map((row) => ({
                            customerName: row.customerName,
                            products: row.products,
                            amount: row.amount,
                            paid: row.paid,
                            remaining: row.remaining,
                            status: toneLabel(row.tone),
                            employee: row.employee,
                          })),
                          money: app.money,
                          dateHeader: t('stockDate'),
                          customerHeader: t('cogsCustomer'),
                          productsHeader: t('cogsDebtProducts'),
                          amountHeader: t('cogsDebtAmount'),
                          paidHeader: t('cogsDebtPaidAmount'),
                          remainingHeader: t('cogsDebtRemaining'),
                          statusHeader: t('labelStatus'),
                          employeeHeader: t('employeeCol'),
                          emptyNote: t('billPdfEmpty'),
                        })
                      }
                    >
                      <Download className="h-4 w-4" />
                      {t('remainPdf')}
                    </Button>
                  )}
                  <button type="button" className="sales-day-pop-close" onClick={() => setSelected(null)} aria-label={t('close')}>
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </header>
              <div className="sales-day-pop-body hide-scrollbar">
                {unpaidRows.length > 0 && <p className="bills-day-label is-unpaid">{t('billUnpaid')}</p>}
                {unpaidRows.map((row, index) => <BillCard key={row.key} row={row} index={index} />)}
                {paidRows.length > 0 && <p className="bills-day-label is-paid">{t('billPaid')}</p>}
                {paidRows.map((row, index) => <BillCard key={row.key} row={row} index={index} />)}
                {!rows.length && (
                  <div className="sales-day-empty">
                    <Receipt className="mx-auto h-8 w-8 text-rose-800/70" />
                    <p className="mt-3 text-sm text-stone-500">{t('billsCogsEmpty')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
      <DebtPayDialog
        item={paying?.debt ?? (paying ? {
          id: paying.billId,
          customerName: paying.customerName,
          amount: paying.amount,
          products: paying.products,
          paidAmount: paying.paid,
          paymentStatus: paying.tone === 'paid' ? 'approved' : paying.remaining > 0 && paying.paid > 0 ? 'pending' : 'unpaid',
        } : null)}
        open={Boolean(paying)}
        loading={Boolean(busyKey)}
        onClose={() => { if (!busyKey) setPaying(null) }}
        onConfirm={(amount) => (paying ? settleRow(paying, amount) : false)}
      />
    </section>
  )
}
