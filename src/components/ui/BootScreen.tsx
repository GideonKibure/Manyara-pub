import { useEffect, useState, type PointerEvent } from 'react'
import { BrandLogo } from '@/components/BrandLogo'
import { useI18n } from '@/i18n/LanguageContext'
import type { MessageKey } from '@/i18n/messages'
import { cn } from '@/utils/cn'

const STEPS: MessageKey[] = ['bootStepStock', 'bootStepSales', 'bootStepBills']

export function BootScreen({ message, hint }: { message?: string; hint?: string }) {
  const { t } = useI18n()
  const [step, setStep] = useState(0)
  const [cheers, setCheers] = useState(0)
  const [glow, setGlow] = useState({ x: 50, y: 28 })

  useEffect(() => {
    const timer = window.setInterval(() => setStep((current) => (current + 1) % STEPS.length), 1600)
    return () => window.clearInterval(timer)
  }, [])

  function moveGlow(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    setGlow({
      x: ((event.clientX - box.left) / box.width) * 100,
      y: ((event.clientY - box.top) / box.height) * 100,
    })
  }

  const fill = ((step + 1) / STEPS.length) * 100

  return (
    <div
      className="boot-splash"
      role="status"
      aria-live="polite"
      aria-busy="true"
      onPointerMove={moveGlow}
    >
      <div className="boot-splash-veil" aria-hidden="true" />
      <div className="boot-splash-grain" aria-hidden="true" />
      <div className="boot-splash-glow" aria-hidden="true" style={{ left: `${glow.x}%`, top: `${glow.y}%` }} />
      <div className="boot-sparks" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="boot-board">
        <div className="boot-hang">
          <span className="boot-chain" aria-hidden="true" />
          <button
            type="button"
            className={cn('boot-logo-wrap', cheers % 2 ? 'boot-cheers' : '')}
            onClick={() => setCheers((count) => count + 1)}
            aria-label={t('bootTapHint')}
          >
            <span className="boot-logo-halo" aria-hidden="true" />
            <span className="boot-logo-plate">
              <BrandLogo className="boot-logo" />
            </span>
          </button>
        </div>
        <p className="boot-open" aria-hidden="true">
          Open
        </p>
        <p className="boot-sign">
          Manyara <span>Pub</span>
        </p>
        <p className="boot-title">{message ?? t('bootLoading')}</p>
        <p className="boot-hint">{hint ?? t('bootLoadingHint')}</p>
        <div className="boot-trough" aria-hidden="true">
          <span className="boot-tap" />
          <span className="boot-trough-fill" style={{ width: `${fill}%` }} />
        </div>
        <div className="boot-rail">
          {STEPS.map((key, index) => (
            <button
              key={key}
              type="button"
              className={cn('boot-bottle', index === step && 'on', index < step && 'done')}
              onClick={() => setStep(index)}
              aria-pressed={index === step}
            >
              <span className="boot-bottle-neck" aria-hidden="true" />
              <span className="boot-bottle-body" aria-hidden="true" />
              <span className="boot-bottle-label">{t(key)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function LoadErrorScreen({ error, onBack }: { error: string; onBack: () => void }) {
  const { t } = useI18n()
  return (
    <div className="boot-splash">
      <div className="boot-splash-veil" aria-hidden="true" />
      <div className="boot-splash-grain" aria-hidden="true" />
      <div className="boot-splash-glow" aria-hidden="true" />
      <div className="boot-board">
        <div className="boot-hang">
          <span className="boot-chain" aria-hidden="true" />
          <div className="boot-logo-wrap">
            <span className="boot-logo-halo" aria-hidden="true" />
            <span className="boot-logo-plate">
              <BrandLogo className="boot-logo" />
            </span>
          </div>
        </div>
        <p className="boot-sign">
          Manyara <span>Pub</span>
        </p>
        <p className="boot-title">{t('loadErrorTitle')}</p>
        <p className="boot-hint">{error}</p>
        <button type="button" className="boot-error-back" onClick={onBack}>
          {t('loadErrorBack')}
        </button>
      </div>
    </div>
  )
}
