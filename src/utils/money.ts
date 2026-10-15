export function formatMoney(amount: number, symbol = 'TSh') {
  const formatted = new Intl.NumberFormat('en-TZ', { maximumFractionDigits: 0 }).format(
    Math.round(amount),
  )
  return `${symbol} ${formatted}`
}

export function formatNumber(amount: number) {
  return new Intl.NumberFormat('en-TZ', { maximumFractionDigits: 0 }).format(Math.round(amount))
}
