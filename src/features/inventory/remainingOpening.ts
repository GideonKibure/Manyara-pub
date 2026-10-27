import type { DayClose, StockInTransaction } from '@/types'

function lineForProduct(close: DayClose, productId: string) {
  return (close.lines ?? []).find((line) => line.productId === productId)
}

/** Latest remaining for this product from a COGS report on or before (inclusive) / strictly before asOfDay. */
export function lastCountedRemaining(
  closes: DayClose[] | undefined,
  productId: string,
  asOfDay: string,
  userId?: string,
  inclusive = false,
): { remaining: number; day: string } | null {
  const matches = (closes ?? []).filter((close) => (inclusive ? close.day <= asOfDay : close.day < asOfDay) && lineForProduct(close, productId))
  if (!matches.length) return null
  const day = matches.reduce((latest, close) => (close.day > latest ? close.day : latest), matches[0].day)
  const sameDay = matches.filter((close) => close.day === day)
  const preferred =
    (userId ? sameDay.find((close) => close.submittedBy === userId) : undefined) ??
    [...sameDay].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const line = lineForProduct(preferred, productId)
  if (!line) return null
  return { remaining: line.remaining, day }
}

/** Approved deliveries whose invoice date is after afterDay and on or before throughDay. */
export function approvedStockInQty(
  stockIns: StockInTransaction[] | undefined,
  productId: string,
  afterDay: string | null,
  throughDay: string,
) {
  return (stockIns ?? []).reduce((sum, record) => {
    if (record.status !== 'approved') return sum
    const day = record.deliveryDate
    if (!day || day > throughDay) return sum
    if (afterDay && day <= afterDay) return sum
    return sum + record.items.reduce((qty, item) => (item.productId === productId ? qty + item.stockQuantity : qty), 0)
  }, 0)
}

/**
 * Remaining from the last COGS report, plus stock-in dated after that report through asOfDay.
 * Stock-in already counted into that remaining is not added again.
 */
export function cogsAvailableQty(input: {
  closes?: DayClose[]
  stockIns?: StockInTransaction[]
  productId: string
  asOfDay: string
  userId?: string
  inclusive?: boolean
}) {
  const prior = lastCountedRemaining(input.closes, input.productId, input.asOfDay, input.userId, input.inclusive ?? false)
  const received = approvedStockInQty(input.stockIns, input.productId, prior?.day ?? null, input.asOfDay)
  if (!prior) return { available: null as number | null, received, priorRemaining: null as number | null, priorDay: null as string | null }
  return { available: prior.remaining + received, received, priorRemaining: prior.remaining, priorDay: prior.day }
}

/** Opening for a remaining-stock count on `day`. */
export function remainingOpeningQty(input: {
  closes?: DayClose[]
  stockIns?: StockInTransaction[]
  productId: string
  day: string
  userId?: string
  live: number
  billed: number
}) {
  const counted = cogsAvailableQty({
    closes: input.closes,
    stockIns: input.stockIns,
    productId: input.productId,
    asOfDay: input.day,
    userId: input.userId,
    inclusive: false,
  })
  if (counted.available != null) {
    return { opening: counted.available, received: counted.received, priorRemaining: counted.priorRemaining, hasPrior: true }
  }
  const later = approvedStockInQty(input.stockIns, input.productId, input.day, '9999-12-31')
  return { opening: input.live - later + input.billed, received: counted.received, priorRemaining: null, hasPrior: false }
}
