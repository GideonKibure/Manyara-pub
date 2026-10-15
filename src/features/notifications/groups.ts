import type { MessageKey } from '@/i18n/messages'
import type { AppNotification, NotificationType } from '@/types'

export const noticeGroups: Array<{ id: string; labelKey: MessageKey; types: NotificationType[] | null }> = [
  { id: 'all', labelKey: 'noticeAll', types: null },
  { id: 'stock', labelKey: 'noticeStock', types: ['low_stock', 'out_of_stock'] },
  { id: 'pending', labelKey: 'noticePending', types: ['submission_pending'] },
  { id: 'approved', labelKey: 'noticeApproved', types: ['submission_approved'] },
  { id: 'rejected', labelKey: 'noticeRejected', types: ['submission_rejected'] },
  { id: 'withdrawn', labelKey: 'noticeWithdrawn', types: ['submission_cancelled'] },
  { id: 'adjustments', labelKey: 'noticeAdjustments', types: ['adjustment'] },
]

export function noticesIn(items: AppNotification[], types: NotificationType[] | null) {
  return types ? items.filter((item) => types.includes(item.type)) : items
}
