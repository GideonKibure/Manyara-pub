import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { Checkbox, Field, NumberInput, SelectInput, TextInput } from '@/components/ui/Fields'
import { PageHeader, Panel, StatusBadge } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { StaffCell } from '@/components/ProductPicker'
import { ActivityDetail } from '@/features/transactions/Details'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import { activityTypeSchema } from '@/schemas'
import type { ActivityTransaction, ActivityType } from '@/types'
import { formatDateTime } from '@/utils/dates'
import { pricingLabel } from '@/utils/labels'

export function ActivitiesPage() {
  const app = useApp()
  const { t } = useI18n()
  const [selected, setSelected] = useState<ActivityTransaction | null>(null)
  const [editing, setEditing] = useState<ActivityType | null>(null)
  return (
    <div>
      <PageHeader title={t('pageActivities')} description={t('pageActivitiesBody')} />
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        {app.activityTypes.map((type) => (
          <Panel key={type.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{type.name}</h2>
                <p className="mt-1 text-sm text-stone-600">{pricingLabel(type.pricingMode)} · {app.money(type.unitPrice)} per {type.unitLabel}</p>
                <p className="text-sm text-stone-500">{type.isActive ? 'Employees can submit this' : 'Submissions are paused'}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setEditing(type)}>Edit pricing</Button>
            </div>
          </Panel>
        ))}
      </div>
      <DataTable
        rows={app.activities}
        getRowId={(row) => row.id}
        emptyTitle="No activity records"
        columns={[
          { key: 'employee', header: 'Employee', render: (row) => <StaffCell id={row.submittedBy} /> },
          { key: 'code', header: 'Code', render: (row) => row.code },
          { key: 'type', header: 'Type', render: (row) => app.activityTypes.find((item) => item.id === row.activityTypeId)?.name },
          { key: 'amount', header: 'Amount', sortValue: (row) => row.amount, render: (row) => app.money(row.amount) },
          { key: 'when', header: 'When', sortValue: (row) => row.occurredAt, render: (row) => formatDateTime(row.occurredAt) },
          { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
          { key: 'open', header: '', render: (row) => <Button size="sm" variant="secondary" onClick={() => setSelected(row)}>View</Button> },
        ]}
      />
      <Modal open={Boolean(selected)} title="Income record" onClose={() => setSelected(null)}>
        {selected && <ActivityDetail record={app.activities.find((item) => item.id === selected.id) ?? selected} mode="review" />}
      </Modal>
      {editing && <PricingDialog type={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function PricingDialog({ type, onClose }: { type: ActivityType; onClose: () => void }) {
  const { saveActivityType } = useApp()
  const form = useForm({
    resolver: zodResolver(activityTypeSchema),
    defaultValues: { pricingMode: type.pricingMode, unitPrice: type.unitPrice, unitLabel: type.unitLabel, isActive: type.isActive },
  })
  return (
    <Modal open title={`Pricing for ${type.name}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={form.handleSubmit(async (values) => {
        const result = await saveActivityType(type.id, values)
        if (result.ok) onClose()
      })}>
        <Field label="Pricing mode" error={form.formState.errors.pricingMode?.message}>
          <SelectInput {...form.register('pricingMode')}>
            <option value="per_game">Per game</option>
            <option value="per_session">Per session</option>
            <option value="per_play">Per play</option>
            <option value="flat">Flat amount</option>
          </SelectInput>
        </Field>
        <Field label="Unit price" error={form.formState.errors.unitPrice?.message}>
          <Controller name="unitPrice" control={form.control} render={({ field }) => <NumberInput value={Number.isFinite(field.value) ? field.value : null} onValueChange={(next) => field.onChange(next ?? Number.NaN)} />} />
        </Field>
        <Field label="Unit label" error={form.formState.errors.unitLabel?.message}>
          <TextInput {...form.register('unitLabel')} />
        </Field>
        <Checkbox label="Active" {...form.register('isActive')} />
        <Button type="submit" variant="gold" loading={form.formState.isSubmitting}>Save pricing</Button>
      </form>
    </Modal>
  )
}
