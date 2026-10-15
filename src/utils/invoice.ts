export function allocateInvoiceRef(existing: Iterable<string>, requested = ''): string {
  const used = new Set<string>()
  let max = 0
  for (const value of existing) {
    const ref = value.trim().toLowerCase()
    if (!ref) continue
    used.add(ref)
    const match = /^inv-(\d+)$/.exec(ref)
    if (match) max = Math.max(max, Number(match[1]))
  }
  const wanted = requested.trim()
  if (wanted && wanted.length <= 60 && !used.has(wanted.toLowerCase())) return wanted
  let number = max + 1
  let candidate = `INV-${String(number).padStart(4, '0')}`
  while (used.has(candidate.toLowerCase())) {
    number += 1
    candidate = `INV-${String(number).padStart(4, '0')}`
  }
  return candidate
}

export function nextInvoiceRef(existing: Iterable<string>) {
  return allocateInvoiceRef(existing)
}
