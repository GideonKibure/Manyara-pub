export function formatMoney(amount: number, symbol = 'TSh') {
  const formatted = new Intl.NumberFormat('en-TZ', { maximumFractionDigits: 0 }).format(
    Math.round(amount),
  )
  return `${symbol} ${formatted}`
}

/** Buying prices are stored in whole thousands of TZS so totals match across records. */
export function roundBuyingPrice(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  const rounded = Math.round(amount / 1000) * 1000
  return rounded === 0 ? 1000 : rounded
}

export function formatNumber(amount: number) {
  return new Intl.NumberFormat('en-TZ', { maximumFractionDigits: 0 }).format(Math.round(amount))
}
