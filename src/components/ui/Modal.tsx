import { useEffect, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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
  return createPortal(
    <div className={cn('fixed inset-0 z-[80] flex justify-center', centered ? 'items-center p-4 sm:p-6' : 'items-end p-0 sm:items-center sm:p-4')}>
      <button className="absolute inset-0 bg-stone-950/55 backdrop-blur-xl" aria-label={t('closeDialog')} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'relative flex w-full flex-col overflow-hidden bg-[#faf7f2] shadow-[0_24px_64px_rgba(28,25,23,0.28)]',
          centered
            ? 'max-h-[min(85dvh,40rem)] max-w-[min(28rem,calc(100vw-2rem))] rounded-3xl'
            : `max-h-[92dvh] rounded-t-2xl sm:rounded-2xl ${wide ? 'max-w-3xl' : 'max-w-lg'}`,
        )}
      >
        <div className="sticky top-0 z-30 flex shrink-0 items-start justify-between gap-4 border-b border-[#e6e0d6] bg-[#faf7f2] px-4 py-3.5 sm:px-5">
          <h2 id={titleId} className="font-display text-lg leading-snug text-ink sm:text-xl">
            {title}
          </h2>
          <button className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#e6e0d6] bg-white text-stone-600 shadow-sm hover:bg-stone-50" onClick={onClose} aria-label={t('close')}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4">{children}</div>
      </div>
    </div>,
    document.body,
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
