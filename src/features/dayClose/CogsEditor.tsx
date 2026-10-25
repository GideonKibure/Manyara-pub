import { Button } from '@/components/ui/Button'
import { ChainScroll } from '@/components/ui/ChainScroll'
import { NumberInput, TextInput } from '@/components/ui/Fields'
import { CogsExpenseCard, CogsExpenseEmpty, cogsExpenseGrid } from '@/features/dayClose/CogsExpenseCard'
import { CogsDebtComposer, CogsDebtEmpty, DebtCard, cogsDebtGrid } from '@/features/dayClose/DebtCard'
import { CogsLipaPanel } from '@/features/dayClose/CogsLipaPanel'
import { debtOutstanding } from '@/features/dayClose/debts'
import { useI18n } from '@/i18n/LanguageContext'
import type { CogsExpenseLine, CogsLine, CogsMobileItem, DayDebt } from '@/types'
import { useApp } from '@/context/AppContext'
import { uid } from '@/utils/id'

export function CogsEditor({
  lines,
  onLines,
  expenses,
  onExpenses,
  debts,
  onDebts,
  mobileItems,
  onMobileItems,
  day,
  hideSold = false,
}: {
  lines: CogsLine[]
  onLines: (next: CogsLine[]) => void
  expenses: CogsExpenseLine[]
  onExpenses: (next: CogsExpenseLine[]) => void
  debts: DayDebt[]
  onDebts: (next: DayDebt[]) => void
  mobileItems: CogsMobileItem[]
  onMobileItems: (next: CogsMobileItem[]) => void
  day: string
  hideSold?: boolean
}) {
  const app = useApp()
  const { t } = useI18n()
  return (
    <div className="space-y-5">
      {!hideSold ? <section className="cogs-sold-screen">
        <div className="cogs-sold-toolbar">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">{t('remainPdfSoldTitle')}</p>
            <p className="mt-0.5 text-xs text-stone-500">{lines.filter((line) => line.sold > 0).length}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => onLines([...lines, { name: '', remaining: 0, sold: 0, amount: 0, profit: 0 }])}>{t('salesAdd')}</Button>
        </div>
        <ChainScroll className="cogs-sold-scroll space-y-2">
          {lines.map((line, index) => (
            <div key={line.productId ?? `line-${index}`} className="grid gap-2 rounded-2xl bg-white/90 p-3 sm:grid-cols-[1fr_5.5rem_5.5rem_7rem_7rem_auto]">
              <TextInput value={line.name} onChange={(event) => onLines(lines.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))} />
              <NumberInput allowDecimal value={line.remaining} onValueChange={(value) => onLines(lines.map((item, i) => (i === index ? { ...item, remaining: value ?? 0 } : item)))} />
              <NumberInput allowDecimal value={line.sold} onValueChange={(value) => onLines(lines.map((item, i) => (i === index ? { ...item, sold: value ?? 0 } : item)))} />
              <NumberInput value={line.amount} onValueChange={(value) => onLines(lines.map((item, i) => (i === index ? { ...item, amount: value ?? 0 } : item)))} />
              <NumberInput value={line.profit} onValueChange={(value) => onLines(lines.map((item, i) => (i === index ? { ...item, profit: value ?? 0 } : item)))} />
              <Button size="sm" variant="danger" onClick={() => onLines(lines.filter((_, i) => i !== index))}>{t('deleteRecord')}</Button>
            </div>
          ))}
          {!lines.length && <p className="px-2 py-6 text-center text-sm text-stone-500">{t('remainEmptyToday')}</p>}
        </ChainScroll>
      </section> : null}
      <section className="cogs-sold-screen">
        <div className="cogs-sold-toolbar">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">{t('navExpenses')}</p>
            <p className="mt-0.5 text-xs text-stone-500">{expenses.length}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {expenses.length > 0 ? (
              <p className="text-sm font-semibold tabular-nums text-ink">
                {app.money(expenses.reduce((sum, item) => sum + (item.amount || 0), 0))}
              </p>
            ) : null}
            <Button variant="secondary" size="sm" onClick={() => onExpenses([...expenses, { id: uid(), description: '', amount: 0, notes: '' }])}>{t('pageAddExpense')}</Button>
          </div>
        </div>
        <ChainScroll className="cogs-sold-scroll">
          <div className={cogsExpenseGrid}>
            {expenses.map((item, index) => (
              <CogsExpenseCard
                key={item.id ?? `expense-${index}`}
                item={item}
                index={index}
                onChange={(next) => onExpenses(expenses.map((row, i) => (i === index ? next : row)))}
                onRemove={() => onExpenses(expenses.filter((_, i) => i !== index))}
              />
            ))}
            {!expenses.length ? <CogsExpenseEmpty /> : null}
          </div>
        </ChainScroll>
      </section>
      <section className="space-y-3">
        <CogsDebtComposer onAdd={(item) => onDebts([...debts, item])} />
        <section className="cogs-sold-screen">
          <div className="cogs-sold-toolbar">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">{t('cogsStepDebts')}</p>
              <p className="mt-0.5 text-xs text-stone-500">{debts.length}</p>
            </div>
            {debts.length > 0 ? (
              <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                {t('cogsDebtsOutstanding')} · {app.money(debts.reduce((sum, item) => sum + debtOutstanding(item), 0))}
              </p>
            ) : null}
          </div>
          <ChainScroll className="cogs-sold-scroll">
            <div className={cogsDebtGrid}>
              {debts.map((item, index) => (
                <DebtCard
                  key={item.id ?? `debt-${index}`}
                  item={item}
                  index={index}
                  onChange={(next) => onDebts(debts.map((row, i) => (i === index ? next : row)))}
                  onRemove={() => onDebts(debts.filter((_, i) => i !== index))}
                />
              ))}
              {!debts.length ? <CogsDebtEmpty /> : null}
            </div>
          </ChainScroll>
        </section>
      </section>
      <CogsLipaPanel items={mobileItems} onItems={onMobileItems} day={day} />
      <p className="text-sm text-stone-500">{t('cogsCollections')} · {app.money(lines.reduce((sum, line) => sum + line.amount, 0) - debts.reduce((sum, item) => sum + debtOutstanding(item), 0))}</p>
    </div>
  )
}