import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { productFromNotice, ProductThumb } from '@/components/ProductPicker'
import { Button } from '@/components/ui/Button'
import { PageHeader, Panel } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Modal'
import { useApp } from '@/context/AppContext'
import { noticeGroups, noticesIn } from '@/features/notifications/groups'
import { useI18n } from '@/i18n/LanguageContext'
import { formatDateTime } from '@/utils/dates'

export function NotificationCenter() {
  const { notifications, products, readAllNotifications, setNotificationsRead, removeNotifications, unreadCount, user } = useApp()
  const { t } = useI18n()
  const [groupId, setGroupId] = useState('all')
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null)
  const group = noticeGroups.find((item) => item.id === groupId) ?? noticeGroups[0]
  const visible = user?.role === 'admin' ? noticesIn(notifications, group.types) : notifications
  const visibleIds = useMemo(() => visible.map((item) => item.id), [visible])
  const chosen = selected.filter((id) => visibleIds.includes(id))
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => chosen.includes(id))

  const toggle = (id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  const toggleAll = () => {
    setSelected(allVisibleSelected ? selected.filter((id) => !visibleIds.includes(id)) : [...new Set([...selected, ...visibleIds])])
  }

  const markChosen = async (read: boolean) => {
    if (!chosen.length) return
    setBusy(true)
    await setNotificationsRead(chosen, read)
    setBusy(false)
    setSelected([])
  }

  return (
    <div>
      <PageHeader
        title={t('pageNotifications')}
        description={t('pageNotificationsBody')}
        actions={
          <>
            <Button variant="secondary" disabled={!chosen.length || busy} onClick={() => markChosen(true)}>
              {t('noticeMarkSelected')}
            </Button>
            <Button variant="secondary" disabled={!chosen.length || busy} onClick={() => markChosen(false)}>
              {t('noticeMarkUnreadSelected')}
            </Button>
            <Button variant="danger" disabled={!chosen.length || busy} onClick={() => setPendingDelete(chosen)}>
              {t('noticeDeleteSelected')}
            </Button>
            <Button variant="secondary" disabled={!unreadCount || busy} onClick={() => readAllNotifications()}>
              {t('pageMarkRead')}
            </Button>
          </>
        }
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
                {unread > 0 && (
                  <span className="mt-1 block text-xs font-semibold text-amber-800">
                    {unread} {t('noticeUnread').toLowerCase()}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
      {visible.length > 0 && (
        <label className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
          <input type="checkbox" className="h-4 w-4 accent-amber-700" checked={allVisibleSelected} onChange={toggleAll} />
          {t('noticeSelectAll')}
        </label>
      )}
      <div className="space-y-3">
        {visible.map((item) => {
          const product = productFromNotice(products, item)
          return (
            <Panel key={item.id} className={item.read ? 'opacity-70' : ''}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 accent-amber-700"
                    checked={chosen.includes(item.id)}
                    onChange={() => toggle(item.id)}
                    aria-label={item.title}
                  />
                  {product && <ProductThumb src={product.imageUrl} name={product.name} className="h-12 w-12 shrink-0" />}
                  <div>
                    <p className="font-semibold">{item.title}</p>
                    <p className="mt-1 text-sm text-stone-600">{item.message}</p>
                    <p className="mt-2 text-xs text-stone-500">
                      {formatDateTime(item.createdAt)} · {item.read ? t('noticeRead') : t('noticeUnread')}
                      {item.resolvedAt ? ` · ${t('noticeResolved')}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link to={item.href} className="inline-flex h-9 items-center rounded-lg border border-stone-300 px-3 text-sm font-semibold">
                    {t('noticeOpen')}
                  </Link>
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => setNotificationsRead([item.id], !item.read)}>
                    {item.read ? t('noticeMarkUnread') : t('noticeMarkRead')}
                  </Button>
                  <Button size="sm" variant="danger" disabled={busy} onClick={() => setPendingDelete([item.id])}>
                    {t('noticeDelete')}
                  </Button>
                </div>
              </div>
            </Panel>
          )
        })}
        {!visible.length && (
          <Panel>
            <p className="text-sm text-stone-500">{t('noNotifications')}</p>
          </Panel>
        )}
      </div>
      <ConfirmDialog
        open={Boolean(pendingDelete?.length)}
        title={t('noticeDeleteTitle')}
        body={t('noticeDeleteBody')}
        confirmLabel={t('noticeDelete')}
        tone="danger"
        loading={busy}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete?.length) return
          setBusy(true)
          const result = await removeNotifications(pendingDelete)
          setBusy(false)
          if (result.ok) {
            setSelected((current) => current.filter((id) => !pendingDelete.includes(id)))
            setPendingDelete(null)
          }
        }}
      />
    </div>
  )
}
