import { useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { Checkbox, Field, TextInput } from '@/components/ui/Fields'
import { PageHeader } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { PersonName } from '@/components/ProductPicker'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import { employeeSchema, type EmployeeValues } from '@/schemas'
import type { Profile } from '@/types'
import { storeProfileImage } from '@/utils/image'

export function EmployeesPage() {
  const app = useApp()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const employees = app.profiles.filter((profile) => profile.role === 'employee')
  return (
    <div>
      <PageHeader title={t('pageEmployees')} description={t('pageEmployeesBody')} actions={<Button variant="gold" onClick={() => setOpen(true)}>{t('pageAddEmployee')}</Button>} />
      <DataTable
        rows={employees}
        getRowId={(row) => row.id}
        emptyTitle={t('emptyEmployees')}
        columns={[
          { key: 'name', header: t('fieldName'), render: (row) => <PersonName name={row.fullName} src={row.imageUrl} /> },
          { key: 'email', header: t('authEmailAddress'), className: 'hidden md:table-cell', render: (row) => row.email },
          { key: 'access', header: t('accessCol'), render: (row) => (row.canSubmitActivities ? t('accessWithActivities') : t('accessStockSales')) },
          { key: 'status', header: t('labelStatus'), render: (row) => (row.isActive ? t('fieldActive') : t('inactive')) },
          { key: 'actions', header: '', render: (row) => <AccessButtons profile={row} /> },
        ]}
      />
      {open && <EmployeeDialog onClose={() => setOpen(false)} onCreated={setPassword} />}
      <Modal open={Boolean(password)} title={t('sharePasswordOnce')} onClose={() => setPassword('')}>
        <p className="text-sm text-stone-600">{t('sharePasswordBody')}</p>
        <p className="mt-3 rounded-xl bg-stone-100 px-3 py-2 font-mono text-sm">{password}</p>
        <Button className="mt-4" onClick={() => setPassword('')}>{t('done')}</Button>
      </Modal>
    </div>
  )
}

function AccessButtons({ profile }: { profile: Profile }) {
  const { editEmployee } = useApp()
  const { t } = useI18n()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <div className="flex flex-wrap gap-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          setBusy(true)
          setError('')
          try {
            const imageUrl = await storeProfileImage(file)
            const result = await editEmployee(profile.id, { imageUrl })
            if (!result.ok) setError(result.error)
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Could not save that photo.')
          }
          setBusy(false)
        }}
      />
      <Button size="sm" variant="secondary" loading={busy} onClick={() => fileRef.current?.click()}>{profile.imageUrl ? t('staffChangePhoto') : t('staffPhoto')}</Button>
      {profile.imageUrl && <Button size="sm" variant="secondary" onClick={() => editEmployee(profile.id, { imageUrl: '' })}>{t('staffRemovePhoto')}</Button>}
      <Button size="sm" variant="secondary" onClick={() => editEmployee(profile.id, { isActive: !profile.isActive })}>{profile.isActive ? t('deactivate') : t('activate')}</Button>
      <Button size="sm" variant="secondary" onClick={() => editEmployee(profile.id, { canSubmitActivities: !profile.canSubmitActivities })}>{profile.canSubmitActivities ? t('revokeActivities') : t('allowActivities')}</Button>
      {error && <p className="basis-full text-sm text-rose-700">{error}</p>}
    </div>
  )
}

function EmployeeDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (password: string) => void }) {
  const { t } = useI18n()
  const { addEmployee } = useApp()
  const form = useForm<EmployeeValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: { fullName: '', username: '', email: '', phone: '', password: '', canSubmitActivities: false, canViewStock: true },
  })
  return (
    <Modal open title={t('pageAddEmployee')} onClose={onClose}>
      <form className="space-y-4" onSubmit={form.handleSubmit(async (values) => {
        const result = await addEmployee(values)
        if (result.ok) {
          onCreated(result.meta?.temporaryPassword ?? values.password)
          onClose()
        }
      })}>
        <Field label={t('fullName')} error={form.formState.errors.fullName?.message}><TextInput {...form.register('fullName')} /></Field>
        <Field label={t('username')} error={form.formState.errors.username?.message}><TextInput {...form.register('username')} /></Field>
        <Field label={t('authEmailAddress')} error={form.formState.errors.email?.message}><TextInput type="email" {...form.register('email')} /></Field>
        <Field label={t('phone')} error={form.formState.errors.phone?.message}><TextInput {...form.register('phone')} /></Field>
        <Field label={t('tempPassword')} error={form.formState.errors.password?.message}><TextInput type="text" {...form.register('password')} /></Field>
        <Checkbox label={t('canSubmitActivities')} {...form.register('canSubmitActivities')} />
        <input type="hidden" value="true" {...form.register('canViewStock', { setValueAs: () => true })} />
        <Button type="submit" variant="gold" loading={form.formState.isSubmitting}>{t('createAccount')}</Button>
      </form>
    </Modal>
  )
}
