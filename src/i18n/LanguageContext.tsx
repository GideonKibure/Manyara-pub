import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { en, sw, type MessageKey } from '@/i18n/messages'

export type Language = 'en' | 'sw'

const STORAGE_KEY = 'manyara.lang'

interface LanguageValue {
  language: Language
  setLanguage: (language: Language) => void
  t: (key: MessageKey) => string
}

const LanguageContext = createContext<LanguageValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => (localStorage.getItem(STORAGE_KEY) === 'sw' ? 'sw' : 'en'))

  useEffect(() => {
    document.documentElement.lang = language === 'sw' ? 'sw' : 'en'
  }, [language])

  const value = useMemo<LanguageValue>(() => {
    const dictionary = language === 'sw' ? sw : en
    return {
      language,
      setLanguage: (next) => {
        localStorage.setItem(STORAGE_KEY, next)
        setLanguageState(next)
      },
      t: (key) => dictionary[key] ?? en[key],
    }
  }, [language])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useI18n() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error('useI18n must be used inside LanguageProvider')
  return context
}

export function LanguageSwitch({ className = '', roomy = false }: { className?: string; roomy?: boolean }) {
  const { language, setLanguage, t } = useI18n()
  const item = roomy ? 'h-11 flex-1 rounded-lg text-sm' : 'rounded-md px-2 py-1'
  return (
    <div className={`flex rounded-xl border border-line bg-white p-1 text-xs font-semibold ${roomy ? 'w-full gap-1' : ''} ${className}`} role="group" aria-label={t('language')}>
      <button type="button" className={`${item} ${language === 'en' ? 'bg-charcoal text-white' : 'text-stone-600'}`} onClick={() => setLanguage('en')}>
        EN
      </button>
      <button type="button" className={`${item} ${language === 'sw' ? 'bg-charcoal text-white' : 'text-stone-600'}`} onClick={() => setLanguage('sw')}>
        SW
      </button>
    </div>
  )
}
