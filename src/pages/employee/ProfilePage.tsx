import { useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Fields'
import { PageHeader, Panel } from '@/components/ui/Feedback'
import { PersonPhoto } from '@/components/ProductPicker'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import { passwordChangeSchema, profileSchema } from '@/schemas'
import { storeProfileImage } from '@/utils/image'

export function ProfilePage() {
  const { user, saveProfile, changeOwnPassword } = useApp()
  const { t } = useI18n()
  const profileForm = useForm({ resolver: zodResolver(profileSchema), defaultValues: { fullName: user?.fullName ?? '', phone: user?.phone ?? '' } })
  const passwordForm = useForm({ resolver: zodResolver(passwordChangeSchema), defaultValues: { current: '', password: '', confirm: '' } })
  const fileRef = useRef<HTMLInputElement>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const ownPhoto = user?.role === 'admin'

  async function savePhoto(imageUrl: string) {
    if (!user) return
    setPhotoBusy(true)
    setPhotoError('')
    const result = await saveProfile({ fullName: user.fullName, phone: user.phone, imageUrl })
    setPhotoBusy(false)
    if (!result.ok) setPhotoError(result.error)
  }
  return (
    <div className="space-y-4">
      <PageHeader title={t('pageProfile')} description={t('pageProfileBody')} />
      <Panel>
        <div className="mb-4 flex items-center gap-4">
          <PersonPhoto src={user?.imageUrl} name={user?.fullName ?? 'M'} className="h-20 w-20 text-2xl" />
          <div>
            <p className="text-lg font-semibold">{user?.fullName}</p>
            <p className="text-sm capitalize text-stone-500">{user?.role}</p>
            {ownPhoto && (
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (!file) return
                    setPhotoBusy(true)
                    setPhotoError('')
                    try {
                      await savePhoto(await storeProfileImage(file))
                    } catch (caught) {
                      setPhotoBusy(false)
                      setPhotoError(caught instanceof Error ? caught.message : 'Could not save that photo.')
                    }
                  }}
                />
                <Button size="sm" variant="secondary" loading={photoBusy} onClick={() => fileRef.current?.click()}>{user?.imageUrl ? t('staffChangePhoto') : t('staffPhoto')}</Button>
                {user?.imageUrl && <Button size="sm" variant="secondary" onClick={() => savePhoto('')}>{t('staffRemovePhoto')}</Button>}
              </div>
            )}
            {photoError && <p className="mt-2 text-sm text-rose-700">{photoError}</p>}
          </div>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-stone-500">Username</dt><dd className="font-medium">{user?.username}</dd></div>
          <div><dt className="text-stone-500">Email</dt><dd className="font-medium">{user?.email}</dd></div>
          <div><dt className="text-stone-500">Role</dt><dd className="font-medium capitalize">{user?.role}</dd></div>
          <div><dt className="text-stone-500">Activity income</dt><dd className="font-medium">{user?.canSubmitActivities ? 'Allowed' : 'Not allowed'}</dd></div>
        </dl>
      </Panel>
      <Panel>
        <h2 className="mb-4 font-semibold">Contact details</h2>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={profileForm.handleSubmit(async (values) => { await saveProfile(values) })}>
          <Field label="Full name" error={profileForm.formState.errors.fullName?.message}><TextInput {...profileForm.register('fullName')} /></Field>
          <Field label="Phone" error={profileForm.formState.errors.phone?.message}><TextInput {...profileForm.register('phone')} /></Field>
          <Button type="submit" variant="gold" loading={profileForm.formState.isSubmitting}>Save profile</Button>
        </form>
      </Panel>
      <Panel>
        <h2 className="mb-4 font-semibold">Password</h2>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={passwordForm.handleSubmit(async (values) => {
          const result = await changeOwnPassword(values.current, values.password)
          if (result.ok) passwordForm.reset()
        })}>
          <Field label="Current password" error={passwordForm.formState.errors.current?.message}><TextInput type="password" {...passwordForm.register('current')} /></Field>
          <Field label="New password" error={passwordForm.formState.errors.password?.message}><TextInput type="password" {...passwordForm.register('password')} /></Field>
          <Field label="Confirm password" error={passwordForm.formState.errors.confirm?.message}><TextInput type="password" {...passwordForm.register('confirm')} /></Field>
          <div className="md:col-span-2"><Button type="submit" loading={passwordForm.formState.isSubmitting}>Change password</Button></div>
        </form>
      </Panel>
    </div>
  )
}
