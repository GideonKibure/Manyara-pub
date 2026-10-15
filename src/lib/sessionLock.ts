export const IDLE_MS = 5 * 60 * 1000
export const IDLE_GRACE_MS = 60 * 1000
export const LOCK_REASON_KEY = 'manyara.lockReason'

export type LockReason = 'refresh' | 'idle'

export function markLockReason(reason: LockReason) {
  sessionStorage.setItem(LOCK_REASON_KEY, reason)
}

export function peekLockReason(): LockReason | null {
  const value = sessionStorage.getItem(LOCK_REASON_KEY)
  return value === 'refresh' || value === 'idle' ? value : null
}

export function clearLockReason() {
  sessionStorage.removeItem(LOCK_REASON_KEY)
}

let heldReason: LockReason | null | undefined

export function consumeLockReason(): LockReason | null {
  if (heldReason !== undefined) return heldReason
  heldReason = peekLockReason()
  clearLockReason()
  queueMicrotask(() => {
    heldReason = undefined
  })
  return heldReason
}
