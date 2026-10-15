import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { productFromNotice, ProductThumb } from '@/components/ProductPicker'
import { Button } from '@/components/ui/Button'
import { PageHeader, Panel } from '@/components/ui/Feedback'
import { useApp } from '@/context/AppContext'
import { noticeGroups, noticesIn } from '@/features/notifications/groups'
import { useI18n } from '@/i18n/LanguageContext'
import { formatDateTime } from '@/utils/dates'

export function NotificationCenter() {
  const { notifications, products, readNotification, readAllNotifications, unreadCount, user } = useApp()
  const { t } = useI18n()
  const [groupId, setGroupId] = useState('all')
  const marking = useRef(false)
  useEffect(() => {
    if (user?.role !== 'admin' || unreadCount === 0 || marking.current) return
    marking.current = true
    void readAllNotifications().finally(() => {
      marking.current = false
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- call once per unread count, not on every context render
  }, [user?.role, unreadCount])
  const group = noticeGroups.find((item) => item.id === groupId) ?? noticeGroups[0]
  const visible = user?.role === 'admin' ? noticesIn(notifications, group.types) : notifications
  return (
    <div>
      <PageHeader
        title={t('pageNotifications')}
        description={t('pageNotificationsBody')}
        actions={<Button variant="secondary" disabled={!unreadCount} onClick={() => readAllNotifications()}>{t('pageMarkRead')}</Button>}
      />
      {user?.role === 'admin' && (
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          {noticeGroups.map((item) => {
            const count = noticesIn(notifications, item.types).length
            const unread = noticesIn(notifications, item.types).filter((notice) => !notice.read).length
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setGroupId(item.id)}
                className={`rounded-2xl border px-3 py-3 text-left ${groupId === item.id ? 'border-amber-700 bg-amber-50' : 'border-line bg-white'}`}
              >
                <span className="block text-2xl font-semibold">{count}</span>
                <span className="mt-1 block text-sm text-stone-600">{t(item.labelKey)}</span>
                {unread > 0 && <span className="mt-1 block text-xs font-semibold text-amber-800">{unread} unread</span>}
              </button>
            )
          })}
        </div>
      )}
      <div className="space-y-3">
        {visible.map((item) => {
          const product = productFromNotice(products, item)
          return (
          <Panel key={item.id} className={item.read ? 'opacity-70' : ''}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                {product && <ProductThumb src={product.imageUrl} name={product.name} className="h-12 w-12 shrink-0" />}
                <div>
                <p className="font-semibold">{item.title}</p>
                <p className="mt-1 text-sm text-stone-600">{item.message}</p>
                <p className="mt-2 text-xs text-stone-500">{formatDateTime(item.createdAt)} · {item.read ? 'Read' : 'Unread'}{item.resolvedAt ? ' · Resolved' : ''}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Link to={item.href} className="inline-flex h-9 items-center rounded-lg border border-stone-300 px-3 text-sm font-semibold">Open</Link>
                {!item.read && <Button size="sm" variant="secondary" onClick={() => readNotification(item.id)}>Mark read</Button>}
              </div>
            </div>
          </Panel>
          )
        })}
        {!visible.length && <Panel><p className="text-sm text-stone-500">No notifications yet.</p></Panel>}
      </div>
    </div>
  )
}
