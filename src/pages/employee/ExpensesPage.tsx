import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Field, NumberInput, TextArea, TextInput } from '@/components/ui/Fields'
import { PageHeader, Panel } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { useApp } from '@/context/AppContext'
import { ExpensesCogsCalendar } from '@/features/expenses/ExpensesCogsCalendar'
import { useI18n } from '@/i18n/LanguageContext'
import { dateKey, employeeMinDateKey, isEmployeeAllowedDay } from '@/utils/dates'
import { uid } from '@/utils/id'

export function ExpensesPage() {
  const app = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const admin = app.user?.role === 'admin'
  const lookback = app.settings.recordLookbackDays
  const corrects = app.expenses.find((item) => item.id === params.get('correct') && item.submittedBy === app.user?.id)
  const [description, setDescription] = useState(corrects?.description ?? '')
  const [amount, setAmount] = useState<number | null>(corrects?.amount ?? null)
  const [spentOn, setSpentOn] = useState(corrects?.spentOn ?? dateKey())
  const [notes, setNotes] = useState(corrects?.notes ?? '')
  const [review, setReview] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const ready = description.trim().length >= 2 && amount != null && amount >= 1 && /^\d{4}-\d{2}-\d{2}$/.test(spentOn)

  async function saveToCogs() {
    const close = (app.dayCloses ?? []).find((item) => item.day === spentOn && item.submittedBy === app.user?.id)
    const expenseItems = [
      ...(close?.expenseItems ?? []),
      { id: uid(), description: description.trim(), amount: amount ?? 0, notes: notes.trim() },
    ]
    return app.saveDayClose({
      day: spentOn,
      remainingSaleId: close?.remainingSaleId,
      debts: close?.debts ?? [],
      mobileReceived: close?.mobileReceived ?? 0,
      expenseTotal: expenseItems.reduce((sum, item) => sum + item.amount, 0),
      lines: close?.lines ?? [],
      expenseItems,
      mobileItems: close?.mobileItems ?? [],
    })
  }

  return (
    <div>
      <PageHeader title={t('expenseTitle')} description={admin ? t('expenseAdminBody') : t('expenseBody')} />
      {corrects && <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm">{t('salesCorrecting')} {corrects.code}.</p>}
      <Panel className="max-w-xl space-y-4">
        <Field label={t('expenseWhat')}>
          <TextInput value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        <Field label={t('expenseAmount')}>
          <NumberInput value={amount} onValueChange={setAmount} />
        </Field>
        <Field label={t('expenseDate')}>
          <TextInput
            type="date"
            min={admin ? undefined : employeeMinDateKey(lookback)}
            max={dateKey()}
            value={spentOn}
            onChange={(event) => {
              const next = event.target.value
              if (!admin && !isEmployeeAllowedDay(next, corrects?.spentOn, lookback)) return
              setSpentOn(next)
            }}
          />
        </Field>
        <Field label={t('expenseNotes')}>
          <TextArea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        {submitError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{submitError}</p>}
        <Button className="w-full" variant="gold" size="lg" disabled={!ready} onClick={() => { setSubmitError(''); setReview(true) }}>{t('expenseReview')}</Button>
      </Panel>
      {!admin && (
        <div className="mt-6 max-w-xl">
          <ExpensesCogsCalendar
            onPickDay={(day) => {
              if (!isEmployeeAllowedDay(day, corrects?.spentOn, lookback)) return
              setSpentOn(day)
            }}
          />
        </div>
      )}
      <Modal open={review} title={t('expenseReview')} onClose={() => setReview(false)}>
        <p className="text-sm text-stone-600">{admin ? t('expenseAdminModal') : t('expenseModalBody')}</p>
        <p className="mt-3 font-semibold">{description.trim()}</p>
        <p className="mt-1 text-sm text-stone-600">{amount != null ? app.money(amount) : ''} · {spentOn}</p>
        {submitError && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{submitError}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setReview(false)}>{t('salesBack')}</Button>
          <Button variant="gold" loading={loading} onClick={async () => {
            if (amount == null) return
            setLoading(true)
            setSubmitError('')
            if (!admin && !corrects) {
              const cogs = await saveToCogs()
              setLoading(false)
              if (!cogs.ok) {
                setSubmitError(cogs.error)
                return
              }
            } else {
              const result = await app.sendExpense({ description, amount, spentOn, notes, correctsId: corrects?.id })
              setLoading(false)
              if (!result.ok) {
                setSubmitError(result.error)
                return
              }
            }
            setReview(false)
            if (admin) {
              navigate('/admin/expenses')
              return
            }
            setDescription('')
            setAmount(null)
            setSpentOn(dateKey())
            setNotes('')
            if (params.get('correct')) setParams({}, { replace: true })
          }}>{admin || !corrects ? t('expenseSave') : t('expenseSubmit')}</Button>
        </div>
      </Modal>
    </div>
  )
}
