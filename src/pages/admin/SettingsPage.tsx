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

export function SettingsPage() {
  const app = useApp()
  const { t } = useI18n()
  const [unitName, setUnitName] = useState('')
  const [unitShort, setUnitShort] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
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
          <div className="md:col-span-2"><Button type="submit" variant="gold" loading={form.formState.isSubmitting}>Save settings</Button></div>
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
        <h2 className="font-semibold">Units</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {app.units.map((unit) => <li key={unit.id} className="rounded-full bg-stone-100 px-3 py-1 text-sm">{unit.name} ({unit.abbreviation})</li>)}
        </ul>
        <form className="mt-4 flex flex-wrap gap-2" onSubmit={async (event) => {
          event.preventDefault()
          const result = await app.addUnit({ name: unitName, abbreviation: unitShort })
          if (result.ok) { setUnitName(''); setUnitShort('') }
        }}>
          <TextInput value={unitName} onChange={(event) => setUnitName(event.target.value)} placeholder={t('fieldUnitName')} aria-label={t('fieldUnitName')} className="max-w-xs" />
          <TextInput value={unitShort} onChange={(event) => setUnitShort(event.target.value)} placeholder={t('fieldAbbr')} aria-label={t('fieldAbbr')} className="max-w-28" />
          <Button type="submit" variant="secondary">Add unit</Button>
        </form>
      </Panel>
      <Panel>
        <h2 className="font-semibold">Data source</h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">{app.dataSourceLabel}</p>
        <p className="mt-2 text-sm text-stone-500">Supabase configured: {app.supabaseConfigured ? 'Yes' : 'No'}.</p>
        {!app.supabaseConfigured && <Button className="mt-4" variant="danger" onClick={() => setResetOpen(true)}>Restore demo data</Button>}
      </Panel>
      <ConfirmDialog open={resetOpen} title="Restore demo data" body="This replaces the browser data with the original demo records. Accounts you created in this browser will be removed." confirmLabel="Restore" tone="danger" onClose={() => setResetOpen(false)} onConfirm={() => { app.restoreDemo(); setResetOpen(false) }} />
    </div>
  )
}
