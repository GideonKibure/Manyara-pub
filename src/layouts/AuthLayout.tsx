import { Navigate, Outlet } from 'react-router-dom'
import { ToastViewport } from '@/components/ui/Feedback'
import { useApp } from '@/context/AppContext'
import { LanguageSwitch, useI18n } from '@/i18n/LanguageContext'

export function AuthLayout() {
  const { user, settings, toasts, dismissToast } = useApp()
  const { t } = useI18n()
  if (user) return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/employee/dashboard'} replace />
  return (
    <div className="relative min-h-screen">
      <img src="/login-bg.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
      <div className="absolute inset-0 bg-stone-950/35" />
      <div className="relative grid min-h-screen lg:grid-cols-2">
        <section className="hidden flex-col justify-between p-12 text-white lg:flex">
          <div>
            <p className="font-display text-4xl">{settings.businessName}</p>
            <p className="mt-4 max-w-md text-lg leading-8 text-stone-100">{t('authTagline')}</p>
          </div>
          <p className="text-sm text-stone-200">{t('authNote')}</p>
        </section>
        <section className="flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-md rounded-3xl bg-paper/95 p-6 shadow-2xl backdrop-blur-md sm:p-8">
            <div className="mb-8 flex items-start justify-between gap-3">
              <div className="lg:hidden">
                <p className="font-display text-3xl text-ink">{settings.businessName}</p>
                <p className="mt-2 text-sm text-stone-600">{t('authSubtitle')}</p>
              </div>
              <LanguageSwitch className="ml-auto" />
            </div>
            <Outlet />
          </div>
        </section>
      </div>
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
