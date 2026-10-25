import { useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Camera, Check, KeyRound, Mail, Phone, Shield, UserRound } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Fields'
import { PersonPhoto } from '@/components/ProductPicker'
import { useApp } from '@/context/AppContext'
import { LanguageSwitch, useI18n } from '@/i18n/LanguageContext'
import { passwordChangeSchema, profileSchema } from '@/schemas'
import { cn } from '@/utils/cn'
import { formatDateTime } from '@/utils/dates'
import { storeProfileImage } from '@/utils/image'

export function ProfilePage() {
  const { user, saveProfile, changeOwnPassword } = useApp()
  const { t } = useI18n()
  const profileForm = useForm({ resolver: zodResolver(profileSchema), defaultValues: { fullName: user?.fullName ?? '', phone: user?.phone ?? '' } })
  const passwordForm = useForm({ resolver: zodResolver(passwordChangeSchema), defaultValues: { current: '', password: '', confirm: '' } })
  const fileRef = useRef<HTMLInputElement>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [profileFlash, setProfileFlash] = useState(false)

  async function savePhoto(imageUrl: string) {
    if (!user) return
    setPhotoBusy(true)
    setPhotoError('')
    const result = await saveProfile({ fullName: user.fullName, phone: user.phone, imageUrl })
    setPhotoBusy(false)
    if (!result.ok) setPhotoError(result.error)
  }

  const facts = [
    { icon: UserRound, label: t('username'), value: user?.username ? `@${user.username}` : '—' },
    { icon: Mail, label: t('email'), value: user?.email || '—' },
    { icon: Phone, label: t('phone'), value: user?.phone || '—' },
    { icon: Shield, label: t('profileAccess'), value: user?.canSubmitActivities ? t('profileActivityOn') : t('profileActivityOff') },
  ]

  return (
    <div className="prof-page">
      <section className="prof-hero">
        <div className="prof-hero-glow" aria-hidden="true" />
        <div className="relative flex flex-col items-center gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex w-full min-w-0 flex-col items-center gap-4 sm:flex-row sm:items-center">
            <div className="prof-photo">
              <PersonPhoto src={user?.imageUrl} name={user?.fullName ?? 'M'} className="h-full w-full text-3xl" />
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
                    setPhotoError(caught instanceof Error ? caught.message : t('profilePhotoFail'))
                  }
                }}
              />
              <button
                type="button"
                className="prof-cam"
                disabled={photoBusy}
                aria-label={user?.imageUrl ? t('staffChangePhoto') : t('staffPhoto')}
                onClick={() => fileRef.current?.click()}
              >
                <Camera className="h-4 w-4" />
              </button>
            </div>
            <div className="min-w-0 text-center sm:text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">{t('pageProfile')}</p>
              <h1 className="mt-1 font-display text-3xl leading-tight text-white sm:text-4xl">{user?.fullName}</h1>
              <p className="mt-1 text-sm text-white/70">@{user?.username}</p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <span className="prof-role">{user?.role === 'admin' ? t('profileRoleAdmin') : t('profileRoleEmployee')}</span>
                {user?.lastLoginAt ? (
                  <span className="text-xs text-white/55">{t('profileLastLogin')} {formatDateTime(user.lastLoginAt)}</span>
                ) : null}
              </div>
              {user?.imageUrl ? (
                <button type="button" className="mt-3 text-xs font-semibold text-amber-200 underline-offset-2 hover:underline" onClick={() => void savePhoto('')}>
                  {t('staffRemovePhoto')}
                </button>
              ) : null}
              {photoError ? <p className="mt-2 text-sm text-rose-200">{photoError}</p> : null}
            </div>
          </div>
          <LanguageSwitch glass className="shrink-0" />
        </div>
      </section>

      <div className="prof-facts">
        {facts.map((fact) => {
          const Icon = fact.icon
          return (
            <article key={fact.label} className="prof-fact">
              <span className="prof-fact-icon">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">{fact.label}</p>
                <p className="mt-0.5 truncate text-sm font-semibold text-ink">{fact.value}</p>
              </div>
            </article>
          )
        })}
      </div>

      <div className="prof-grid">
        <section className="prof-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">{t('profileContact')}</p>
              <h2 className="mt-1 font-display text-xl text-ink">{t('profileContactTitle')}</h2>
              <p className="mt-1 text-sm text-stone-500">{t('pageProfileBody')}</p>
            </div>
            {profileFlash ? <span className="prof-ok"><Check className="h-4 w-4" />{t('save')}</span> : null}
          </div>
          <form
            className="mt-5 grid gap-4"
            onSubmit={profileForm.handleSubmit(async (values) => {
              const result = await saveProfile(values)
              if (result.ok) {
                setProfileFlash(true)
                window.setTimeout(() => setProfileFlash(false), 1800)
              }
            })}
          >
            <Field label={t('fullName')} error={profileForm.formState.errors.fullName?.message}>
              <TextInput {...profileForm.register('fullName')} />
            </Field>
            <Field label={t('phone')} error={profileForm.formState.errors.phone?.message}>
              <TextInput {...profileForm.register('phone')} />
            </Field>
            <Button type="submit" variant="gold" className="w-full sm:w-auto" loading={profileForm.formState.isSubmitting}>
              {t('profileSave')}
            </Button>
          </form>
        </section>

        <section className="prof-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">
                <KeyRound className="h-3.5 w-3.5" />
                {t('profilePassword')}
              </p>
              <h2 className="mt-1 font-display text-xl text-ink">{t('profilePasswordTitle')}</h2>
              <p className="mt-1 text-sm text-stone-500">{t('profilePasswordBody')}</p>
            </div>
          </div>
          <form
            className="mt-5 grid gap-4"
            onSubmit={passwordForm.handleSubmit(async (values) => {
              await changeOwnPassword(values.current, values.password)
            })}
          >
            <Field label={t('passwordCurrent')} error={passwordForm.formState.errors.current?.message}>
              <TextInput type="password" autoComplete="current-password" {...passwordForm.register('current')} />
            </Field>
            <Field label={t('passwordNew')} error={passwordForm.formState.errors.password?.message}>
              <TextInput type="password" autoComplete="new-password" {...passwordForm.register('password')} />
            </Field>
            <Field label={t('passwordConfirm')} error={passwordForm.formState.errors.confirm?.message}>
              <TextInput type="password" autoComplete="new-password" {...passwordForm.register('confirm')} />
            </Field>
            <Button type="submit" className="w-full sm:w-auto" loading={passwordForm.formState.isSubmitting}>
              {t('profileChangePassword')}
            </Button>
          </form>
        </section>
      </div>
    </div>
  )
}
