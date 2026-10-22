import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { StaffCell } from '@/components/ProductPicker'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Fields'
import { PageHeader, Panel, StatusBadge } from '@/components/ui/Feedback'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { CogsEditor } from '@/features/dayClose/CogsEditor'
import { CogsSheet, reportFromCount } from '@/features/reports/SalesDayReport'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { CogsExpenseLine, CogsLine, DayClose, DayDebt } from '@/types'
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

function monthWord(key: string) {
  const [year, month] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(new Date(year, month - 1, 1)).toUpperCase()
}

export function CogsPage() {
  const app = useApp()
  const { t } = useI18n()
  const [cursor, setCursor] = useState(() => new Date())
  const { year, month } = monthParts(cursor)
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<DayClose | null>(null)
  const [debts, setDebts] = useState<DayDebt[]>([])
  const [mobile, setMobile] = useState<number | null>(0)
  const [busy, setBusy] = useState(false)
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

  const cells = monthCells(year, month)
  const monthTitle = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1))
  const selectedCloses = selected ? closesByDay.get(selected) ?? [] : []
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const openEdit = (item: DayClose) => {
    setEditing(item)
    setDebts((item.debts ?? []).map((row) => ({ ...row, id: row.id || uid() })))
    setMobile(item.mobileReceived)
    setLines(item.lines ?? [])
    setExpenseItems((item.expenseItems ?? []).map((row) => ({ ...row, id: row.id || uid() })))
  }

  const openAdd = (day: string) => {
    setAddDay(day)
    setDebts([])
    setMobile(0)
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
      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" size="sm" aria-label={t('tablePrev')} onClick={() => setCursor(new Date(year, month - 1, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="font-display text-xl text-ink sm:text-2xl">{monthTitle}</h2>
        <Button variant="secondary" size="sm" aria-label={t('tableNext')} onClick={() => setCursor(new Date(year, month + 1, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-stone-500 sm:gap-2">
        {weekdays.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
        {cells.map((cell, index) => {
          if (!cell) return <div key={`empty-${index}`} className="min-h-16 sm:min-h-24" />
          const reports = closesByDay.get(cell.key) ?? []
          const ready = reports.length > 0
          const approved = reports.some((item) => item.status === 'approved')
          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => {
                if (cell.key > dateKey()) return
                if (ready) setSelected(cell.key)
                else openAdd(cell.key)
              }}
              className={cn(
                'reveal-card flex min-h-16 flex-col items-center justify-center rounded-2xl px-1 py-2 transition sm:min-h-24 sm:rounded-3xl',
                ready
                  ? 'glass-panel hover:-translate-y-0.5 hover:shadow-lg'
                  : 'border border-dashed border-white/50 bg-white/20 text-stone-400',
                selected === cell.key && ready && 'ring-2 ring-amber-600',
                approved && 'bg-emerald-50/70',
              )}
            >
              <span className={cn('font-display text-xl leading-none sm:text-3xl', ready ? 'text-ink' : 'text-stone-400')}>{cell.day}</span>
              <span className={cn('mt-1 text-[10px] font-bold tracking-[0.18em]', ready ? 'text-amber-800' : 'text-stone-400')}>{monthWord(cell.key)}</span>
              {ready && <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-700" />}
            </button>
          )
        })}
      </div>

      <Modal open={Boolean(selected)} title={selected ? `${t('cogsSheetTitle')} · ${formatDate(selected)}` : t('cogsSheetTitle')} onClose={() => setSelected(null)} wide>
        <div className="space-y-4">
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
                  debts={item.debts}
                  mobile={item.mobileReceived}
                  staff={`${person?.fullName ?? ''} @${person?.username ?? ''}`}
                  approved={item.status === 'approved'}
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
          <div className="space-y-4">
            <StaffCell id={editing.submittedBy} />
            <CogsEditor
              lines={lines}
              onLines={setLines}
              expenses={expenseItems}
              onExpenses={setExpenseItems}
              debts={debts}
              onDebts={setDebts}
              mobile={mobile}
              onMobile={setMobile}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>{t('cancel')}</Button>
              <Button
                variant="gold"
                loading={busy}
                onClick={async () => {
                  setBusy(true)
                  const result = await app.updateDayClose(editing.id, {
                    debts,
                    mobileReceived: mobile ?? 0,
                    expenseTotal: expenseItems.reduce((sum, item) => sum + item.amount, 0),
                    lines,
                    expenseItems,
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
        <div className="space-y-4">
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
            mobile={mobile}
            onMobile={setMobile}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdding(false)}>{t('cancel')}</Button>
            <Button
              variant="gold"
              loading={busy}
              onClick={async () => {
                setBusy(true)
                const result = await app.saveDayClose({
                  day: addDay,
                  debts,
                  mobileReceived: mobile ?? 0,
                  expenseTotal: expenseItems.reduce((sum, item) => sum + item.amount, 0),
                  lines,
                  expenseItems,
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
