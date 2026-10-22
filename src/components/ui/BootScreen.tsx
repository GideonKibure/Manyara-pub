import { useEffect, useState } from 'react'
import { BrandLogo } from '@/components/BrandLogo'
import { useI18n } from '@/i18n/LanguageContext'
import type { MessageKey } from '@/i18n/messages'

const STEPS: MessageKey[] = ['bootStepStock', 'bootStepSales', 'bootStepBills']

export function BootScreen({ message, hint }: { message?: string; hint?: string }) {
  const { t } = useI18n()
  const [step, setStep] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setStep((current) => (current + 1) % STEPS.length), 900)
    return () => window.clearInterval(timer)
  }, [])
  return (
    <div className="boot-splash" role="status" aria-live="polite" aria-busy="true">
      <div className="boot-splash-glow" aria-hidden="true" />
      <div className="boot-splash-card">
        <div className="boot-logo-wrap">
          <span className="boot-logo-ring" aria-hidden="true" />
          <span className="boot-logo-plate">
            <BrandLogo className="boot-logo" />
          </span>
        </div>
        <p className="boot-kicker">Manyara Pub</p>
        <p className="boot-title">{message ?? t('bootLoading')}</p>
        <p className="boot-hint">{hint ?? t('bootLoadingHint')}</p>
        <p className="boot-step">{t(STEPS[step])}</p>
        <div className="boot-dots" aria-hidden="true">
          {STEPS.map((key, index) => (
            <span key={key} className={index === step ? 'on' : ''} />
          ))}
        </div>
        <div className="boot-track">
          <span className="boot-bar" />
        </div>
      </div>
    </div>
  )
}

export function LoadErrorScreen({ error, onBack }: { error: string; onBack: () => void }) {
  const { t } = useI18n()
  return (
    <div className="boot-splash">
      <div className="boot-splash-glow" aria-hidden="true" />
      <div className="boot-splash-card">
        <div className="boot-logo-wrap">
          <span className="boot-logo-plate">
            <BrandLogo className="boot-logo" />
          </span>
        </div>
        <p className="boot-kicker">Manyara Pub</p>
        <p className="boot-title">{t('loadErrorTitle')}</p>
        <p className="boot-hint">{error}</p>
        <button type="button" className="mt-5 rounded-full bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white" onClick={onBack}>
          {t('loadErrorBack')}
        </button>
      </div>
    </div>
  )
}
