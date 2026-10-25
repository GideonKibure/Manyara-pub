import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { StaffCell } from '@/components/ProductPicker'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Fields'
import { PageHeader, Panel, StatusBadge } from '@/components/ui/Feedback'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { CogsEditor } from '@/features/dayClose/CogsEditor'
import { debtRemaining } from '@/features/dayClose/debts'
import { CogsSheet, reportFromCount } from '@/features/reports/SalesDayReport'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { CogsExpenseLine, CogsLine, CogsMobileItem, DayClose, DayDebt } from '@/types'
import { cn } from '@/utils/cn'
import { asDateKey, dateKey, formatDate } from '@/utils/dates'
import { uid } from '@/utils/id'

function monthParts(cursor: Date) {
  return { year: cursor.getFullYear(), month: cursor.getMonth() }
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

export function CogsPage() {
  const app = useApp()
  const { t } = useI18n()
  const [cursor, setCursor] = useState(() => new Date())
  const { year, month } = monthParts(cursor)
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<DayClose | null>(null)
  const [debts, setDebts] = useState<DayDebt[]>([])
  const [mobileItems, setMobileItems] = useState<CogsMobileItem[]>([])
  const [busy, setBusy] = useState(false)
  const [reviewingDebt, setReviewingDebt] = useState('')
  const [removing, setRemoving] = useState('')
  const [adding, setAdding] = useState(false)
  const [addDay, setAddDay] = useState(dateKey())
  const [lines, setLines] = useState<CogsLine[]>([])
  const [expenseItems, setExpenseItems] = useState<CogsExpenseLine[]>([])

  const closesByDay = useMemo(() => {
    const map = new Map<string, DayClose[]>()
    for (const item of app.dayCloses ?? []) {
      const list = map.get(item.day) ?? []
      list.push(item)
      map.set(item.day, list)
    }
    return map
  }, [app.dayCloses])

  const mobile = mobileItems.reduce((sum, item) => sum + (item.amount || 0), 0)
  const cells = monthCells(year, month)
  const monthTitle = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1))
  const selectedCloses = selected ? closesByDay.get(selected) ?? [] : []
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const openEdit = (item: DayClose) => {
    setEditing(item)
    setDebts((item.debts ?? []).map((row) => ({ ...row, id: row.id || uid() })))
    setMobileItems(
      (item.mobileItems ?? []).length
        ? item.mobileItems.map((row) => ({ ...row, id: row.id || uid() }))
        : item.mobileReceived > 0
          ? [{ id: uid(), amount: item.mobileReceived, date: item.day }]
          : [],
    )
    setLines(item.lines ?? [])
    setExpenseItems((item.expenseItems ?? []).map((row) => ({ ...row, id: row.id || uid() })))
  }

  const openAdd = (day: string) => {
    setAddDay(day)
    setDebts([])
    setMobileItems([])
    setLines([])
    setExpenseItems([])
    setAdding(true)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('cogsAdminTitle')}
        description={t('cogsAdminBody')}
        actions={<Button variant="gold" onClick={() => openAdd(dateKey())}>{t('cogsAddPast')}</Button>}
      />
      <section className="sales-cal-wrap admin-cogs-cal">
        <div className="admin-cogs-glow" aria-hidden="true" />
        <div className="relative flex items-center justify-between gap-3">
          <Button variant="secondary" size="sm" aria-label={t('tablePrev')} onClick={() => setCursor(new Date(year, month - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="font-display text-xl text-ink sm:text-2xl">{monthTitle}</h2>
          <Button variant="secondary" size="sm" aria-label={t('tableNext')} onClick={() => setCursor(new Date(year, month + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-amber-900/70 sm:text-[11px]">
          {weekdays.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="sales-cal relative mt-1.5">
          {cells.map((cell, index) => {
            if (!cell) return <div key={`empty-${index}`} />
            const reports = closesByDay.get(cell.key) ?? []
            const ready = reports.length > 0
            const debts = reports.flatMap((item) => item.debts ?? [])
            const hasDebts = debts.some((item) => item.amount > 0)
            const hasUnpaid = debts.some((item) => debtRemaining(item) > 0)
            const allPaid = hasDebts && !hasUnpaid
            const unpaidCount = debts.filter((item) => debtRemaining(item) > 0).length
            const future = cell.key > dateKey()
            const isToday = cell.key === dateKey()
            return (
              <button
                key={cell.key}
                type="button"
                disabled={future}
                onClick={() => {
                  if (ready) setSelected(cell.key)
                  else openAdd(cell.key)
                }}
                className={cn(
                  'sales-cal-day bills-cal-day admin-cogs-day',
                  ready && !hasDebts && 'has-cogs',
                  hasUnpaid && 'has-unpaid',
                  allPaid && 'has-paid',
                  isToday && 'is-today',
                  selected === cell.key && 'is-open',
                  future && 'is-future',
                )}
                style={{ animationDelay: `${Math.min(index, 20) * 18}ms` }}
              >
                <span className="sales-cal-num">{cell.day}</span>
                {ready ? (
                  <>
                    <span className={cn('sales-cal-dot', hasUnpaid ? 'bills-cal-dot-unpaid' : allPaid ? 'bills-cal-dot-paid' : 'admin-cogs-dot')} />
                    <span className={cn('sales-cal-count', hasUnpaid ? 'bills-cal-count' : allPaid ? 'bills-cal-count-paid' : 'admin-cogs-count')}>
                      {hasUnpaid ? unpaidCount : reports.length}
                    </span>
                  </>
                ) : (
                  <span className="sales-cal-idle" />
                )}
              </button>
            )
          })}
        </div>
        <div className="admin-cogs-legend">
          <span className="admin-cogs-chip"><span className="admin-cogs-swatch is-unpaid" />{t('cogsCalLegendUnpaid')}</span>
          <span className="admin-cogs-chip"><span className="admin-cogs-swatch is-paid" />{t('cogsCalLegendPaid')}</span>
          <span className="admin-cogs-chip"><span className="admin-cogs-swatch is-sheet" />{t('cogsCalLegendSheet')}</span>
        </div>
      </section>

      <Modal open={Boolean(selected)} title={selected ? `${t('cogsSheetTitle')} · ${formatDate(selected)}` : t('cogsSheetTitle')} onClose={() => setSelected(null)} wide>
        <div className="space-y-4 pb-8">
          {selectedCloses.map((item) => {
            const sale = app.sales.find((row) => row.id === item.remainingSaleId)
            const rows = item.lines?.length
              ? item.lines
              : sale
                ? reportFromCount({ products: app.products, sales: app.sales, movements: app.movements }, sale)
                : []
            const expenses = item.expenseTotal || app.expenses
              .filter((row) => row.submittedBy === item.submittedBy && asDateKey(row.spentOn) === item.day && row.status !== 'cancelled' && row.status !== 'rejected')
              .reduce((sum, row) => sum + row.amount, 0)
            const person = app.profiles.find((row) => row.id === item.submittedBy)
            return (
              <Panel key={item.id} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <StaffCell id={item.submittedBy} />
                  <StatusBadge status={item.status} />
                </div>
                <CogsSheet
                  rows={rows}
                  day={item.day}
                  expenses={expenses}
                  expenseItems={item.expenseItems}
                  debts={item.debts}
                  mobile={item.mobileReceived}
                  mobileItems={item.mobileItems}
                  staff={`${person?.fullName ?? ''} @${person?.username ?? ''}`}
                  approved={item.status === 'approved'}
                  canPay
                  asAdmin
                  payBusy={reviewingDebt.startsWith(`${item.id}:`) ? reviewingDebt.slice(item.id.length + 1) : ''}
                  onPay={async (debt, paidAmount) => {
                    setReviewingDebt(`${item.id}:${debt.id || debt.customerName}`)
                    const result = await app.setDayCloseDebtPayment(item.id, debt.id ?? '', paidAmount, {
                      customerName: debt.customerName,
                      amount: debt.amount,
                      products: debt.products,
                    })
                    setReviewingDebt('')
                    return result.ok
                  }}
                  onApprovePayment={async (debt) => {
                    if (!debt.id) return
                    setReviewingDebt(`${item.id}:${debt.id}`)
                    await app.reviewDebtPayment(item.id, debt.id, true)
                    setReviewingDebt('')
                  }}
                  onRejectPayment={async (debt) => {
                    if (!debt.id) return
                    setReviewingDebt(`${item.id}:${debt.id}`)
                    await app.reviewDebtPayment(item.id, debt.id, false)
                    setReviewingDebt('')
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(item)}>{t('edit')}</Button>
                  <Button size="sm" variant="gold" loading={busy && editing?.id === item.id} onClick={async () => {
                    setBusy(true)
                    await app.approveDayClose(item.id)
                    setBusy(false)
                  }}>{t('cogsApprove')}</Button>
                  <Button size="sm" variant="danger" onClick={() => setRemoving(item.id)}>{t('deleteRecord')}</Button>
                </div>
              </Panel>
            )
          })}
          {!selectedCloses.length && (
            <div className="space-y-3">
              <p className="text-sm text-stone-500">{t('cogsAdminEmptyDay')}</p>
              {selected && <Button variant="gold" onClick={() => openAdd(selected)}>{t('cogsAddPast')}</Button>}
            </div>
          )}
        </div>
      </Modal>

      <Modal open={Boolean(editing)} title={t('cogsEditTitle')} onClose={() => setEditing(null)} wide>
        {editing && (
          <div className="space-y-4 pb-8">
            <StaffCell id={editing.submittedBy} />
            <CogsEditor
              lines={lines}
              onLines={setLines}
              expenses={expenseItems}
              onExpenses={setExpenseItems}
              debts={debts}
              onDebts={setDebts}
              mobileItems={mobileItems}
              onMobileItems={setMobileItems}
              day={editing.day}
            />
            <div className="cogs-dock-inner grid-cols-2 sm:ml-auto sm:max-w-md">
              <Button variant="secondary" className="cogs-dock-btn cogs-dock-btn-back" onClick={() => setEditing(null)}>{t('cancel')}</Button>
              <Button
                variant="gold"
                className="cogs-dock-btn cogs-dock-btn-save"
                loading={busy}
                onClick={async () => {
                  setBusy(true)
                  const result = await app.updateDayClose(editing.id, {
                    debts,
                    mobileReceived: mobile,
                    expenseTotal: expenseItems.reduce((sum, item) => sum + item.amount, 0),
                    lines,
                    expenseItems,
                    mobileItems,
                  })
                  setBusy(false)
                  if (result.ok) setEditing(null)
                }}
              >
                {t('save')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={adding} title={t('cogsAddPast')} onClose={() => setAdding(false)} wide>
        <div className="space-y-4 pb-8">
          <Field label={t('cogsDay')}>
            <TextInput type="date" max={dateKey()} value={addDay} onChange={(event) => setAddDay(event.target.value)} />
          </Field>
          <CogsEditor
            lines={lines}
            onLines={setLines}
            expenses={expenseItems}
            onExpenses={setExpenseItems}
            debts={debts}
            onDebts={setDebts}
            mobileItems={mobileItems}
            onMobileItems={setMobileItems}
            day={addDay}
          />
          <div className="cogs-dock-inner grid-cols-2 sm:ml-auto sm:max-w-md">
            <Button variant="secondary" className="cogs-dock-btn cogs-dock-btn-back" onClick={() => setAdding(false)}>{t('cancel')}</Button>
            <Button
              variant="gold"
              className="cogs-dock-btn cogs-dock-btn-save"
              loading={busy}
              onClick={async () => {
                setBusy(true)
                const result = await app.saveDayClose({
                  day: addDay,
                  debts,
                  mobileReceived: mobile,
                  expenseTotal: expenseItems.reduce((sum, item) => sum + item.amount, 0),
                  lines,
                  expenseItems,
                  mobileItems,
                  submittedBy: app.user?.id,
                })
                setBusy(false)
                if (result.ok) {
                  setAdding(false)
                  setSelected(addDay)
                }
              }}
            >
              {t('save')}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(removing)}
        title={t('deleteRecordTitle')}
        body={t('cogsDeleteBody')}
        confirmLabel={t('deleteRecord')}
        tone="danger"
        loading={busy}
        onClose={() => setRemoving('')}
        onConfirm={async () => {
          setBusy(true)
          const result = await app.deleteDayClose(removing)
          setBusy(false)
          if (result.ok) setRemoving('')
        }}
      />
    </div>
  )
}
