export function pad(value: number) {
  return String(value).padStart(2, '0')
}

export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function addDays(days: number, hour = 12, minute = 0, base = new Date()) {
  const next = new Date(base)
  next.setDate(next.getDate() + days)
  next.setHours(hour, minute, 0, 0)
  return next
}

export function isoDaysAgo(days: number, hour = 12, minute = 0) {
  return addDays(-days, hour, minute).toISOString()
}

export function dateKeyDaysAgo(days: number) {
  return dateKey(addDays(-days))
}

export function asDateKey(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return dateKey(date)
}

export function inDateRange(value: string, from: string, to: string) {
  const key = asDateKey(value)
  return key >= from && key <= to
}

export function minutesAgo(minutes: number) {
  const now = new Date()
  const candidate = new Date(now.getTime() - minutes * 60 * 1000)
  if (dateKey(candidate) === dateKey(now)) return candidate.toISOString()
  const elapsed = now.getHours() * 60 + now.getMinutes()
  const fallback = new Date(now.getTime() - Math.max(1, Math.min(minutes, elapsed - 1)) * 60 * 1000)
  return fallback.toISOString()
}

export function plusMinutes(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString()
}

export function monthKeyFromDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

export function monthKeyFromValue(value: string) {
  const key = asDateKey(value)
  return key.slice(0, 7)
}

export function monthLabel(key: string) {
  const [year, month] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit' }).format(
    new Date(year, month - 1, 1),
  )
}

export function recentMonthKeys(count = 6, now = new Date()) {
  const keys: string[] = []
  for (let index = count - 1; index >= 0; index -= 1) {
    keys.push(monthKeyFromDate(new Date(now.getFullYear(), now.getMonth() - index, 1)))
  }
  return keys
}

export function recentDateKeys(count: number, now = new Date()) {
  const keys: string[] = []
  for (let index = count - 1; index >= 0; index -= 1) {
    keys.push(dateKey(addDays(-index, 12, 0, now)))
  }
  return keys
}

export function eachDateKey(from: string, to: string) {
  const keys: string[] = []
  const [year, month, day] = from.split('-').map(Number)
  const cursor = new Date(year, month - 1, day)
  while (dateKey(cursor) <= to && keys.length < 400) {
    keys.push(dateKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return keys
}

export function weekStartKey(value: string) {
  const key = asDateKey(value)
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const weekday = date.getDay()
  const diff = weekday === 0 ? -6 : 1 - weekday
  date.setDate(date.getDate() + diff)
  return dateKey(date)
}

export function formatDate(value: string) {
  const key = asDateKey(value)
  if (!key) return ''
  const [year, month, day] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

export function formatDateTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatDayLabel(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric' }).format(
    new Date(year, month - 1, day),
  )
}

export function rangeForPreset(preset: 'today' | '7d' | '30d' | 'month' | 'year') {
  const today = dateKey()
  const now = new Date()
  if (preset === 'today') return { from: today, to: today }
  if (preset === '7d') return { from: dateKey(addDays(-6)), to: today }
  if (preset === '30d') return { from: dateKey(addDays(-29)), to: today }
  if (preset === 'month') {
    return { from: dateKey(new Date(now.getFullYear(), now.getMonth(), 1)), to: today }
  }
  return { from: dateKey(new Date(now.getFullYear(), 0, 1)), to: today }
}

export function monthsAgoStamp(monthsAgo: number, day: number, hour: number) {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() - monthsAgo, day, hour, 0, 0, 0).toISOString()
}
