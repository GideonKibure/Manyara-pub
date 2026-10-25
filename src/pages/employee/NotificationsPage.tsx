import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Ban,
  Bell,
  CheckCircle2,
  CircleAlert,
  Clock3,
  PackageMinus,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react'
import { productFromNotice, ProductThumb } from '@/components/ProductPicker'
import { Button } from '@/components/ui/Button'
import { ChainScroll } from '@/components/ui/ChainScroll'
import { PageHeader } from '@/components/ui/Feedback'
import { useApp } from '@/context/AppContext'
import { noticeGroups, noticesIn } from '@/features/notifications/groups'
import { useI18n } from '@/i18n/LanguageContext'
import type { AppNotification, NotificationType } from '@/types'
import { cn } from '@/utils/cn'
import { formatDateTime } from '@/utils/dates'

const WINDOW_MS = 48 * 60 * 60 * 1000

const typeMeta: Record<NotificationType, { icon: typeof Bell; tone: string; label: 'noticeStock' | 'noticePending' | 'noticeApproved' | 'noticeRejected' | 'noticeWithdrawn' | 'noticeAdjustments' }> = {
  low_stock: { icon: CircleAlert, tone: 'from-amber-500 to-orange-800', label: 'noticeStock' },
  out_of_stock: { icon: PackageMinus, tone: 'from-rose-500 to-rose-900', label: 'noticeStock' },
  submission_pending: { icon: Clock3, tone: 'from-sky-500 to-indigo-800', label: 'noticePending' },
  submission_approved: { icon: CheckCircle2, tone: 'from-emerald-500 to-teal-900', label: 'noticeApproved' },
  submission_rejected: { icon: XCircle, tone: 'from-rose-500 to-rose-900', label: 'noticeRejected' },
  submission_cancelled: { icon: Ban, tone: 'from-stone-500 to-stone-800', label: 'noticeWithdrawn' },
  adjustment: { icon: SlidersHorizontal, tone: 'from-violet-500 to-violet-900', label: 'noticeAdjustments' },
}

function remainingLabel(ms: number) {
  const total = Math.max(0, ms)
  const hours = Math.floor(total / 3_600_000)
  const minutes = Math.floor((total % 3_600_000) / 60_000)
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    const rest = hours % 24
    return rest ? `${days}d ${rest}h` : `${days}d`
  }
  if (hours >= 1) return `${hours}h ${minutes}m`
  return `${Math.max(1, minutes)}m`
}

export function NotificationsPage() {
  const app = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(tick)
  }, [])

  const live = useMemo(
    () =>
      app.notifications
        .map((item) => {
          const sent = new Date(item.createdAt).getTime()
          const left = WINDOW_MS - (now - sent)
          return { item, sent, left }
        })
        .filter((row) => Number.isFinite(row.sent) && row.left > 0)
        .sort((a, b) => b.sent - a.sent),
    [app.notifications, now],
  )

  const filters = useMemo(
    () => [
      { id: 'all', label: t('noticeAll') },
      { id: 'unread', label: t('noticeUnread') },
      ...noticeGroups.filter((item) => item.id !== 'all').map((item) => ({ id: item.id, label: t(item.labelKey) })),
    ],
    [t],
  )

  const rows = useMemo(() => {
    const items = live.map((row) => row.item)
    if (filter === 'unread') return live.filter((row) => !row.item.read)
    const group = noticeGroups.find((item) => item.id === filter)
    if (!group || !group.types) return live
    const allowed = new Set(noticesIn(items, group.types).map((item) => item.id))
    return live.filter((row) => allowed.has(row.item.id))
  }, [filter, live])

  const unread = live.filter((row) => !row.item.read).length

  async function openNotice(item: AppNotification) {
    if (!item.read) await app.readNotification(item.id)
    navigate(item.href)
  }

  return (
    <div>
      <PageHeader
        title={t('pageNotifications')}
        description={t('empNoticeBody')}
        actions={
          <Button variant="secondary" disabled={!unread} onClick={() => void app.readAllNotifications()}>
            {t('pageMarkRead')}
          </Button>
        }
      />
      <div className="note-screen mx-auto w-full">
        <header className="note-screen-head">
          <div className="note-glow" aria-hidden="true" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">
                <Bell className="h-3.5 w-3.5" />
                {t('pageNotifications')}
              </p>
              <p className="mt-1 text-sm text-amber-100/80">{t('empNoticeWindow')}</p>
            </div>
            <span className={cn('note-count', unread > 0 && 'is-hot')}>{unread > 0 ? unread : live.length}</span>
          </div>
          <div className="relative mt-3 grid grid-cols-2 gap-2">
            <div className="note-kpi">
              <p className="note-kpi-label">{t('noticeUnread')}</p>
              <p className="note-kpi-value">{unread}</p>
            </div>
            <div className="note-kpi">
              <p className="note-kpi-label">{t('noticeAll')}</p>
              <p className="note-kpi-value">{live.length}</p>
            </div>
          </div>
          <div className="sub-chip-row relative mt-3">
            {filters.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn('sub-chip', filter === item.id && 'is-on')}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>
        <ChainScroll className="note-screen-body hide-scrollbar">
          {rows.map((row, index) => {
            const { item, left } = row
            const meta = typeMeta[item.type]
            const Icon = meta.icon
            const product = productFromNotice(app.products, item)
            const fill = Math.max(4, Math.min(100, Math.round((left / WINDOW_MS) * 100)))
            return (
              <button
                key={item.id}
                type="button"
                className={cn('note-card', item.read ? 'is-read' : 'is-unread', left < 3_600_000 && 'is-leaving')}
                style={{ animationDelay: `${Math.min(index, 14) * 45}ms` }}
                onClick={() => void openNotice(item)}
              >
                {product ? (
                  <ProductThumb src={product.imageUrl} name={product.name} className="note-thumb rounded-2xl" />
                ) : (
                  <span className={cn('note-icon bg-gradient-to-br text-white', meta.tone)}>
                    <Icon className="h-5 w-5" />
                  </span>
                )}
                <span className="min-w-0 flex-1 text-left">
                  <span className="flex items-start justify-between gap-2">
                    <span className="note-title">{item.title}</span>
                    <span className={cn('note-pill', item.read ? 'is-read' : 'is-unread')}>
                      {item.read ? t('noticeRead') : t('noticeUnread')}
                    </span>
                  </span>
                  <span className="note-kind">{t(meta.label)}</span>
                  <span className="note-msg">{item.message}</span>
                  <span className="note-life" aria-hidden="true">
                    <span className="note-life-fill" style={{ width: `${fill}%` }} />
                  </span>
                  <span className="note-meta">
                    <span className="truncate">{formatDateTime(item.createdAt)}</span>
                    <span className="shrink-0 tabular-nums">{remainingLabel(left)} {t('empNoticeLeft')}</span>
                  </span>
                </span>
              </button>
            )
          })}
          {!rows.length && (
            <div className="note-empty">
              <span className="note-empty-icon">
                <Bell className="h-7 w-7" />
              </span>
              <p className="mt-3 text-sm text-stone-500">{t('noNotifications')}</p>
            </div>
          )}
        </ChainScroll>
      </div>
    </div>
  )
}
