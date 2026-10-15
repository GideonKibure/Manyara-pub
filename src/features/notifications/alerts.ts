import { snapshotFor } from '@/features/inventory/stock'
import type { AppNotification, Database } from '@/types'
import { uid } from '@/utils/id'

function isStockKey(key: string | undefined, productId: string) {
  return key === `low_stock:${productId}` || key === `out_of_stock:${productId}`
}

export function syncStockAlerts(db: Database, now = new Date().toISOString()): Database {
  if (!db.settings.lowStockAlerts) return db
  const admins = db.profiles.filter((profile) => profile.role === 'admin' && profile.isActive)
  let notifications = db.notifications
  let changed = false

  const commit = (next: AppNotification[]) => {
    notifications = next
    changed = true
  }

  for (const product of db.products) {
    const snap = snapshotFor(db, product.id)
    const activeKey = !product.isActive
      ? null
      : snap.level === 'low'
        ? `low_stock:${product.id}`
        : snap.level === 'out'
          ? `out_of_stock:${product.id}`
          : null

    let local = notifications
    let localChanged = false
    local = local.map((note) => {
      if (!isStockKey(note.dedupeKey, product.id) || note.resolvedAt) return note
      if (note.dedupeKey === activeKey) return note
      localChanged = true
      return { ...note, resolvedAt: now }
    })

    if (activeKey) {
      for (const admin of admins) {
        const open = local.some(
          (note) => note.recipientId === admin.id && note.dedupeKey === activeKey && !note.resolvedAt,
        )
        if (open) continue
        localChanged = true
        const created: AppNotification = {
          id: uid(),
          recipientId: admin.id,
          type: snap.level === 'out' ? 'out_of_stock' : 'low_stock',
          title: snap.level === 'out' ? `${product.name} is out of stock` : `${product.name} is running low`,
          message:
            snap.level === 'out'
              ? `${product.name} has no available stock.`
              : `${product.name} has ${snap.available} available, which is at or below the minimum of ${snap.minimum}.`,
          href: '/admin/inventory',
          read: false,
          createdAt: now,
          dedupeKey: activeKey,
          channels: ['in_app'],
        }
        local = [created, ...local]
      }
    }

    if (localChanged) commit(local)
  }

  if (!changed) return db
  return { ...db, notifications }
}
