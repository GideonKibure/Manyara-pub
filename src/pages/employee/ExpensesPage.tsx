import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Field, NumberInput, TextArea, TextInput } from '@/components/ui/Fields'
import { PageHeader, Panel } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import { dateKey } from '@/utils/dates'

export function ExpensesPage() {
  const app = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const admin = app.user?.role === 'admin'
  const corrects = app.expenses.find((item) => item.id === params.get('correct') && item.submittedBy === app.user?.id)
  const [description, setDescription] = useState(corrects?.description ?? '')
  const [amount, setAmount] = useState<number | null>(corrects?.amount ?? null)
  const [spentOn, setSpentOn] = useState(corrects?.spentOn ?? dateKey())
  const [notes, setNotes] = useState(corrects?.notes ?? '')
  const [review, setReview] = useState(false)
  const [loading, setLoading] = useState(false)
  const ready = description.trim().length >= 2 && amount != null && amount >= 1 && /^\d{4}-\d{2}-\d{2}$/.test(spentOn)

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
          <TextInput type="date" max={dateKey()} value={spentOn} onChange={(event) => setSpentOn(event.target.value)} />
        </Field>
        <Field label={t('expenseNotes')}>
          <TextArea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        <Button className="w-full" variant="gold" size="lg" disabled={!ready} onClick={() => setReview(true)}>{t('expenseReview')}</Button>
      </Panel>
      <Modal open={review} title={t('expenseReview')} onClose={() => setReview(false)}>
        <p className="text-sm text-stone-600">{admin ? t('expenseAdminModal') : t('expenseModalBody')}</p>
        <p className="mt-3 font-semibold">{description.trim()}</p>
        <p className="mt-1 text-sm text-stone-600">{amount != null ? app.money(amount) : ''} · {spentOn}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setReview(false)}>{t('salesBack')}</Button>
          <Button variant="gold" loading={loading} onClick={async () => {
            if (amount == null) return
            setLoading(true)
            const result = await app.sendExpense({ description, amount, spentOn, notes, correctsId: corrects?.id })
            setLoading(false)
            if (!result.ok) return
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
          }}>{admin ? t('expenseSave') : t('expenseSubmit')}</Button>
        </div>
      </Modal>
    </div>
  )
}
