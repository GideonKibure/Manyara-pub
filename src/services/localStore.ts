import { isLocalFirstMode } from '@/lib/runtime'
import { normalizeStored } from '@/services/localDb'
import type { Database } from '@/types'

const DB_NAME = 'manyara-local'
const STORE = 'kv'
const SNAPSHOT_PREFIX = 'snapshot:'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB is not available.'))
  })
}

function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const request = run(tx.objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
      }),
  )
}

export function snapshotKey(userId: string) {
  return `${SNAPSHOT_PREFIX}${userId}`
}

export async function loadSnapshot(userId: string): Promise<Database | null> {
  try {
    const raw = await withStore('readonly', (store) => store.get(snapshotKey(userId)))
    if (!raw || typeof raw !== 'object') return null
    return normalizeStored(raw as Database)
  } catch {
    return null
  }
}

export async function saveSnapshot(userId: string, db: Database) {
  if (!isLocalFirstMode() || !userId) return
  await withStore('readwrite', (store) => store.put({ ...db, accounts: [], resetTokens: [] }, snapshotKey(userId)))
}

export function hasLocalBusiness(db: Database | null | undefined) {
  if (!db) return false
  return (
    db.products.length > 0 ||
    db.sales.length > 0 ||
    db.stockIns.length > 0 ||
    db.expenses.length > 0 ||
    (db.dayCloses?.length ?? 0) > 0
  )
}
