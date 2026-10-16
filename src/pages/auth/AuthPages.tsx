import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Fields'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import { consumeLockReason } from '@/lib/sessionLock'
import { forgotSchema, loginSchema, resetSchema, type LoginValues } from '@/schemas'

export function LoginPage() {
  const { login } = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [show, setShow] = useState(false)
  const [notice] = useState(consumeLockReason)
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  })

  return (
    <div>
      {notice && (
        <p className="mb-4 rounded-xl border border-amber-200/30 bg-amber-500/15 px-3 py-2 text-sm text-amber-50">
          {notice === 'idle' ? t('authSignedOutIdle') : t('authSignedOutRefresh')}
        </p>
      )}
      <h1 className="text-center font-display text-3xl font-semibold tracking-tight text-white">{t('authWelcome')}</h1>
      <p className="mt-2 text-center text-sm leading-6 text-white/70">{t('authRoleNote')}</p>
      <form
        className="mt-7 space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          const result = await login(values.identifier, values.password)
          if (!result.ok) {
            form.setError('password', { message: result.error })
            return
          }
          navigate(result.meta?.role === 'admin' ? '/admin/dashboard' : '/employee/dashboard', { replace: true })
        })}
        noValidate
      >
        <Field light label={t('authEmail')} error={form.formState.errors.identifier?.message}>
          <TextInput autoComplete="username" className="auth-input" {...form.register('identifier')} />
        </Field>
        <Field light label={t('authPassword')} error={form.formState.errors.password?.message}>
          <div className="relative">
            <TextInput type={show ? 'text' : 'password'} autoComplete="current-password" className="auth-input pr-12" {...form.register('password')} />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70" aria-label={show ? t('authHide') : t('authShow')} onClick={() => setShow((current) => !current)}>
              {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-amber-200 hover:text-amber-100">
            {t('authForgot')}
          </Link>
        </div>
        <Button type="submit" className="auth-login w-full border-0" loading={form.formState.isSubmitting}>
          {t('authSignIn')}
        </Button>
      </form>
    </div>
  )
}

export function ForgotPasswordPage() {
  const { requestReset } = useApp()
  const { t } = useI18n()
  const [link, setLink] = useState('')
  const [message, setMessage] = useState('')
  const form = useForm<{ email: string }>({ resolver: zodResolver(forgotSchema), defaultValues: { email: '' } })

  return (
    <div>
      <h1 className="text-center font-display text-3xl font-semibold text-white">{t('authResetTitle')}</h1>
      <p className="mt-2 text-center text-sm leading-6 text-white/70">{t('authResetBody')}</p>
      <form
        className="mt-7 space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          const result = await requestReset(values.email)
          if (!result.ok) return
          setMessage(result.message ?? '')
          setLink(result.meta?.resetUrl ? `${window.location.origin}${result.meta.resetUrl}` : '')
        })}
      >
        <Field light label={t('authEmailAddress')} error={form.formState.errors.email?.message}>
          <TextInput type="email" autoComplete="email" className="auth-input" {...form.register('email')} />
        </Field>
        <Button type="submit" className="auth-login w-full border-0" loading={form.formState.isSubmitting}>
          {t('authCreateReset')}
        </Button>
      </form>
      {message && <p className="mt-4 text-sm text-white/70">{message}</p>}
      {link && (
        <Link to={link.replace(window.location.origin, '')} className="mt-3 block break-all text-sm font-semibold text-amber-200">
          {t('authOpenReset')}
        </Link>
      )}
      <Link to="/login" className="mt-6 block text-center text-sm font-semibold text-amber-100">
        {t('authBack')}
      </Link>
    </div>
  )
}

export function ResetPasswordPage() {
  const { resetWithToken, supabaseConfigured } = useApp()
  const { t } = useI18n()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''
  const canReset = supabaseConfigured || Boolean(token)
  const form = useForm<{ password: string; confirm: string }>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirm: '' },
  })

  return (
    <div>
      <h1 className="text-center font-display text-3xl font-semibold text-white">{t('authNewPassword')}</h1>
      {supabaseConfigured && <p className="mt-2 text-center text-sm text-white/70">{t('authResetHint')}</p>}
      {!supabaseConfigured && !token && <p className="mt-4 text-center text-sm text-rose-200">{t('authMissingToken')}</p>}
      <form
        className="mt-7 space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          const result = await resetWithToken(token, values.password)
          if (result.ok) navigate('/login', { replace: true })
          else form.setError('password', { message: result.error })
        })}
      >
        <Field light label={t('authPassword')} error={form.formState.errors.password?.message}>
          <TextInput type="password" autoComplete="new-password" className="auth-input" {...form.register('password')} />
        </Field>
        <Field light label={t('authConfirmPassword')} error={form.formState.errors.confirm?.message}>
          <TextInput type="password" autoComplete="new-password" className="auth-input" {...form.register('confirm')} />
        </Field>
        <Button type="submit" className="auth-login w-full border-0" disabled={!canReset} loading={form.formState.isSubmitting}>
          {t('authUpdatePassword')}
        </Button>
      </form>
    </div>
  )
}
