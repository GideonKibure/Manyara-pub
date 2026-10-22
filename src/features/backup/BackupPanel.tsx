import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Fields'
import { Panel } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Modal'
import { StaffCell } from '@/components/ProductPicker'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { BackupKind, CloudBackup } from '@/services/backups'
import { formatDateTime } from '@/utils/dates'

export function BackupPanel({ defaultKind = 'workspace' }: { defaultKind?: BackupKind }) {
  const app = useApp()
  const { t } = useI18n()
  const [label, setLabel] = useState('')
  const [items, setItems] = useState<CloudBackup[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [restoreId, setRestoreId] = useState('')
  const canBackup = app.supabaseConfigured && Boolean(app.user)

  const refresh = async () => {
    if (!canBackup) return
    setLoading(true)
    const result = await app.listBackups()
    setLoading(false)
    if (result.ok) setItems(result.items)
  }

  useEffect(() => {
    void refresh()
  }, [canBackup])

  if (!app.user) return null

  return (
    <Panel className="space-y-4">
      <div>
        <h2 className="font-semibold">{t('backupTitle')}</h2>
        <p className="mt-1 text-sm leading-6 text-stone-600">{t('backupBody')}</p>
      </div>
      {!app.supabaseConfigured && <p className="text-sm text-stone-500">{app.dataSourceLabel}</p>}
      {canBackup && (
        <>
          <Field label={t('backupLabel')}>
            <TextInput value={label} onChange={(event) => setLabel(event.target.value)} placeholder={defaultKind === 'cogs' ? t('backupCogs') : t('backupWorkspace')} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="gold"
              loading={busy}
              onClick={async () => {
                setBusy(true)
                const result = await app.backupNow(defaultKind === 'cogs' ? 'cogs' : 'workspace', label)
                setBusy(false)
                if (result.ok) {
                  setLabel('')
                  await refresh()
                }
              }}
            >
              {defaultKind === 'cogs' ? t('backupCogs') : t('backupWorkspace')}
            </Button>
            {defaultKind !== 'cogs' && (
              <Button
                variant="secondary"
                loading={busy}
                onClick={async () => {
                  setBusy(true)
                  const result = await app.backupNow('cogs', label)
                  setBusy(false)
                  if (result.ok) {
                    setLabel('')
                    await refresh()
                  }
                }}
              >
                {t('backupCogs')}
              </Button>
            )}
          </div>
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{item.label || (item.kind === 'cogs' ? t('backupCogs') : t('backupWorkspace'))}</p>
                  <p className="text-xs text-stone-500">
                    {item.kind === 'cogs' ? t('backupCogs') : t('backupWorkspace')} · {t('backupWhen')} {formatDateTime(item.createdAt)}
                  </p>
                  <StaffCell id={item.createdBy} />
                </div>
                <Button size="sm" variant="secondary" onClick={() => setRestoreId(item.id)}>
                  {t('backupRestore')}
                </Button>
              </li>
            ))}
            {!items.length && !loading && <li className="py-3 text-sm text-stone-500">{t('backupEmpty')}</li>}
          </ul>
        </>
      )}
      <ConfirmDialog
        open={Boolean(restoreId)}
        title={t('backupRestoreTitle')}
        body={t('backupRestoreBody')}
        confirmLabel={t('backupRestore')}
        tone="danger"
        loading={busy}
        onClose={() => setRestoreId('')}
        onConfirm={async () => {
          if (!restoreId) return
          setBusy(true)
          const result = await app.restoreBackup(restoreId)
          setBusy(false)
          if (result.ok) setRestoreId('')
        }}
      />
    </Panel>
  )
}
