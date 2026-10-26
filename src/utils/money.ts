export function formatMoney(amount: number, symbol = 'TSh') {
  const formatted = new Intl.NumberFormat('en-TZ', { maximumFractionDigits: 0 }).format(
    Math.round(amount),
  )
  return `${symbol} ${formatted}`
}

/** Buying prices are whole TZS. Do not snap them to thousands. */
export function roundBuyingPrice(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.round(amount)
}

export function formatNumber(amount: number) {
  return new Intl.NumberFormat('en-TZ', { maximumFractionDigits: 0 }).format(Math.round(amount))
}
