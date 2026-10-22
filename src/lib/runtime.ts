export function isNativeShell() {
  if (typeof window === 'undefined') return false
  const host = window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean }
    __TAURI_INTERNALS__?: unknown
    __TAURI__?: unknown
  }
  if (host.Capacitor?.isNativePlatform?.() || host.Capacitor) return true
  if (host.__TAURI_INTERNALS__ || host.__TAURI__) return true
  return false
}

export function isLocalFirstMode() {
  const flag = import.meta.env.VITE_LOCAL_FIRST
  if (flag === '1' || flag === 'true') return true
  return isNativeShell()
}
