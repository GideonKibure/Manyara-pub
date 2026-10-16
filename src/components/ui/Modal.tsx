import { useEffect, useId, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/i18n/LanguageContext'
import { cn } from '@/utils/cn'

export function Modal({
  open,
  title,
  onClose,
  children,
  wide = false,
  centered = false,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
  centered?: boolean
}) {
  const { t } = useI18n()
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className={cn('fixed inset-0 z-[60] flex justify-center', centered ? 'items-center p-4 sm:p-6' : 'items-end p-0 sm:items-center sm:p-4')}>
      <button className={cn('absolute inset-0', centered ? 'bg-stone-950/45 backdrop-blur-md' : 'bg-black/50')} aria-label={t('closeDialog')} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn('relative w-full overflow-y-auto bg-white shadow-2xl', centered ? 'max-h-[min(85dvh,40rem)] max-w-[min(28rem,calc(100vw-2rem))] rounded-3xl p-5' : `max-h-[92dvh] rounded-t-2xl p-4 sm:rounded-2xl sm:p-5 ${wide ? 'max-w-3xl' : 'max-w-lg'}`)}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-xl font-semibold text-ink">
            {title}
          </h2>
          <button className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-stone-200 text-stone-600 hover:bg-stone-100" onClick={onClose} aria-label={t('close')}>
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = 'primary',
  loading = false,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  cancelLabel?: string
  tone?: 'primary' | 'danger'
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <p className="text-sm leading-6 text-stone-600">{body}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          {cancelLabel ?? t('cancel')}
        </Button>
        <Button variant={tone === 'danger' ? 'danger' : 'gold'} loading={loading} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
