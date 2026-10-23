import { Button } from '@/components/ui/Button'
import { Field, NumberInput, TextInput } from '@/components/ui/Fields'
import { DebtCard } from '@/features/dayClose/DebtCard'
import { blankDebt, debtOutstanding } from '@/features/dayClose/debts'
import { useI18n } from '@/i18n/LanguageContext'
import type { CogsExpenseLine, CogsLine, DayDebt } from '@/types'
import { useApp } from '@/context/AppContext'
import { uid } from '@/utils/id'

export function CogsEditor({
  lines,
  onLines,
  expenses,
  onExpenses,
  debts,
  onDebts,
  mobile,
  onMobile,
}: {
  lines: CogsLine[]
  onLines: (next: CogsLine[]) => void
  expenses: CogsExpenseLine[]
  onExpenses: (next: CogsExpenseLine[]) => void
  debts: DayDebt[]
  onDebts: (next: DayDebt[]) => void
  mobile: number | null
  onMobile: (next: number | null) => void
}) {
  const app = useApp()
  const { t } = useI18n()
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t('remainPdfSoldTitle')}</h3>
        {lines.map((line, index) => (
          <div key={line.productId ?? `line-${index}`} className="grid gap-2 rounded-2xl bg-white/70 p-3 sm:grid-cols-[1fr_5.5rem_5.5rem_7rem_7rem_auto]">
            <TextInput value={line.name} onChange={(event) => onLines(lines.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))} />
            <NumberInput allowDecimal value={line.remaining} onValueChange={(value) => onLines(lines.map((item, i) => (i === index ? { ...item, remaining: value ?? 0 } : item)))} />
            <NumberInput allowDecimal value={line.sold} onValueChange={(value) => onLines(lines.map((item, i) => (i === index ? { ...item, sold: value ?? 0 } : item)))} />
            <NumberInput value={line.amount} onValueChange={(value) => onLines(lines.map((item, i) => (i === index ? { ...item, amount: value ?? 0 } : item)))} />
            <NumberInput value={line.profit} onValueChange={(value) => onLines(lines.map((item, i) => (i === index ? { ...item, profit: value ?? 0 } : item)))} />
            <Button size="sm" variant="danger" onClick={() => onLines(lines.filter((_, i) => i !== index))}>{t('deleteRecord')}</Button>
          </div>
        ))}
        {!lines.length && <p className="text-sm text-stone-500">{t('remainEmptyToday')}</p>}
        <Button variant="secondary" onClick={() => onLines([...lines, { name: '', remaining: 0, sold: 0, amount: 0, profit: 0 }])}>{t('salesAdd')}</Button>
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t('navExpenses')}</h3>
        {expenses.map((item, index) => (
          <div key={item.id ?? `expense-${index}`} className="grid gap-2 rounded-2xl bg-white/50 p-3 sm:grid-cols-[1fr_8rem_auto]">
            <TextInput value={item.description} onChange={(event) => onExpenses(expenses.map((row, i) => (i === index ? { ...row, description: event.target.value } : row)))} />
            <NumberInput value={item.amount} onValueChange={(value) => onExpenses(expenses.map((row, i) => (i === index ? { ...row, amount: value ?? 0 } : row)))} />
            <Button size="sm" variant="danger" onClick={() => onExpenses(expenses.filter((_, i) => i !== index))}>{t('deleteRecord')}</Button>
          </div>
        ))}
        <Button variant="secondary" onClick={() => onExpenses([...expenses, { id: uid(), description: '', amount: 0, notes: '' }])}>{t('pageAddExpense')}</Button>
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{t('cogsStepDebts')}</h3>
        {debts.map((item, index) => (
          <DebtCard
            key={item.id ?? `debt-${index}`}
            item={item}
            onChange={(next) => onDebts(debts.map((row) => (row.id === item.id ? next : row)))}
            onRemove={() => onDebts(debts.filter((row) => row.id !== item.id))}
          />
        ))}
        <Button variant="secondary" className="w-full sm:w-auto" onClick={() => onDebts([...debts, blankDebt()])}>{t('cogsAddDebt')}</Button>
      </section>
      <Field label={t('cogsMobileAmount')}>
        <NumberInput value={mobile} onValueChange={onMobile} />
      </Field>
      <p className="text-sm text-stone-500">{t('cogsCollections')} · {app.money(lines.reduce((sum, line) => sum + line.amount, 0) - debts.reduce((sum, item) => sum + debtOutstanding(item), 0))}</p>
    </div>
  )
}
