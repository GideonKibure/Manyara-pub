function pdfEscape(value: string) {
  return value.replace(/[^\x20-\x7E]/g, ' ').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function wrap(text: string, width = 92) {
  const clean = pdfEscape(text)
  const parts: string[] = []
  let rest = clean
  while (rest.length > width) {
    parts.push(rest.slice(0, width))
    rest = rest.slice(width)
  }
  parts.push(rest)
  return parts
}

export function downloadTextPdf(filename: string, lines: string[]) {
  const wrapped = lines.flatMap((line) => wrap(line))
  const perPage = 46
  const pages: string[][] = []
  for (let index = 0; index < Math.max(wrapped.length, 1); index += perPage) {
    pages.push(wrapped.slice(index, index + perPage))
  }
  if (!pages[0]?.length) pages[0] = ['']

  const pageObjects = pages.map((page) => {
    const commands = ['BT', '/F1 11 Tf', '48 800 Td', '14 TL']
    page.forEach((line, index) => {
      commands.push(`(${line}) Tj`)
      if (index < page.length - 1) commands.push('T*')
    })
    commands.push('ET')
    return commands.join('\n')
  })

  const offsets: number[] = []
  const chunks: string[] = []
  let cursor = '%PDF-1.4\n'.length
  const push = (id: number, content: string) => {
    offsets[id] = cursor
    const chunk = `${id} 0 obj\n${content}\nendobj\n`
    chunks.push(chunk)
    cursor += chunk.length
  }

  const kids: number[] = []
  let nextId = 4
  const built = pageObjects.map((stream) => {
    const contentId = nextId++
    const pageId = nextId++
    kids.push(pageId)
    return { contentId, pageId, stream }
  })

  push(1, '<< /Type /Catalog /Pages 2 0 R >>')
  push(2, `<< /Type /Pages /Count ${kids.length} /Kids [${kids.map((id) => `${id} 0 R`).join(' ')}] >>`)
  push(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  for (const page of built) {
    push(page.contentId, `<< /Length ${page.stream.length} >>\nstream\n${page.stream}\nendstream`)
    push(
      page.pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${page.contentId} 0 R >>`,
    )
  }

  let xref = `xref\n0 ${nextId}\n0000000000 65535 f \n`
  for (let id = 1; id < nextId; id += 1) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  const file = `%PDF-1.4\n${chunks.join('')}${xref}trailer\n<< /Size ${nextId} /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF`
  const blob = new Blob([file], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
