import { cogsAvailableQty } from '@/features/inventory/remainingOpening'
import type { DayClose, InventoryMovement, Product, SalesTransaction, StockAvailability, StockInTransaction, StockLevel, StockSnapshot } from '@/types'
import { dateKey } from '@/utils/dates'

type StockDb = {
  movements: InventoryMovement[]
  sales: SalesTransaction[]
  products: Product[]
  availability?: StockAvailability[]
  dayCloses?: DayClose[]
  stockIns?: StockInTransaction[]
}

export function stockQtyFromReceived(received: number, conversionFactor: number) {
  if (!Number.isFinite(received) || !Number.isFinite(conversionFactor)) return 0
  return Math.round(received * conversionFactor * 100) / 100
}

export function confirmedQty(movements: InventoryMovement[], productId: string) {
  return movements.reduce((sum, movement) => (movement.productId === productId ? sum + movement.quantity : sum), 0)
}

export function reservedQty(sales: SalesTransaction[], productId: string, movements: InventoryMovement[] = []) {
  const deducted = new Set(movements.filter((movement) => movement.referenceType === 'sale' && movement.quantity < 0).map((movement) => movement.referenceId))
  return sales.reduce((sum, sale) => {
    if (sale.status !== 'pending' || deducted.has(sale.id)) return sum
    return sum + sale.items.reduce((line, item) => (item.productId === productId ? line + item.quantity : line), 0)
  }, 0)
}

export function stockLevel(available: number, minimum: number): StockLevel {
  if (available <= 0) return 'out'
  if (available <= minimum) return 'low'
  return 'normal'
}

function unmovedBillQty(sales: SalesTransaction[], movements: InventoryMovement[], productId: string) {
  const moved = new Set(movements.filter((movement) => movement.referenceType === 'sale' && movement.quantity < 0).map((movement) => movement.referenceId))
  return sales.reduce((sum, sale) => {
    if (sale.recordKind !== 'bill' || sale.status === 'rejected' || sale.status === 'cancelled' || moved.has(sale.id)) return sum
    return sum + sale.items.reduce((line, item) => (item.productId === productId ? line + item.quantity : line), 0)
  }, 0)
}

export function snapshotFor(db: StockDb, productId: string, asOfDay = dateKey()): StockSnapshot {
  const product = db.products.find((item) => item.id === productId)
  const reserved = Math.max(0, reservedQty(db.sales, productId, db.movements) - unmovedBillQty(db.sales, db.movements, productId))
  const counted = cogsAvailableQty({
    closes: db.dayCloses,
    stockIns: db.stockIns,
    productId,
    asOfDay,
    inclusive: true,
  })
  if (counted.available != null) {
    const available = counted.available
    const minimum = product?.minStock ?? 0
    return {
      productId,
      confirmed: available,
      reserved,
      available,
      minimum,
      level: stockLevel(available, minimum),
    }
  }
  const listed = db.availability?.find((item) => item.productId === productId)
  const written = unmovedBillQty(db.sales, db.movements, productId)
  const confirmed = (listed?.confirmed ?? confirmedQty(db.movements, productId)) - written
  const available = confirmed - reserved
  const minimum = product?.minStock ?? 0
  return {
    productId,
    confirmed,
    reserved,
    available,
    minimum,
    level: stockLevel(available, minimum),
  }
}

export function allSnapshots(db: StockDb, asOfDay = dateKey()) {
  return db.products.map((product) => snapshotFor(db, product.id, asOfDay))
}
