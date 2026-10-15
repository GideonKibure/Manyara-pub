import { buildSeed } from '@/data/seed'
import { ensureProduct } from '@/features/products/offer'
import { approveInvoicedDeliveries, approveRecordedSales } from '@/services/operations'
import type { Database, RecordKind, SalesItem, Session } from '@/types'

export const DB_VERSION = 1
export const DB_KEY = 'manyara.db.v2'
const LOCAL_SESSION = 'manyara.session'
const TAB_SESSION = 'manyara.session.tab'

function normalizeStored(db: Database): Database {
  let changed = false
  const products = db.products.map((product) => {
    const missingCost = product.sizeMode === 'many' && product.sizes.some((size) => typeof size.cost !== 'number')
    if ((product.sizeMode === 'one' || product.sizeMode === 'many') && !missingCost) return product
    changed = true
    return ensureProduct({ ...product, sellingPrice: product.sellingPrice ?? 0, costPrice: product.costPrice ?? 0 })
  })
  const sales = db.sales.map((sale) => {
    let saleChanged = false
    if (sale.recordKind !== 'sale' && sale.recordKind !== 'bill') {
      saleChanged = true
    }
    const items = sale.items.map((item) => {
      if (item.sizeName && item.portion) return item
      saleChanged = true
      const next: SalesItem = {
        ...item,
        sizeName: item.sizeName === 'small' || item.sizeName === 'medium' || item.sizeName === 'big' ? item.sizeName : 'one',
        portion: item.portion === 'cup' || item.portion === 'half' ? item.portion : 'full',
      }
      return next
    })
    if (!saleChanged) return sale
    changed = true
    const recordKind: RecordKind = sale.recordKind === 'bill' || sale.paymentStatus !== 'paid' ? 'bill' : 'sale'
    return { ...sale, recordKind, items }
  })
  const expenses = Array.isArray(db.expenses) ? db.expenses : []
  const counters = { ...db.counters, expense: typeof db.counters?.expense === 'number' ? db.counters.expense : 0 }
  if (!Array.isArray(db.expenses) || counters.expense !== db.counters?.expense) changed = true
  return changed ? { ...db, products, sales, expenses, counters } : db
}

const DROPPED_BILL = 'manyara.drop20k.v1'

function isStrayTwentyThousandBill(sale: { recordKind?: string; items: Array<{ quantity: number; unitPrice: number }> }) {
  if (sale.recordKind === 'sale') return false
  const total = sale.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  return total === 20000 || sale.items.some((item) => item.unitPrice === 20000 || item.quantity * item.unitPrice === 20000)
}

function dropStrayBill(db: Database): Database {
  if (localStorage.getItem(DROPPED_BILL) === '1') return db
  localStorage.setItem(DROPPED_BILL, '1')
  const ids = new Set(db.sales.filter((sale) => isStrayTwentyThousandBill(sale)).map((sale) => sale.id))
  if (!ids.size) return db
  return {
    ...db,
    sales: db.sales.filter((sale) => !ids.has(sale.id)),
    movements: db.movements.filter((movement) => !(movement.referenceType === 'sale' && ids.has(movement.referenceId))),
  }
}

export function loadDatabase(): Database {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Database
      if (parsed?.version === DB_VERSION && Array.isArray(parsed.products) && parsed.counters && parsed.settings) {
        const reconciled = dropStrayBill(normalizeStored(approveRecordedSales(approveInvoicedDeliveries(parsed))))
        if (reconciled !== parsed) localStorage.setItem(DB_KEY, JSON.stringify(reconciled))
        return reconciled
      }
    }
  } catch {
    // Stored JSON can be cleared and reseeded.
  }
  const seeded = approveRecordedSales(buildSeed())
  localStorage.setItem(DB_KEY, JSON.stringify(seeded))
  return seeded
}

export function saveDatabase(db: Database) {
  localStorage.setItem(DB_KEY, JSON.stringify(db))
}

export function resetDatabase() {
  localStorage.removeItem(DB_KEY)
  return loadDatabase()
}

export function loadSession(): Session | null {
  const raw = localStorage.getItem(LOCAL_SESSION) ?? sessionStorage.getItem(TAB_SESSION)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Session
    if (!parsed?.userId) return null
    return { userId: parsed.userId, remember: Boolean(parsed.remember) }
  } catch {
    return null
  }
}

export function saveSession(session: Session | null) {
  localStorage.removeItem(LOCAL_SESSION)
  sessionStorage.removeItem(TAB_SESSION)
  if (!session) return
  localStorage.setItem(LOCAL_SESSION, JSON.stringify({ userId: session.userId, remember: true }))
}
