import type { InventoryMovement, Product, SalesTransaction, StockAvailability, StockLevel, StockSnapshot } from '@/types'

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

export function snapshotFor(
  db: { movements: InventoryMovement[]; sales: SalesTransaction[]; products: Product[]; availability?: StockAvailability[] },
  productId: string,
): StockSnapshot {
  const product = db.products.find((item) => item.id === productId)
  const listed = db.availability?.find((item) => item.productId === productId)
  const written = unmovedBillQty(db.sales, db.movements, productId)
  const confirmed = (listed?.confirmed ?? confirmedQty(db.movements, productId)) - written
  const reserved = Math.max(0, (listed?.reserved ?? reservedQty(db.sales, productId, db.movements)) - written)
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

export function allSnapshots(db: { movements: InventoryMovement[]; sales: SalesTransaction[]; products: Product[]; availability?: StockAvailability[] }) {
  return db.products.map((product) => snapshotFor(db, product.id))
}
