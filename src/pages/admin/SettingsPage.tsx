import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, TextInput } from '@/components/ui/Fields'
import { PageHeader, Panel } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Modal'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import { settingsSchema, type SettingsValues } from '@/schemas'
import type { Unit } from '@/types'

export function SettingsPage() {
  const app = useApp()
  const { t } = useI18n()
  const [unitName, setUnitName] = useState('')
  const [unitShort, setUnitShort] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [clearBusy, setClearBusy] = useState(false)
  const [removingUnit, setRemovingUnit] = useState<Unit | null>(null)
  const [unitBusy, setUnitBusy] = useState(false)
  const form = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      businessName: app.settings.businessName,
      currency: app.settings.currency,
      currencySymbol: app.settings.currencySymbol,
      lowStockAlerts: app.settings.lowStockAlerts,
      allowRemainingCount: app.settings.allowRemainingCount,
    },
  })
  return (
    <div className="space-y-4">
      <PageHeader title={t('pageSettings')} description={t('pageSettingsBody')} />
      <Panel>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={form.handleSubmit(async (values) => { await app.saveSettings({ ...values, allowRemainingCount: app.settings.allowRemainingCount }) })}>
          <Field label={t('fieldBusinessName')} error={form.formState.errors.businessName?.message}><TextInput {...form.register('businessName')} /></Field>
          <Field label={t('fieldCurrency')} error={form.formState.errors.currency?.message}><TextInput {...form.register('currency')} /></Field>
          <Field label={t('fieldCurrencySymbol')} error={form.formState.errors.currencySymbol?.message}><TextInput {...form.register('currencySymbol')} /></Field>
          <div className="flex items-end"><Checkbox label={t('settingsLowStock')} {...form.register('lowStockAlerts')} /></div>
          <div className="md:col-span-2"><Button type="submit" variant="gold" loading={form.formState.isSubmitting}>{t('settingsSave')}</Button></div>
        </form>
      </Panel>
      <Panel>
        <h2 className="font-semibold">{t('settingsRemainingTitle')}</h2>
        <p className="mt-1 text-sm leading-6 text-stone-600">{t('settingsRemainingHint')}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:max-w-md">
          <Button
            type="button"
            variant={app.settings.allowRemainingCount ? 'gold' : 'secondary'}
            onClick={() => void app.saveSettings({ ...form.getValues(), allowRemainingCount: true })}
          >
            {t('settingsAllow')}
          </Button>
          <Button
            type="button"
            variant={!app.settings.allowRemainingCount ? 'gold' : 'secondary'}
            onClick={() => void app.saveSettings({ ...form.getValues(), allowRemainingCount: false })}
          >
            {t('settingsDeny')}
          </Button>
        </div>
        <p className="mt-3 text-sm font-medium text-ink">{app.settings.allowRemainingCount ? t('settingsRemainingOn') : t('settingsRemainingOff')}</p>
      </Panel>
      <Panel>
        <h2 className="font-semibold">{t('settingsUnitsTitle')}</h2>
        <ul className="mt-3 space-y-2">
          {app.units.map((unit) => (
            <li key={unit.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-stone-50 px-3 py-2">
              <span className="text-sm">{unit.name} ({unit.abbreviation})</span>
              <Button size="sm" variant="danger" onClick={() => setRemovingUnit(unit)}>{t('settingsDeleteUnit')}</Button>
            </li>
          ))}
        </ul>
        <form className="mt-4 flex flex-wrap gap-2" onSubmit={async (event) => {
          event.preventDefault()
          const result = await app.addUnit({ name: unitName, abbreviation: unitShort })
          if (result.ok) { setUnitName(''); setUnitShort('') }
        }}>
          <TextInput value={unitName} onChange={(event) => setUnitName(event.target.value)} placeholder={t('fieldUnitName')} aria-label={t('fieldUnitName')} className="max-w-xs" />
          <TextInput value={unitShort} onChange={(event) => setUnitShort(event.target.value)} placeholder={t('fieldAbbr')} aria-label={t('fieldAbbr')} className="max-w-28" />
          <Button type="submit" variant="secondary">{t('settingsAddUnit')}</Button>
        </form>
      </Panel>
      <Panel>
        <h2 className="font-semibold">{t('settingsClearTitle')}</h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">{t('settingsClearBody')}</p>
        <Button className="mt-4" variant="danger" onClick={() => setClearOpen(true)}>{t('settingsClearAction')}</Button>
      </Panel>
      <Panel>
        <h2 className="font-semibold">{t('settingsDataSource')}</h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">{app.dataSourceLabel}</p>
        <p className="mt-2 text-sm text-stone-500">Supabase configured: {app.supabaseConfigured ? 'Yes' : 'No'}.</p>
        {!app.supabaseConfigured && <Button className="mt-4" variant="danger" onClick={() => setResetOpen(true)}>{t('settingsDemoRestore')}</Button>}
      </Panel>
      <ConfirmDialog
        open={Boolean(removingUnit)}
        title={t('settingsDeleteUnitTitle')}
        body={removingUnit ? `${removingUnit.name} (${removingUnit.abbreviation}). ${t('settingsDeleteUnitBody')}` : ''}
        confirmLabel={t('settingsDeleteUnit')}
        tone="danger"
        loading={unitBusy}
        onClose={() => setRemovingUnit(null)}
        onConfirm={async () => {
          if (!removingUnit) return
          setUnitBusy(true)
          const result = await app.removeUnit(removingUnit.id)
          setUnitBusy(false)
          if (result.ok) setRemovingUnit(null)
        }}
      />
      <ConfirmDialog
        open={clearOpen}
        title={t('settingsClearTitle')}
        body={t('settingsClearBody')}
        confirmLabel={t('settingsClearConfirm')}
        tone="danger"
        loading={clearBusy}
        onClose={() => setClearOpen(false)}
        onConfirm={async () => {
          setClearBusy(true)
          const result = await app.clearBusiness()
          setClearBusy(false)
          if (result.ok) setClearOpen(false)
        }}
      />
      <ConfirmDialog
        open={resetOpen}
        title={t('settingsDemoTitle')}
        body={t('settingsDemoBody')}
        confirmLabel={t('settingsDemoRestore')}
        tone="danger"
        onClose={() => setResetOpen(false)}
        onConfirm={() => { app.restoreDemo(); setResetOpen(false) }}
      />
    </div>
  )
}
