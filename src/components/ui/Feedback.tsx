import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '@/i18n/LanguageContext'
import type { ApprovalStatus, StockLevel } from '@/types'
import { cn } from '@/utils/cn'

const statusStyles: Record<ApprovalStatus, string> = {
  pending: 'bg-amber-100 text-amber-950',
  approved: 'bg-emerald-100 text-emerald-950',
  rejected: 'bg-rose-100 text-rose-950',
  cancelled: 'bg-stone-200 text-stone-700',
}

const levelStyles: Record<StockLevel, string> = {
  normal: 'bg-emerald-100 text-emerald-950',
  low: 'bg-amber-100 text-amber-950',
  out: 'bg-rose-100 text-rose-950',
}

export function StatusBadge({ status }: { status: ApprovalStatus }) {
  const { t } = useI18n()
  const label = { pending: t('statusPending'), approved: t('statusApproved'), rejected: t('statusRejected'), cancelled: t('statusCancelled') }[status]
  return <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', statusStyles[status])}>{label}</span>
}

export function StockBadge({ level }: { level: StockLevel }) {
  const { t } = useI18n()
  const label = { low: t('stockLow'), out: t('stockOut'), normal: t('stockNormal') }[level]
  return <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', levelStyles[level])}>{label}</span>
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold leading-tight tracking-tight text-ink sm:text-[1.65rem] md:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-sm leading-6 text-stone-600 sm:text-[15px]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({ label, value, hint, tone = 'default' }: { label: string; value: string; hint?: string; tone?: 'default' | 'warn' | 'danger' | 'good' }) {
  const toneClass = { default: '', warn: 'bg-amber-50/55', danger: 'bg-rose-50/55', good: 'bg-emerald-50/55' }[tone]
  return (
    <article className={cn('glass-panel reveal-card min-w-0 rounded-2xl p-3 sm:p-4', toneClass)}>
      <p className="text-sm leading-5 text-stone-600">{label}</p>
      <p className="mt-1 break-words text-xl font-semibold tabular-nums tracking-tight text-ink sm:mt-2 sm:text-2xl">{value}</p>
      {hint && <p className="mt-1 text-xs leading-5 text-stone-500">{hint}</p>}
    </article>
  )
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="glass-panel rounded-2xl border-dashed px-6 py-12 text-center">
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm text-stone-500">{body}</p>
    </div>
  )
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('glass-panel reveal-card rounded-2xl p-4 md:p-5', className)}>{children}</section>
}

export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Array<{ id: string; tone: 'success' | 'error'; message: string }>
  onDismiss: (id: string) => void
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto flex w-full max-w-md items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm text-white shadow-lg',
            toast.tone === 'error' ? 'bg-rose-800' : 'bg-charcoal',
          )}
        >
          <span>{toast.message}</span>
          <button className="rounded p-1 hover:bg-white/10" aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
