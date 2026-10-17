import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/Modal'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { RecordDeleteKind } from '@/types'

export function AdminDeleteButton({
  kind,
  id,
  label,
}: {
  kind: RecordDeleteKind
  id: string
  label: string
}) {
  const app = useApp()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  if (app.user?.role !== 'admin') return null
  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>{t('deleteRecord')}</Button>
      <ConfirmDialog
        open={open}
        title={t('deleteRecordTitle')}
        body={`${label}. ${t('deleteRecordBody')}`}
        confirmLabel={t('deleteRecord')}
        cancelLabel={t('suppliersCancel')}
        tone="danger"
        loading={busy}
        onClose={() => setOpen(false)}
        onConfirm={async () => {
          setBusy(true)
          const result = await app.deleteRecord(kind, id)
          setBusy(false)
          if (result.ok) setOpen(false)
        }}
      />
    </>
  )
}
