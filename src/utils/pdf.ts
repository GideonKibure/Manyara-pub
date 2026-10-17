function pdfEscape(value: string) {
  return value.replace(/[^\x20-\x7E]/g, ' ').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function clip(value: string, max = 42) {
  const clean = pdfEscape(value).trim()
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}.`
}

function rgb(hex: string) {
  const value = hex.replace('#', '')
  const n = Number.parseInt(value, 16)
  return `${((n >> 16) & 255) / 255} ${((n >> 8) & 255) / 255} ${(n & 255) / 255}`
}

const PAGE_W = 595
const PAGE_H = 842
const MARGIN = 36

export interface ReportKpi {
  label: string
  value: string
}

export interface ReportBar {
  label: string
  value: number
  caption?: string
}

export interface ReportColumn {
  header: string
  width: number
  align?: 'left' | 'right'
}

export interface StyledReport {
  title: string
  subtitle?: string
  dateLabel: string
  kpis?: ReportKpi[]
  charts?: Array<{ title: string; bars: ReportBar[] }>
  tables?: Array<{ title: string; columns: ReportColumn[]; rows: string[][] }>
  notes?: string[]
  stamp?: string
}

class Painter {
  pages: string[][] = [[]]
  y = PAGE_H - 28

  get page() {
    return this.pages[this.pages.length - 1]
  }

  push(command: string) {
    this.page.push(command)
  }

  newPage() {
    this.pages.push([])
    this.y = PAGE_H - 36
    this.push(`${rgb('#f4f1eb')} rg 0 0 ${PAGE_W} ${PAGE_H} re f`)
  }

  ensure(height: number) {
    if (this.y - height < 52) this.newPage()
  }

  fillRect(x: number, y: number, w: number, h: number, color: string) {
    this.push(`${rgb(color)} rg ${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f`)
  }

  strokeRect(x: number, y: number, w: number, h: number, color: string) {
    this.push(`${rgb(color)} RG 0.6 w ${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re S`)
  }

  text(value: string, x: number, y: number, size: number, color: string, bold = false, align: 'left' | 'right' = 'left', maxWidth = 240) {
    const body = clip(value, Math.max(4, Math.floor(maxWidth / (size * 0.5))))
    const width = body.length * size * 0.5
    const left = align === 'right' ? x - width : x
    this.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${rgb(color)} rg ${left.toFixed(1)} ${y.toFixed(1)} Td (${body}) Tj ET`)
  }

  heading(title: string) {
    this.ensure(28)
    this.text(title, MARGIN, this.y - 14, 11, '#1c1917', true)
    this.fillRect(MARGIN, this.y - 20, 42, 2, '#b45309')
    this.y -= 28
  }
}

function paintHeader(doc: Painter, report: StyledReport) {
  doc.fillRect(0, 0, PAGE_W, PAGE_H, '#f4f1eb')
  doc.fillRect(0, PAGE_H - 92, PAGE_W, 92, '#161412')
  doc.fillRect(0, PAGE_H - 96, PAGE_W, 4, '#b45309')
  doc.text('MANYARA PUB', MARGIN, PAGE_H - 36, 9, '#fbbf24', true)
  doc.text(report.title, MARGIN, PAGE_H - 58, 18, '#fafaf9', true)
  if (report.subtitle) doc.text(report.subtitle, MARGIN, PAGE_H - 76, 10, '#d6d3d1')
  doc.text(report.dateLabel, PAGE_W - MARGIN, PAGE_H - 58, 10, '#fde68a', false, 'right')
  if (report.stamp) {
    doc.fillRect(PAGE_W - 148, PAGE_H - 86, 112, 18, '#b45309')
    doc.text(report.stamp, PAGE_W - MARGIN, PAGE_H - 74, 8, '#fffbeb', true, 'right', 100)
  }
  doc.y = PAGE_H - 118
}

function paintKpis(doc: Painter, kpis: ReportKpi[]) {
  if (!kpis.length) return
  const gap = 8
  const width = (PAGE_W - MARGIN * 2 - gap * (kpis.length - 1)) / kpis.length
  doc.ensure(54)
  kpis.forEach((item, index) => {
    const x = MARGIN + index * (width + gap)
    const y = doc.y - 48
    doc.fillRect(x, y, width, 48, index === 1 ? '#b45309' : '#ffffff')
    doc.strokeRect(x, y, width, 48, index === 1 ? '#b45309' : '#e7e5e4')
    const ink = index === 1 ? '#fffbeb' : '#78716c'
    const value = index === 1 ? '#ffffff' : '#1c1917'
    doc.text(item.label, x + 8, y + 32, 7, ink, true)
    doc.text(item.value, x + 8, y + 12, item.value.length > 12 ? 8 : 10, value, true)
  })
  doc.y -= 64
}

function paintChart(doc: Painter, title: string, bars: ReportBar[]) {
  const usable = bars.filter((bar) => bar.value > 0).slice(0, 6)
  if (!usable.length) return
  doc.heading(title)
  const max = Math.max(...usable.map((bar) => bar.value), 1)
  const track = 230
  const row = 22
  doc.ensure(usable.length * row + 8)
  usable.forEach((bar) => {
    const y = doc.y - 16
    doc.text(bar.label, MARGIN, y, 8, '#44403c', false, 'left', 110)
    doc.fillRect(MARGIN + 118, y - 2, track, 10, '#e7e5e4')
    doc.fillRect(MARGIN + 118, y - 2, Math.max(6, (bar.value / max) * track), 10, '#b45309')
    doc.text(bar.caption ?? String(bar.value), PAGE_W - MARGIN, y, 8, '#1c1917', true, 'right')
    doc.y -= row
  })
  doc.y -= 8
}

function paintTable(doc: Painter, title: string, columns: ReportColumn[], rows: string[][]) {
  doc.heading(title)
  const inner = PAGE_W - MARGIN * 2
  const widths = columns.map((column) => column.width * inner)
  const drawRow = (cells: string[], header: boolean, zebra: boolean) => {
    const height = 18
    doc.ensure(height + 2)
    const y = doc.y - height
    doc.fillRect(MARGIN, y, inner, height, header ? '#161412' : zebra ? '#f5f5f4' : '#ffffff')
    let x = MARGIN
    cells.forEach((cell, index) => {
      const column = columns[index]
      const pad = 6
      const color = header ? '#fde68a' : '#1c1917'
      const maxWidth = widths[index] - pad * 2
      if (column.align === 'right') doc.text(cell, x + widths[index] - pad, y + 5, 8, color, header, 'right', maxWidth)
      else doc.text(cell, x + pad, y + 5, 8, color, header, 'left', maxWidth)
      x += widths[index]
    })
    doc.y -= height
  }
  drawRow(columns.map((column) => column.header), true, false)
  if (!rows.length) {
    drawRow(columns.map((_, index) => (index === 0 ? 'None' : '')), false, false)
  } else {
    rows.forEach((row, index) => drawRow(row, false, index % 2 === 1))
  }
  doc.y -= 14
}

function assemble(pages: string[][]) {
  const streams = pages.map((commands) => commands.join('\n'))
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
  let nextId = 5
  const built = streams.map((stream) => {
    const contentId = nextId++
    const pageId = nextId++
    kids.push(pageId)
    return { contentId, pageId, stream }
  })
  push(1, '<< /Type /Catalog /Pages 2 0 R >>')
  push(2, `<< /Type /Pages /Count ${kids.length} /Kids [${kids.map((id) => `${id} 0 R`).join(' ')}] >>`)
  push(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  push(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>')
  for (const page of built) {
    push(page.contentId, `<< /Length ${page.stream.length} >>\nstream\n${page.stream}\nendstream`)
    push(
      page.pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${page.contentId} 0 R >>`,
    )
  }
  let xref = `xref\n0 ${nextId}\n0000000000 65535 f \n`
  for (let id = 1; id < nextId; id += 1) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  return `%PDF-1.4\n${chunks.join('')}${xref}trailer\n<< /Size ${nextId} /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF`
}

function save(filename: string, file: string) {
  const blob = new Blob([file], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function downloadStyledPdf(filename: string, report: StyledReport) {
  const doc = new Painter()
  paintHeader(doc, report)
  paintKpis(doc, report.kpis ?? [])
  for (const chart of report.charts ?? []) paintChart(doc, chart.title, chart.bars)
  for (const table of report.tables ?? []) paintTable(doc, table.title, table.columns, table.rows)
  for (const note of report.notes ?? []) {
    doc.ensure(16)
    doc.text(note, MARGIN, doc.y - 12, 9, '#57534e')
    doc.y -= 16
  }
  doc.pages.forEach((page, index) => {
    const label = `Page ${index + 1} of ${doc.pages.length}  |  Manyara Pub`
    page.push(`BT /F1 8 Tf ${rgb('#a8a29e')} rg ${MARGIN} 24 Td (${pdfEscape(label)}) Tj ET`)
  })
  save(filename, assemble(doc.pages))
}

export function downloadTextPdf(filename: string, lines: string[]) {
  downloadStyledPdf(filename, {
    title: clip(lines[0] || 'Manyara Pub', 48),
    dateLabel: clip(lines[1] || '', 32),
    notes: lines.slice(2).filter((line) => line.length > 0),
  })
}
