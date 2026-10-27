import type { DayClose, StockInTransaction } from '@/types'

function lineForProduct(close: DayClose, productId: string) {
  return (close.lines ?? []).find((line) => line.productId === productId)
}

export function lastCountedRemaining(
  closes: DayClose[] | undefined,
  productId: string,
  beforeDay: string,
  userId?: string,
): { remaining: number; day: string } | null {
  const matches = (closes ?? []).filter((close) => close.day < beforeDay && lineForProduct(close, productId))
  if (!matches.length) return null
  const day = matches.reduce((latest, close) => (close.day > latest ? close.day : latest), matches[0].day)
  const sameDay = matches.filter((close) => close.day === day)
  const preferred = (userId ? sameDay.find((close) => close.submittedBy === userId) : undefined) ?? sameDay[0]
  const line = lineForProduct(preferred, productId)
  if (!line) return null
  return { remaining: line.remaining, day }
}

export function approvedStockInQty(
  stockIns: StockInTransaction[] | undefined,
  productId: string,
  afterDay: string | null,
  throughDay: string,
) {
  return (stockIns ?? []).reduce((sum, record) => {
    if (record.status !== 'approved') return sum
    if (record.deliveryDate > throughDay) return sum
    if (afterDay && record.deliveryDate <= afterDay) return sum
    return sum + record.items.reduce((qty, item) => (item.productId === productId ? qty + item.stockQuantity : qty), 0)
  }, 0)
}

/** Opening for a remaining-stock count: last remaining of that product, plus stock-in recorded after that count through this day. */
export function remainingOpeningQty(
  input: {
    closes?: DayClose[]
    stockIns?: StockInTransaction[]
    productId: string
    day: string
    userId?: string
    live: number
    billed: number
  },
) {
  const prior = lastCountedRemaining(input.closes, input.productId, input.day, input.userId)
  const later = approvedStockInQty(input.stockIns, input.productId, input.day, '9999-12-31')
  const received = approvedStockInQty(input.stockIns, input.productId, prior?.day ?? null, input.day)
  if (prior) return { opening: prior.remaining + received, received, priorRemaining: prior.remaining, hasPrior: true }
  return { opening: input.live - later + input.billed, received, priorRemaining: null, hasPrior: false }
}
