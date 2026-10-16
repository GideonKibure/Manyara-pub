import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Field, NumberInput, SelectInput, TextArea, TextInput } from '@/components/ui/Fields'
import { PageHeader, Panel } from '@/components/ui/Feedback'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { PaymentMethod } from '@/types'
import { pricingLabel } from '@/utils/labels'

function toLocalInput(iso: string) {
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function ActivitiesPage() {
  const app = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const corrects = app.activities.find((item) => item.id === params.get('correct') && item.submittedBy === app.user?.id)
  const types = app.activityTypes.filter((item) => item.isActive)
  const [activityTypeId, setActivityTypeId] = useState(corrects?.activityTypeId ?? types[0]?.id ?? '')
  const [quantity, setQuantity] = useState<number | null>(corrects?.quantity ?? 1)
  const [amount, setAmount] = useState<number | null>(corrects?.amount ?? types[0]?.unitPrice ?? 0)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(corrects?.paymentMethod ?? 'cash')
  const [occurredAt, setOccurredAt] = useState(corrects ? toLocalInput(corrects.occurredAt) : toLocalInput(new Date().toISOString()))
  const [notes, setNotes] = useState(corrects?.notes ?? '')
  const [loading, setLoading] = useState(false)
  const selected = types.find((item) => item.id === activityTypeId) ?? app.activityTypes.find((item) => item.id === activityTypeId)
  const suggested = selected ? (selected.pricingMode === 'flat' ? selected.unitPrice : selected.unitPrice * (quantity || 0)) : 0

  if (!app.user?.canSubmitActivities) {
    return (
      <div>
        <PageHeader title={t('pageActivityShort')} description={t('pageActivityShortBody')} />
        <Panel><p className="text-sm text-stone-600">Your account is not allowed to submit pool table or korokoro income. Ask an administrator if this should change.</p></Panel>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title={t('pageRecordActivity')} description={t('pageRecordActivityBody')} />
      <Panel className="max-w-xl space-y-4">
        <Field label={t('fieldActivity')}>
          <SelectInput value={activityTypeId} onChange={(event) => {
            const next = event.target.value
            setActivityTypeId(next)
            const type = types.find((item) => item.id === next)
            if (type) setAmount(type.pricingMode === 'flat' ? type.unitPrice : type.unitPrice * (quantity ?? 0))
          }}>
            {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
          </SelectInput>
        </Field>
        {selected && <p className="text-sm text-stone-600">{pricingLabel(selected.pricingMode)} at {app.money(selected.unitPrice)} per {selected.unitLabel}. Suggested collection {app.money(suggested)}.</p>}
        <Field label={`${t('fieldQuantity')} (${selected?.unitLabel ?? t('remainUnits')})`}><NumberInput value={quantity} onValueChange={setQuantity} /></Field>
        <Field label={t('fieldAmount')}><NumberInput value={amount} onValueChange={setAmount} /></Field>
        <Field label={t('fieldPayment')}>
          <SelectInput value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}>
            <option value="cash">{t('payCash')}</option>
            <option value="mobile_money">{t('payMobile')}</option>
            <option value="card">{t('payCard')}</option>
            <option value="other">{t('payOther')}</option>
          </SelectInput>
        </Field>
        <Field label={t('fieldDateTime')}><TextInput type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /></Field>
        <Field label={t('fieldNotes')}><TextArea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
        <Button variant="gold" loading={loading} disabled={quantity == null || amount == null} onClick={async () => {
          if (quantity == null || amount == null) return
          setLoading(true)
          const result = await app.sendActivity({ activityTypeId, quantity, amount, paymentMethod, occurredAt, notes, correctsId: corrects?.id })
          setLoading(false)
          if (result.ok) navigate('/employee/submissions')
        }}>Submit for approval</Button>
      </Panel>
    </div>
  )
}
