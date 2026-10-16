import { useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { Checkbox, Field, TextInput } from '@/components/ui/Fields'
import { PageHeader } from '@/components/ui/Feedback'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { PersonName } from '@/components/ProductPicker'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import { employeeEditSchema, employeeSchema, type EmployeeEditValues, type EmployeeValues } from '@/schemas'
import type { Profile } from '@/types'
import { storeProfileImage } from '@/utils/image'

export function EmployeesPage() {
  const app = useApp()
  const { t } = useI18n()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Profile | null>(null)
  const [removing, setRemoving] = useState<Profile | null>(null)
  const [removingBusy, setRemovingBusy] = useState(false)
  const [password, setPassword] = useState('')
  const employees = app.profiles.filter((profile) => profile.role === 'employee')
  return (
    <div>
      <PageHeader title={t('pageEmployees')} description={t('pageEmployeesBody')} actions={<Button variant="gold" onClick={() => setCreating(true)}>{t('pageAddEmployee')}</Button>} />
      <DataTable
        rows={employees}
        getRowId={(row) => row.id}
        emptyTitle={t('emptyEmployees')}
        columns={[
          { key: 'name', header: t('fieldName'), render: (row) => <PersonName name={row.fullName} src={row.imageUrl} /> },
          { key: 'username', header: t('username'), className: 'hidden md:table-cell', render: (row) => row.username },
          { key: 'contact', header: t('phone'), className: 'hidden lg:table-cell', render: (row) => row.phone || '—' },
          { key: 'access', header: t('accessCol'), render: (row) => (row.canSubmitActivities ? t('accessWithActivities') : t('accessStockSales')) },
          { key: 'status', header: t('labelStatus'), render: (row) => (row.isActive ? t('fieldActive') : t('inactive')) },
          {
            key: 'actions',
            header: '',
            render: (row) => (
              <span className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(row)}>{t('edit')}</Button>
                <Button size="sm" variant="danger" onClick={() => setRemoving(row)}>{t('staffDelete')}</Button>
                <AccessButtons profile={row} />
              </span>
            ),
          },
        ]}
      />
      {creating && (
        <CreateEmployeeDialog
          onClose={() => setCreating(false)}
          onCreated={(next) => {
            setPassword(next)
            setCreating(false)
          }}
        />
      )}
      {editing && (
        <EditEmployeeDialog
          employee={editing}
          onClose={() => setEditing(null)}
          onPassword={(next) => {
            setPassword(next)
            setEditing(null)
          }}
        />
      )}
      <Modal open={Boolean(password)} title={t('sharePasswordOnce')} onClose={() => setPassword('')}>
        <p className="text-sm text-stone-600">{t('sharePasswordBody')}</p>
        <p className="mt-3 rounded-xl bg-stone-100 px-3 py-2 font-mono text-sm">{password}</p>
        <Button className="mt-4" onClick={() => setPassword('')}>{t('done')}</Button>
      </Modal>
      <ConfirmDialog
        open={Boolean(removing)}
        title={t('staffDeleteTitle')}
        body={removing ? `${removing.fullName}. ${t('staffDeleteBody')}` : ''}
        confirmLabel={t('staffDelete')}
        tone="danger"
        loading={removingBusy}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return
          setRemovingBusy(true)
          const result = await app.removeEmployee(removing.id)
          setRemovingBusy(false)
          if (result.ok) setRemoving(null)
        }}
      />
    </div>
  )
}

function AccessButtons({ profile }: { profile: Profile }) {
  const { editEmployee } = useApp()
  const { t } = useI18n()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [prompt, setPrompt] = useState<'deactivate' | 'activate' | 'revoke' | 'allow' | 'photo' | null>(null)

  const notice = prompt === 'deactivate'
    ? { title: t('staffDeactivateTitle'), body: `${profile.fullName}. ${t('staffDeactivateBody')}`, label: t('deactivate'), patch: { isActive: false } }
    : prompt === 'activate'
      ? { title: t('staffActivateTitle'), body: `${profile.fullName}. ${t('staffActivateBody')}`, label: t('activate'), patch: { isActive: true } }
      : prompt === 'revoke'
        ? { title: t('staffRevokeTitle'), body: `${profile.fullName}. ${t('staffRevokeBody')}`, label: t('revokeActivities'), patch: { canSubmitActivities: false } }
        : prompt === 'allow'
          ? { title: t('staffAllowTitle'), body: `${profile.fullName}. ${t('staffAllowBody')}`, label: t('allowActivities'), patch: { canSubmitActivities: true } }
          : prompt === 'photo'
            ? { title: t('staffRemovePhotoTitle'), body: `${profile.fullName}. ${t('staffRemovePhotoBody')}`, label: t('staffRemovePhoto'), patch: { imageUrl: '' } }
            : null

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
      {profile.imageUrl && <Button size="sm" variant="secondary" onClick={() => setPrompt('photo')}>{t('staffRemovePhoto')}</Button>}
      <Button size="sm" variant={profile.isActive ? 'danger' : 'secondary'} onClick={() => setPrompt(profile.isActive ? 'deactivate' : 'activate')}>{profile.isActive ? t('deactivate') : t('activate')}</Button>
      <Button size="sm" variant="secondary" onClick={() => setPrompt(profile.canSubmitActivities ? 'revoke' : 'allow')}>{profile.canSubmitActivities ? t('revokeActivities') : t('allowActivities')}</Button>
      {error && <p className="basis-full text-sm text-rose-700">{error}</p>}
      <ConfirmDialog
        open={Boolean(notice)}
        title={notice?.title ?? ''}
        body={notice?.body ?? ''}
        confirmLabel={notice?.label ?? t('save')}
        tone={prompt === 'deactivate' || prompt === 'photo' ? 'danger' : 'primary'}
        loading={busy}
        onClose={() => setPrompt(null)}
        onConfirm={async () => {
          if (!notice) return
          setBusy(true)
          setError('')
          const result = await editEmployee(profile.id, notice.patch)
          setBusy(false)
          if (!result.ok) setError(result.error)
          else setPrompt(null)
        }}
      />
    </div>
  )
}

function CreateEmployeeDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (password: string) => void }) {
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
        if (result.ok) onCreated(result.meta?.temporaryPassword ?? values.password)
      })}>
        <Field label={t('fullName')} error={form.formState.errors.fullName?.message}><TextInput {...form.register('fullName')} /></Field>
        <Field label={t('username')} error={form.formState.errors.username?.message}><TextInput {...form.register('username')} /></Field>
        <Field label={t('authEmailAddress')} error={form.formState.errors.email?.message}><TextInput type="email" {...form.register('email')} /></Field>
        <Field label={t('phone')} error={form.formState.errors.phone?.message}><TextInput {...form.register('phone')} /></Field>
        <Field label={t('tempPassword')} error={form.formState.errors.password?.message}><TextInput type="text" {...form.register('password')} /></Field>
        <Checkbox label={t('canSubmitActivities')} {...form.register('canSubmitActivities')} />
        <input type="hidden" value="true" {...form.register('canViewStock', { setValueAs: () => true })} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit" variant="gold" loading={form.formState.isSubmitting}>{t('createAccount')}</Button>
        </div>
      </form>
    </Modal>
  )
}

function EditEmployeeDialog({ employee, onClose, onPassword }: { employee: Profile; onClose: () => void; onPassword: (password: string) => void }) {
  const { t } = useI18n()
  const { editEmployee } = useApp()
  const form = useForm<EmployeeEditValues>({
    resolver: zodResolver(employeeEditSchema),
    defaultValues: { fullName: employee.fullName, username: employee.username, phone: employee.phone, password: '' },
  })
  return (
    <Modal open title={t('staffEditTitle')} onClose={onClose}>
      <form className="space-y-4" onSubmit={form.handleSubmit(async (values) => {
        const result = await editEmployee(employee.id, {
          fullName: values.fullName,
          username: values.username,
          phone: values.phone,
          password: values.password || undefined,
        })
        if (!result.ok) return
        if (values.password) onPassword(values.password)
        else onClose()
      })}>
        <Field label={t('fullName')} error={form.formState.errors.fullName?.message}><TextInput {...form.register('fullName')} /></Field>
        <Field label={t('username')} error={form.formState.errors.username?.message}><TextInput {...form.register('username')} /></Field>
        <Field label={t('phone')} error={form.formState.errors.phone?.message}><TextInput {...form.register('phone')} /></Field>
        <Field label={t('passwordNew')} hint={t('staffPasswordHint')} error={form.formState.errors.password?.message}>
          <TextInput type="text" autoComplete="new-password" {...form.register('password')} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit" variant="gold" loading={form.formState.isSubmitting}>{t('save')}</Button>
        </div>
      </form>
    </Modal>
  )
}
