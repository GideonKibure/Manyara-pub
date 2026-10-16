import { useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ProductPicker, ProductThumb } from '@/components/ProductPicker'
import { Button } from '@/components/ui/Button'
import { Field, NumberInput, TextArea, TextInput } from '@/components/ui/Fields'
import { PageHeader, Panel } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { useApp } from '@/context/AppContext'
import { saleOptions } from '@/features/products/offer'
import { useI18n } from '@/i18n/LanguageContext'
import type { BillPayment, RecordKind, SalePortion, SaleSize } from '@/types'
import { formatDateTime, asDateKey, dateKey, formatDate } from '@/utils/dates'
import { uid } from '@/utils/id'
import { billBalance, saleTotal } from '@/utils/labels'
import { cn } from '@/utils/cn'

function BillSquare({ title, amount, note, paid, imageUrl, onClick }: { title: string; amount: string; note?: string; paid?: boolean; imageUrl?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative isolate aspect-[3/4] min-w-0 overflow-hidden rounded-[1.4rem] text-left shadow-[0_16px_34px_rgba(28,25,23,0.22)] ring-1 ring-white/70 transition active:scale-[0.98]"
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-[3px]" />
      ) : (
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(251,191,36,0.9),transparent_46%),linear-gradient(165deg,#44403c_0%,#1c1917_78%)]" />
      )}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-stone-950/15 via-stone-950/5 to-stone-950/80" />
      <span className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/30 to-transparent" />
      <span className="relative flex h-full flex-col justify-between p-2.5">
        {note ? <span className={cn('w-fit max-w-full truncate rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm', paid ? 'bg-emerald-800/80' : 'bg-amber-700/90')}>{note}</span> : <span />}
        <span className="rounded-2xl border border-white/40 bg-white/20 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-md">
          <span className="line-clamp-2 text-sm font-semibold leading-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]">{title}</span>
          <span className="mt-1.5 block truncate text-base font-semibold tabular-nums leading-none text-amber-50 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">{amount}</span>
        </span>
      </span>
    </button>
  )
}

interface Line {
  id: string
  productId: string
  quantity: number
  sizeName: SaleSize
  portion: SalePortion
  customerName?: string
  payment?: BillPayment
}

export function SalesPage({ kind = 'sale' }: { kind?: RecordKind }) {
  const app = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const corrects = app.sales.find((item) => item.id === params.get('correct') && item.submittedBy === app.user?.id)
  const editing = app.user?.role === 'admin'
    ? app.sales.find((item) => item.id === params.get('edit') && (item.status === 'pending' || item.status === 'approved'))
    : undefined
  const source = editing ?? corrects
  const recordKind: RecordKind = source?.recordKind ?? kind
  const isBill = recordKind === 'bill'
  const remainingMode = app.user?.role !== 'admin' && app.settings.allowRemainingCount
  const employeeSale = app.user?.role !== 'admin' && !isBill && !editing && !corrects
  const employeeBill = app.user?.role !== 'admin' && isBill && !editing && !corrects
  const employeeEach = employeeSale || employeeBill
  const [search, setSearch] = useState('')
  const active = app.products.filter((product) => product.isActive)
  const draftedQty = (id: string) => (employeeEach ? lines.reduce((sum, line) => (line.productId === id && line.id !== editingLineId ? sum + line.quantity : sum), 0) : 0)
  const freeQty = (id: string) => Math.max(0, (app.snapshots.find((item) => item.productId === id)?.available ?? 0) - draftedQty(id))
  const inStock = (id: string) => freeQty(id) >= 1
  const [productId, setProductId] = useState(source?.items[0]?.productId ?? '')
  const [sizeName, setSizeName] = useState<SaleSize>(source?.items[0]?.sizeName ?? 'one')
  const [portion, setPortion] = useState<SalePortion>(source?.items[0]?.portion ?? 'full')
  const [quantity, setQuantity] = useState<number | null>(source ? 1 : null)
  const [lines, setLines] = useState<Line[]>(() => source?.items.map((item) => ({
    id: item.id || uid(),
    productId: item.productId,
    quantity: item.quantity,
    sizeName: item.sizeName ?? 'one',
    portion: item.portion ?? 'full',
    customerName: source?.recordKind === 'bill' ? source.customerName : undefined,
    payment: source?.recordKind === 'bill' ? source.paymentStatus : undefined,
  })) ?? [])
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState(source?.customerName && source.customerName !== 'Walk-in' ? source.customerName : source?.customerName ?? '')
  const [payment, setPayment] = useState<BillPayment>(isBill ? source?.paymentStatus ?? 'unpaid' : 'paid')
  const [generatedAt, setGeneratedAt] = useState(source?.generatedAt ?? new Date().toISOString())
  const [notes, setNotes] = useState(source?.notes ?? '')
  const [review, setReview] = useState(false)
  const [openDraft, setOpenDraft] = useState<string | null>(null)
  const [openSaved, setOpenSaved] = useState<string | null>(null)
  const [addHint, setAddHint] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [payError, setPayError] = useState('')
  const [paying, setPaying] = useState(false)
  const [payAmount, setPayAmount] = useState<number | null>(null)
  const [addingItem, setAddingItem] = useState(false)
  const [extraProductId, setExtraProductId] = useState('')
  const [extraSearch, setExtraSearch] = useState('')
  const [extraQty, setExtraQty] = useState<number | null>(null)
  const [extraSize, setExtraSize] = useState<SaleSize>('one')
  const [extraPortion, setExtraPortion] = useState<SalePortion>('full')
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [correctionSent, setCorrectionSent] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)
  const newestLine = useRef<HTMLLIElement>(null)
  const listed = app.user?.role === 'admin' ? active : active.filter((product) => inStock(product.id) || (Boolean(editingLineId) && product.id === productId))
  const extraListed = app.user?.role === 'admin' ? active : active.filter((product) => freeQty(product.id) >= 1)
  const extraSelected = extraListed.find((product) => product.id === extraProductId)
  const extraOptions = extraSelected ? saleOptions(extraSelected) : []
  const extraChosen = extraOptions.find((item) => item.sizeName === extraSize && item.portion === extraPortion) ?? extraOptions[0]
  const extraSizes = [...new Set(extraOptions.map((item) => item.sizeName))]
  const extraPortions = extraOptions.filter((item) => item.sizeName === (extraChosen?.sizeName ?? 'one')).map((item) => item.portion)
  const selected = listed.find((product) => product.id === productId)
  const options = selected ? saleOptions(selected) : []
  const chosen = options.find((item) => item.sizeName === sizeName && item.portion === portion) ?? options[0]
  const sizeChoices = [...new Set(options.map((item) => item.sizeName))]
  const portionChoices = options.filter((item) => item.sizeName === (chosen?.sizeName ?? 'one')).map((item) => item.portion)
  const snap = app.snapshots.find((item) => item.productId === productId)
  const outOfStock = app.user?.role !== 'admin' && Boolean(selected && freeQty(productId) < 1)
  const overStock = app.user?.role !== 'admin' && Boolean(selected && quantity != null && quantity > freeQty(productId))
  const billReady = !isBill || employeeBill || customerName.trim().length >= 2
  const labelFor = (size: SaleSize, part: SalePortion) => [size === 'one' ? '' : t(size === 'small' ? 'productsSizeSmall' : size === 'medium' ? 'productsSizeMedium' : 'productsSizeBig'), part === 'full' ? '' : t(part === 'cup' ? 'salesCup' : 'salesHalf')].filter(Boolean).join(' · ')
  const priced = useMemo(() => lines.map((line) => {
    const product = app.products.find((item) => item.id === line.productId)
    const match = product ? saleOptions(product).find((item) => item.sizeName === line.sizeName && item.portion === line.portion) : undefined
    return { ...line, name: product?.name ?? t('productsProduct'), imageUrl: product?.imageUrl, unitPrice: match?.price ?? 0, unit: app.units.find((unit) => unit.id === product?.stockUnitId)?.abbreviation ?? '' }
  }), [lines, app.products, app.units, t])
  const total = saleTotal(priced)
  const customerKey = (name?: string) => (name ?? '').trim().toLowerCase()
  const billGroups = useMemo(() => {
    const groups: Array<{ key: string; name: string; payment: BillPayment; lines: typeof priced }> = []
    if (!employeeBill) return groups
    for (const line of priced) {
      const key = customerKey(line.customerName)
      const found = groups.find((group) => group.key === key)
      if (found) found.lines.push(line)
      else groups.push({ key, name: line.customerName ?? '', payment: line.payment ?? 'unpaid', lines: [line] })
    }
    return groups
  }, [priced, employeeBill])
  const addingToCustomer = employeeBill && billGroups.some((group) => group.key === customerKey(customerName) && group.key.length > 0)
  const myBills = employeeBill
    ? app.sales.filter((item) => {
        return item.submittedBy === app.user?.id && item.recordKind === 'bill' && item.paymentStatus !== 'paid' && item.status !== 'cancelled' && item.status !== 'rejected' && billBalance(item) > 0
      })
    : []
  const openSavedBill = myBills.find((item) => item.id === openSaved)
  const openGroup = billGroups.find((group) => group.key === openDraft)
  const daySales = employeeSale
    ? app.sales
        .filter((sale) => sale.submittedBy === app.user?.id && sale.recordKind !== 'bill' && sale.status === 'approved' && !sale.isLoss && asDateKey(sale.reviewedAt || sale.submittedAt || sale.generatedAt) === dateKey())
        .flatMap((sale) => {
          const bill = sale.sourceBillId ? app.sales.find((item) => item.id === sale.sourceBillId) : undefined
          const customer = sale.customerName.trim() || bill?.customerName.trim() || ''
          if (sale.items.length) {
            return sale.items.map((item) => ({
              id: `${sale.id}-${item.id}`,
              customer,
              name: app.products.find((product) => product.id === item.productId)?.name ?? t('productsProduct'),
              amount: item.quantity * item.unitPrice,
            }))
          }
          if (typeof sale.settledAmount === 'number') {
            const names = (bill?.items ?? []).map((item) => app.products.find((product) => product.id === item.productId)?.name).filter(Boolean)
            return [{ id: sale.id, customer, name: names.join(', '), amount: sale.settledAmount }]
          }
          return []
        })
    : []

  const dayListRef = useRef<HTMLDivElement>(null)
  const dayPause = useRef(false)
  const dayResume = useRef(0)

  useEffect(() => {
    if (!review && !openDraft) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [review, openDraft])

  const lineCount = useRef(lines.length)
  useEffect(() => {
    if (lines.length > lineCount.current) newestLine.current?.scrollIntoView({ block: 'nearest' })
    lineCount.current = lines.length
  }, [lines.length])

  useEffect(() => {
    if (!employeeSale || daySales.length < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const tick = () => {
      const node = dayListRef.current
      if (node && !dayPause.current && node.scrollHeight > node.clientHeight + 8) {
        node.scrollTop += 0.45
        if (node.scrollTop + node.clientHeight >= node.scrollHeight - 1) node.scrollTop = 0
      }
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [employeeSale, daySales.length])

  function holdDayList() {
    dayPause.current = true
    window.clearTimeout(dayResume.current)
  }

  function releaseDayList() {
    window.clearTimeout(dayResume.current)
    dayResume.current = window.setTimeout(() => { dayPause.current = false }, 1400)
  }

  function removeLine(id: string) {
    const remaining = lines.filter((item) => item.id !== id)
    setLines(remaining)
    if (editingLineId === id) setEditingLineId(null)
    if (!remaining.length) setReview(false)
  }

  function blankBillFields() {
    setCustomerName('')
    setProductId('')
    setQuantity(null)
    setSearch('')
    setSizeName('one')
    setPortion('full')
    setPayment('unpaid')
  }

  async function saveOpenBill() {
    if (submittingId || outOfStock || overStock) return
    const named = customerName.trim()
    if (named.length < 2 || named.length > 80 || !selected || !chosen || quantity == null || !Number.isInteger(quantity) || quantity < 1) {
      setAddHint(t('billNeed'))
      return
    }
    if (freeQty(selected.id) < 1) {
      setAddHint(t('salesOut'))
      return
    }
    if (quantity > freeQty(selected.id)) {
      setAddHint(t('billOverStock'))
      return
    }
    setAddHint('')
    setSubmitError('')
    setSubmittingId('form')
    const result = await app.sendSale({
      items: [{ productId: selected.id, quantity, sizeName: chosen.sizeName, portion: chosen.portion }],
      customerName: named,
      paymentStatus: 'unpaid',
      recordKind: 'bill',
      generatedAt,
      notes,
    })
    setSubmittingId(null)
    if (!result.ok) {
      setSubmitError(result.error)
      return
    }
    blankBillFields()
    setNotes('')
    setGeneratedAt(new Date().toISOString())
  }

  function addLine() {
    if (outOfStock || overStock) {
      setAddHint(outOfStock ? t('salesOut') : t('billOverStock'))
      return
    }
    const named = customerName.trim()
    if (employeeBill && (named.length < 2 || named.length > 80)) {
      setAddHint(t('billNeed'))
      return
    }
    if (!selected || !chosen || quantity == null || !Number.isInteger(quantity) || quantity < 1) {
      setAddHint(employeeBill ? t('billNeed') : t('salesNeed'))
      return
    }
    setAddHint('')
    const key = customerKey(named)
    const sibling = employeeBill ? lines.find((line) => customerKey(line.customerName) === key && line.id !== editingLineId) : undefined
    const next: Line = {
      id: editingLineId ?? uid(),
      productId: selected.id,
      quantity,
      sizeName: chosen.sizeName,
      portion: chosen.portion,
      customerName: employeeBill ? named : undefined,
      payment: employeeBill ? sibling?.payment ?? 'unpaid' : undefined,
    }
    setLines((current) => {
      if (editingLineId && current.some((line) => line.id === editingLineId)) {
        const previous = current.find((line) => line.id === editingLineId)
        const movedTo = current.find((line) => customerKey(line.customerName) === key && line.id !== editingLineId)
        return current.map((line) => line.id === editingLineId ? { ...next, payment: movedTo?.payment ?? previous?.payment ?? next.payment } : line)
      }
      return [...current, { ...next, id: uid() }]
    })
    setEditingLineId(null)
    setProductId('')
    setQuantity(null)
    setSearch('')
    setSizeName('one')
    setPortion('full')
    if (employeeBill && !sibling) blankBillFields()
  }

  function addForCustomer(name: string) {
    setEditingLineId(null)
    setCustomerName(name)
    setProductId('')
    setQuantity(null)
    setSearch('')
    setSizeName('one')
    setPortion('full')
    setAddHint('')
    setReview(false)
    setOpenDraft(null)
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function setGroupPayment(key: string, next: BillPayment) {
    setLines((current) => current.map((line) => customerKey(line.customerName) === key ? { ...line, payment: next } : line))
  }

  function editLine(id: string) {
    const line = lines.find((item) => item.id === id)
    if (!line) return
    setProductId(line.productId)
    setSizeName(line.sizeName)
    setPortion(line.portion)
    setQuantity(line.quantity)
    if (line.customerName) setCustomerName(line.customerName)
    if (line.payment) setPayment(line.payment)
    setEditingLineId(id)
    setSearch('')
    setAddHint('')
    setReview(false)
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function clearEmployeeForm() {
    setLines([])
    setNotes('')
    setProductId('')
    setQuantity(null)
    setSearch('')
    setSizeName('one')
    setPortion('full')
    setGeneratedAt(new Date().toISOString())
    setEditingLineId(null)
    setReview(false)
    setSubmitError('')
    if (params.get('correct')) navigate(isBill ? '/employee/bills' : '/employee/sales', { replace: true })
  }

  async function sendLines(batch: Line[]) {
    return app.sendSale({
      items: batch.map((line) => ({ productId: line.productId, quantity: line.quantity, sizeName: line.sizeName, portion: line.portion })),
      customerName: employeeBill ? batch[0]?.customerName ?? '' : '',
      paymentStatus: employeeBill ? batch[0]?.payment ?? 'unpaid' : 'paid',
      recordKind: employeeBill ? 'bill' : 'sale',
      generatedAt,
      notes,
      correctsId: corrects && !correctionSent ? corrects.id : undefined,
    })
  }

  async function submitLine(id: string) {
    const batch = employeeBill ? lines.filter((line) => customerKey(line.customerName) === id) : lines.filter((line) => line.id === id)
    if (!batch.length || submittingId) return
    setSubmittingId(id)
    setSubmitError('')
    const result = await sendLines(batch)
    setSubmittingId(null)
    if (!result.ok) {
      setSubmitError(result.error)
      return
    }
    if (corrects && !correctionSent) setCorrectionSent(true)
    const gone = new Set(batch.map((line) => line.id))
    const remaining = lines.filter((line) => !gone.has(line.id))
    setLines(remaining)
    if (editingLineId && gone.has(editingLineId)) setEditingLineId(null)
    if (!remaining.length) clearEmployeeForm()
  }

  async function submitAll() {
    if (submittingId || !lines.length) return
    setSubmittingId('all')
    setSubmitError('')
    let corrected = correctionSent
    const batches = employeeBill
      ? billGroups.map((group) => lines.filter((line) => customerKey(line.customerName) === group.key))
      : lines.map((line) => [line])
    const sent = new Set<string>()
    for (const batch of batches) {
      const result = await app.sendSale({
        items: batch.map((line) => ({ productId: line.productId, quantity: line.quantity, sizeName: line.sizeName, portion: line.portion })),
        customerName: employeeBill ? batch[0]?.customerName ?? '' : '',
        paymentStatus: employeeBill ? batch[0]?.payment ?? 'unpaid' : 'paid',
        recordKind: employeeBill ? 'bill' : 'sale',
        generatedAt,
        notes,
        correctsId: corrects && !corrected ? corrects.id : undefined,
      })
      if (!result.ok) {
        if (corrected) setCorrectionSent(true)
        setLines(lines.filter((line) => !sent.has(line.id)))
        setSubmittingId(null)
        setSubmitError(result.error)
        return
      }
      batch.forEach((line) => sent.add(line.id))
      if (corrects) corrected = true
    }
    setCorrectionSent(corrected)
    setSubmittingId(null)
    clearEmployeeForm()
  }

  async function saveTogether() {
    setSubmittingId('all')
    setSubmitError('')
    const draft = {
      items: lines.map(({ productId: id, quantity: sold, sizeName: size, portion: part }) => ({ productId: id, quantity: sold, sizeName: size, portion: part })),
      customerName: isBill ? customerName : '',
      paymentStatus: payment,
      recordKind,
      generatedAt: editing ? editing.generatedAt : generatedAt,
      notes,
      correctsId: editing ? undefined : corrects?.id,
    }
    const result = editing ? await app.editSale(editing.id, draft) : await app.sendSale(draft)
    setSubmittingId(null)
    if (!result.ok) {
      setSubmitError(result.error)
      return
    }
    setReview(false)
    if (app.user?.role === 'admin') {
      navigate(isBill ? '/admin/bills' : '/admin/sales')
      return
    }
    setLines([])
    setNotes('')
    setCustomerName('')
    setPayment(isBill ? 'unpaid' : 'paid')
    setProductId('')
    setQuantity(null)
    setSearch('')
    setGeneratedAt(new Date().toISOString())
    if (params.get('correct')) navigate(isBill ? '/employee/bills' : '/employee/sales', { replace: true })
  }

  async function setSavedPayment(next: BillPayment) {
    if (!openSavedBill || submittingId) return
    setPayError('')
    if (next === 'unpaid') {
      setPaying(false)
      setPayAmount(null)
      setOpenSaved(null)
      return
    }
    setPaying(true)
  }

  async function applyPayment() {
    if (!openSavedBill || submittingId) return
    const remaining = billBalance(openSavedBill)
    if (payAmount == null || !Number.isInteger(payAmount) || payAmount < 1) {
      setPayError(t('billNeedAmount'))
      return
    }
    if (payAmount > remaining) {
      setPayError(t('billPayTooMuch'))
      return
    }
    setSubmittingId(openSavedBill.id)
    setPayError('')
    const result = await app.recordBillPayment(openSavedBill.id, payAmount)
    setSubmittingId(null)
    if (!result.ok) {
      setPayError(result.error)
      return
    }
    const left = remaining - payAmount
    setPaying(false)
    setPayAmount(null)
    if (left <= 0) setOpenSaved(null)
  }

  function closeBill() {
    if (submittingId) return
    setPayError('')
    setPaying(false)
    setPayAmount(null)
    setAddingItem(false)
    setExtraProductId('')
    setExtraSearch('')
    setExtraQty(null)
    setExtraSize('one')
    setExtraPortion('full')
    setOpenSaved(null)
  }

  async function addSavedItem() {
    if (!openSavedBill || submittingId || !extraSelected || !extraChosen || extraQty == null || !Number.isInteger(extraQty) || extraQty < 1) {
      setPayError(t('salesNeed'))
      return
    }
    if (freeQty(extraSelected.id) < 1) {
      setPayError(t('salesOut'))
      return
    }
    if (extraQty > freeQty(extraSelected.id)) {
      setPayError(t('billOverStock'))
      return
    }
    setSubmittingId(openSavedBill.id)
    setPayError('')
    const result = await app.appendBillItem(openSavedBill.id, {
      productId: extraSelected.id,
      quantity: extraQty,
      sizeName: extraChosen.sizeName,
      portion: extraChosen.portion,
    })
    setSubmittingId(null)
    if (!result.ok) {
      setPayError(result.error)
      return
    }
    setAddingItem(false)
    setExtraProductId('')
    setExtraSearch('')
    setExtraQty(null)
    setExtraSize('one')
    setExtraPortion('full')
  }

  if (remainingMode && employeeSale) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('salesRecordTitle')} description={t('salesBlockedBody')} />
        <Panel className="space-y-4">
          <p className="text-sm leading-6 text-stone-600">{t('salesBlockedBody')}</p>
          <Link to="/employee/remaining" className="inline-flex rounded-2xl bg-amber-700 px-4 py-3 text-sm font-semibold text-white">
            {t('navRemaining')}
          </Link>
        </Panel>
      </div>
    )
  }

  return (
    <div className={priced.length ? 'pb-24 md:pb-0' : undefined}>
      <PageHeader title={editing ? (isBill ? t('billEditTitle') : t('salesEditTitle')) : isBill ? t('billRecordTitle') : t('salesRecordTitle')} description={editing ? (isBill ? t('billEditBody') : t('salesEditBody')) : isBill ? t('billRecordBody') : t('salesRecordBody')} />
      {corrects && !correctionSent && <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">{t('salesCorrecting')} {corrects.code}.</p>}
      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(16rem,0.9fr)]">
        <div ref={formRef} className={employeeBill && myBills.length > 0 ? 'md:order-2' : undefined}>
          <Panel className="space-y-4">
            {editingLineId && (
              <div className="flex items-start justify-between gap-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <p>{t('salesUpdating')}</p>
                <button type="button" className="shrink-0 font-semibold" onClick={() => { setEditingLineId(null); if (employeeBill) blankBillFields(); else setQuantity(null) }}>{t('stockCancelEdit')}</button>
              </div>
            )}
            {isBill && <Field label={t('billCustomer')}><TextInput value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></Field>}
            {addingToCustomer && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">{t('billAddingFor')} {customerName.trim()}.</p>}
            <div className="rounded-xl bg-stone-50 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-stone-500">{t('billGenerated')}</p>
              <p className="mt-1 font-medium">{formatDateTime(editing ? editing.generatedAt : generatedAt)}</p>
              <p className="mt-1 text-sm leading-5 text-stone-500">{t('billGeneratedHint')}</p>
            </div>
            {isBill && !employeeBill ? (
              <Field label={t('billPayment')} hint={t('billPayFirst')}>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" className="w-full px-2" variant={payment === 'unpaid' ? 'gold' : 'secondary'} onClick={() => setPayment('unpaid')}>{t('billUnpaid')}</Button>
                  <Button type="button" className="w-full px-2" variant={payment === 'paid' ? 'gold' : 'secondary'} onClick={() => setPayment('paid')}>{t('billPaid')}</Button>
                </div>
              </Field>
            ) : !isBill ? (
              <div className="rounded-xl bg-stone-50 px-3 py-2 text-sm">
                <p className="text-xs uppercase tracking-wide text-stone-500">{t('billPayment')}</p>
                <p className="mt-1 font-semibold">{t('billPaid')}</p>
              </div>
            ) : null}
            <ProductPicker images="selected" products={listed} selectedId={productId} onSelect={(next) => {
              setProductId(next)
              setSearch('')
              const product = listed.find((item) => item.id === next)
              const first = product ? saleOptions(product)[0] : undefined
              setSizeName(first?.sizeName ?? 'one')
              setPortion(first?.portion ?? 'full')
              setQuantity(null)
            }} query={search} onQuery={setSearch} snapshots={app.snapshots} canSeeStock stockLeft={freeQty} />
            {sizeChoices.length > 1 && (
              <Field label={t('salesSize')}>
                <div className={`grid gap-2 ${sizeChoices.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  {sizeChoices.map((size) => (
                    <Button key={size} type="button" disabled={outOfStock} className="w-full px-2" variant={chosen?.sizeName === size ? 'gold' : 'secondary'} onClick={() => {
                      setSizeName(size)
                      const nextPortion = options.find((item) => item.sizeName === size && item.portion === portion) ?? options.find((item) => item.sizeName === size)
                      setPortion(nextPortion?.portion ?? 'full')
                    }}>{t(size === 'small' ? 'productsSizeSmall' : size === 'medium' ? 'productsSizeMedium' : 'productsSizeBig')}</Button>
                  ))}
                </div>
              </Field>
            )}
            {portionChoices.length > 1 && (
              <Field label={t('salesServing')}>
                <div className={`grid gap-2 ${portionChoices.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  {portionChoices.map((part) => (
                    <Button key={part} type="button" disabled={outOfStock} className="w-full px-2" variant={chosen?.portion === part ? 'gold' : 'secondary'} onClick={() => setPortion(part)}>{t(part === 'cup' ? 'salesCup' : part === 'half' ? 'salesHalf' : 'salesFull')}</Button>
                  ))}
                </div>
              </Field>
            )}
            {selected && chosen && (
              <div className="rounded-xl bg-stone-50 px-3 py-2 text-sm text-stone-600">
                <p className="text-xs uppercase tracking-wide text-stone-500">{t('salesPrice')}</p>
                <p className="text-lg font-semibold text-ink">{app.money(chosen.price)}</p>
                {quantity != null && quantity > 0 && <p className="mt-1 font-semibold text-ink">{t('billLineTotal')} {app.money(chosen.price * quantity)}</p>}
                {labelFor(chosen.sizeName, chosen.portion) && <p className="mt-1">{labelFor(chosen.sizeName, chosen.portion)}</p>}
                {snap && <p className="mt-1">{freeQty(productId)} {t('pickerAvailable')}, {snap.reserved} {t('salesReserved')}.</p>}
              </div>
            )}
            {(outOfStock || overStock) && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium leading-5 text-rose-900">{outOfStock ? t('salesOut') : t('billOverStock')}</p>}
            <Field label={t('salesQuantity')}><NumberInput value={outOfStock ? null : quantity} onValueChange={setQuantity} disabled={outOfStock} /></Field>
            {addHint && <p className="text-sm text-rose-700">{addHint}</p>}
            {submitError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{submitError}</p>}
            <Button type="button" variant="gold" size="lg" className="w-full shadow-md shadow-amber-900/20" loading={submittingId === 'form'} disabled={outOfStock || overStock || submittingId === 'form'} onClick={() => { if (employeeBill && !editingLineId && !addingToCustomer) void saveOpenBill(); else addLine() }}>
              <Plus className="h-5 w-5" aria-hidden="true" />{editingLineId ? (employeeBill ? t('billUpdate') : t('salesUpdate')) : addingToCustomer ? t('salesAdd') : employeeBill ? t('billSave') : t('salesAdd')}
            </Button>
          </Panel>
        </div>
        <Panel className={cn('md:sticky md:top-4 md:max-h-[calc(100vh-6rem)] md:self-start md:overflow-y-auto', employeeBill && myBills.length > 0 && 'order-first')}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">{employeeBill ? t('billYours') : t('salesSummary')}</h2>
            <p className="text-sm tabular-nums text-stone-500">{employeeBill ? myBills.length + billGroups.length : priced.length} {employeeBill ? t('billMany') : employeeSale ? t('salesMany') : ''}</p>
          </div>
          {employeeBill ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              {myBills.map((bill) => (
                <BillSquare
                  key={bill.id}
                  title={bill.customerName}
                  amount={app.money(billBalance(bill))}
                  note={(bill.amountPaid ?? 0) > 0 ? `${t('billPaid')} ${app.money(bill.amountPaid ?? 0)}` : t('billUnpaid')}
                  imageUrl={app.products.find((product) => product.id === bill.items[0]?.productId)?.imageUrl}
                  onClick={() => { setPayError(''); setPaying(false); setPayAmount(null); setOpenSaved(bill.id) }}
                />
              ))}
              {billGroups.map((group) => (
                <BillSquare
                  key={group.key}
                  title={group.name}
                  amount={app.money(saleTotal(group.lines))}
                  note={group.payment === 'paid' ? t('billSold') : t('billUnpaid')}
                  paid={group.payment === 'paid'}
                  imageUrl={group.lines[0]?.imageUrl}
                  onClick={() => setOpenDraft(group.key)}
                />
              ))}
              {!billGroups.length && !myBills.length && <p className="col-span-2 rounded-xl border border-dashed border-stone-300 px-3 py-6 text-center text-sm text-stone-500">{t('salesNone')}</p>}
            </div>
          ) : (
          <ol className="mt-3 space-y-2">
            {priced.map((line, index) => (
              <li key={line.id} ref={index === priced.length - 1 ? newestLine : undefined} className="rounded-xl bg-stone-50 px-3 py-2.5 text-sm">
                <p className="font-medium leading-5 text-ink"><span className="mr-1.5 text-stone-400">{index + 1}.</span>{line.name}</p>
                <p className="mt-0.5 text-stone-500">{[labelFor(line.sizeName, line.portion), `${line.quantity} ${line.unit}`].filter(Boolean).join(' · ')}</p>
                <p className="mt-0.5 font-semibold tabular-nums text-ink">{app.money(line.quantity * line.unitPrice)}</p>
              </li>
            ))}
            {!priced.length && <li className="rounded-xl border border-dashed border-stone-300 px-3 py-6 text-center text-sm text-stone-500">{t('salesNone')}</li>}
          </ol>
          )}
          <p className="mt-4 text-lg font-semibold tabular-nums">{app.money(total)}</p>
          <div className="mt-4 hidden md:block">
            <Button className="w-full" variant="gold" disabled={!priced.length || !billReady} onClick={() => { setSubmitError(''); setReview(true) }}>{editing ? (isBill ? t('billSave') : t('salesSave')) : t('salesReview')}</Button>
          </div>
        </Panel>
      </div>
      {employeeSale && (
        <section className="relative mt-4 overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/75 p-4 shadow-[0_18px_40px_rgba(28,25,23,0.08)] backdrop-blur-xl">
          <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-amber-200/50 blur-2xl" />
          <div className="relative flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-ink">{t('salesDayTitle')}</h2>
              <p className="mt-1 text-sm text-stone-500">{formatDate(dateKey())}</p>
            </div>
            <span className="grid h-11 min-w-11 place-items-center rounded-2xl border border-amber-200/80 bg-amber-50 px-3 text-sm font-semibold tabular-nums text-amber-950">{daySales.length}</span>
          </div>
          {daySales.length > 0 ? (
            <div
              ref={dayListRef}
              className="sales-day-list relative mt-4 max-h-80 overflow-y-auto overscroll-contain pr-1"
              onPointerDown={holdDayList}
              onPointerUp={releaseDayList}
              onPointerCancel={releaseDayList}
              onWheel={() => { holdDayList(); releaseDayList() }}
            >
              <ul className="grid gap-2.5">
                {daySales.map((line, index) => (
                  <li key={line.id} className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/90 px-3 py-3 shadow-[0_8px_20px_rgba(28,25,23,0.05)]">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-500 to-amber-800 text-sm font-semibold text-white shadow-md shadow-amber-900/20">{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      {line.customer ? <span className="block truncate text-base font-semibold leading-5 text-ink">{line.customer}</span> : null}
                      {line.name ? <span className={cn('block truncate text-sm leading-5 text-stone-500', line.customer && 'mt-0.5')}>{line.name}</span> : null}
                    </span>
                    <span className="shrink-0 rounded-xl bg-stone-950 px-3 py-2 text-sm font-semibold tabular-nums text-white">{app.money(line.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="relative mt-4 rounded-2xl border border-dashed border-stone-300 bg-white/60 px-3 py-8 text-center text-sm text-stone-500">{t('salesDayEmpty')}</p>
          )}
        </section>
      )}
      {priced.length > 0 && (
        <div className="fixed inset-x-3 z-30 md:hidden" style={{ bottom: 'calc(6.75rem + env(safe-area-inset-bottom))' }}>
          <Button className="w-full" variant="gold" disabled={!billReady} onClick={() => { setSubmitError(''); setReview(true) }}>{t('salesReview')} · {employeeBill ? billGroups.length : priced.length}</Button>
        </div>
      )}
      {review && (
        <div className="fixed inset-0 z-40 flex flex-col bg-[#f6f3ee]">
          <header className="flex items-center justify-between gap-3 border-b border-line bg-white px-3 py-3">
            <button type="button" className="text-sm font-semibold text-ink" disabled={submittingId !== null} onClick={() => setReview(false)}>{t('salesBack')}</button>
            <h2 className="text-base font-semibold text-ink">{editing ? (isBill ? t('billSave') : t('salesSave')) : t('salesReview')}</h2>
            <span className="text-sm tabular-nums text-stone-500">{employeeBill ? billGroups.length : priced.length}</span>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            <p className="text-sm leading-6 text-stone-600">{[employeeBill ? '' : isBill ? customerName.trim() : '', employeeBill ? '' : payment === 'paid' ? t('billPaid') : t('billUnpaid'), formatDateTime(editing ? editing.generatedAt : generatedAt)].filter(Boolean).join(' · ')}</p>
            <p className="text-sm leading-6 text-stone-600">{employeeEach ? (employeeBill ? t('billPayFirst') : t('salesReviewLead')) : editing ? (isBill ? t('billEditBody') : t('salesEditBody')) : app.user?.role === 'admin' ? t('billAdminBody') : t('salesModalBody')}</p>
            {submitError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{submitError}</p>}
            <Field label={t('salesNotes')}><TextArea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
            {employeeBill ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {billGroups.map((group) => (
                  <BillSquare
                    key={group.key}
                    title={group.name}
                    amount={app.money(saleTotal(group.lines))}
                    note={group.payment === 'paid' ? t('billPaid') : t('billUnpaid')}
                    paid={group.payment === 'paid'}
                    imageUrl={group.lines[0]?.imageUrl}
                    onClick={() => setOpenDraft(group.key)}
                  />
                ))}
              </div>
            ) : (
            <ol className="space-y-3">
              {priced.map((line, index) => (
                <li key={line.id} className="rounded-2xl border border-line bg-white p-3 shadow-sm">
                  <div className="flex items-start gap-3">
                    <ProductThumb src={line.imageUrl} name={line.name} className="h-12 w-12 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">{index + 1}</p>
                      <p className="mt-0.5 text-base font-semibold leading-5 text-ink">{line.name}</p>
                      <p className="mt-1 text-sm leading-5 text-stone-500">{[labelFor(line.sizeName, line.portion), `${line.quantity} ${line.unit}`, app.money(line.unitPrice)].filter(Boolean).join(' · ')}</p>
                      <p className="mt-1 text-sm font-semibold tabular-nums text-ink">{app.money(line.quantity * line.unitPrice)}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button size="sm" variant="secondary" disabled={submittingId !== null} onClick={() => editLine(line.id)}><Pencil className="h-4 w-4" aria-hidden="true" />{t('productsEdit')}</Button>
                    <Button size="sm" variant="danger" disabled={submittingId !== null} onClick={() => removeLine(line.id)}><Trash2 className="h-4 w-4" aria-hidden="true" />{t('salesRemove')}</Button>
                  </div>
                  {employeeSale && (
                    <Button className="mt-2 w-full" size="sm" variant="secondary" loading={submittingId === line.id} disabled={submittingId !== null && submittingId !== line.id} onClick={() => void submitLine(line.id)}>{t('salesSubmitOne')}</Button>
                  )}
                </li>
              ))}
            </ol>
            )}
          </div>
          <footer className="border-t border-line bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {employeeEach ? (
              <Button className="w-full" variant="gold" loading={submittingId === 'all'} disabled={!priced.length || (submittingId !== null && submittingId !== 'all')} onClick={() => void submitAll()}>{employeeSale ? t('salesRecordAll') : t('billSave')}</Button>
            ) : (
              <Button className="w-full" variant="gold" loading={submittingId === 'all'} disabled={!priced.length || !billReady || submittingId !== null} onClick={() => void saveTogether()}>{editing ? (isBill ? t('billSave') : t('salesSave')) : t('salesSubmit')}</Button>
            )}
          </footer>
        </div>
      )}
      {openGroup && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#f6f3ee]">
          <header className="flex items-center justify-between gap-3 border-b border-line bg-white px-3 py-3">
            <button type="button" className="text-sm font-semibold text-ink" disabled={submittingId !== null} onClick={() => setOpenDraft(null)}>{t('salesBack')}</button>
            <h2 className="min-w-0 truncate text-base font-semibold text-ink">{openGroup.name}</h2>
            <span className="text-sm font-semibold tabular-nums text-ink">{app.money(saleTotal(openGroup.lines))}</span>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            <p className="text-sm text-stone-600">{openGroup.payment === 'paid' ? t('billPaid') : t('billUnpaid')}</p>
            <ul className="space-y-3">
              {openGroup.lines.map((line) => (
                <li key={line.id} className="rounded-2xl border border-line bg-white p-3 shadow-sm">
                  <div className="flex items-start gap-3">
                    <ProductThumb src={line.imageUrl} name={line.name} className="h-12 w-12 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-5 text-ink">{line.name}</p>
                      <p className="mt-1 text-sm leading-5 text-stone-500">{[labelFor(line.sizeName, line.portion), `${line.quantity} ${line.unit}`, app.money(line.unitPrice)].filter(Boolean).join(' · ')}</p>
                      <p className="mt-1 text-sm font-semibold tabular-nums text-ink">{app.money(line.quantity * line.unitPrice)}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button size="sm" variant="secondary" disabled={submittingId !== null} onClick={() => editLine(line.id)}><Pencil className="h-4 w-4" aria-hidden="true" />{t('productsEdit')}</Button>
                    <Button size="sm" variant="danger" disabled={submittingId !== null} onClick={() => removeLine(line.id)}><Trash2 className="h-4 w-4" aria-hidden="true" />{t('salesRemove')}</Button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-2">
              <Button className="w-full px-2" variant={openGroup.payment === 'unpaid' ? 'gold' : 'secondary'} disabled={submittingId !== null} onClick={() => setGroupPayment(openGroup.key, 'unpaid')}>{t('billUnpaid')}</Button>
              <Button className="w-full px-2" variant={openGroup.payment === 'paid' ? 'gold' : 'secondary'} disabled={submittingId !== null} onClick={() => setGroupPayment(openGroup.key, 'paid')}>{t('billPaid')}</Button>
            </div>
            <Button className="w-full" variant="secondary" disabled={submittingId !== null} onClick={() => addForCustomer(openGroup.name)}><Plus className="h-4 w-4" aria-hidden="true" />{t('salesAdd')}</Button>
          </div>
          <footer className="border-t border-line bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button className="w-full" variant="gold" loading={submittingId === openGroup.key} disabled={submittingId !== null && submittingId !== openGroup.key} onClick={() => void submitLine(openGroup.key)}>{openGroup.payment === 'paid' ? t('billSold') : t('billSave')}</Button>
          </footer>
        </div>
      )}
      {openSavedBill && (
        <Modal open centered title={t('pageBillDetails')} onClose={closeBill}>
          <div className="rounded-2xl bg-stone-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{t('billCustomer')}</p>
            <p className="mt-1 text-lg font-semibold text-ink">{openSavedBill.customerName}</p>
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-stone-500">{t('billLineTotal')}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-ink">{app.money(saleTotal(openSavedBill.items))}</p>
            {(openSavedBill.amountPaid ?? 0) > 0 && (
              <>
                <p className="mt-4 text-xs font-medium uppercase tracking-wide text-stone-500">{t('billAmountPaid')}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-ink">{app.money(openSavedBill.amountPaid ?? 0)}</p>
              </>
            )}
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-stone-500">{t('billRemaining')}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{app.money(billBalance(openSavedBill))}</p>
          </div>
          <ul className="mt-3 space-y-2">
            {openSavedBill.items.map((item) => {
              const product = app.products.find((entry) => entry.id === item.productId)
              return (
                <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-stone-600">{product?.name ?? t('productsProduct')} × {item.quantity}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-ink">{app.money(item.quantity * item.unitPrice)}</span>
                </li>
              )
            })}
          </ul>
          <Button type="button" className="mt-4 w-full" variant="secondary" disabled={submittingId !== null} onClick={() => { setPayError(''); setPaying(false); setAddingItem((open) => !open) }}>
            <Plus className="h-4 w-4" aria-hidden="true" />{t('billAddItem')}
          </Button>
          {addingItem && (
            <div className="mt-3 space-y-3 rounded-2xl border border-line bg-stone-50 p-3">
              <ProductPicker
                images="selected"
                products={extraListed}
                selectedId={extraProductId}
                onSelect={(next) => {
                  setExtraProductId(next)
                  setExtraSearch('')
                  const product = extraListed.find((item) => item.id === next)
                  const first = product ? saleOptions(product)[0] : undefined
                  setExtraSize(first?.sizeName ?? 'one')
                  setExtraPortion(first?.portion ?? 'full')
                  setExtraQty(null)
                }}
                query={extraSearch}
                onQuery={setExtraSearch}
                snapshots={app.snapshots}
                canSeeStock
                stockLeft={freeQty}
              />
              {extraSizes.length > 1 && (
                <div className={`grid gap-2 ${extraSizes.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  {extraSizes.map((size) => (
                    <Button key={size} type="button" className="w-full px-2" variant={extraChosen?.sizeName === size ? 'gold' : 'secondary'} onClick={() => {
                      setExtraSize(size)
                      const nextPortion = extraOptions.find((item) => item.sizeName === size && item.portion === extraPortion) ?? extraOptions.find((item) => item.sizeName === size)
                      setExtraPortion(nextPortion?.portion ?? 'full')
                    }}>{t(size === 'small' ? 'productsSizeSmall' : size === 'medium' ? 'productsSizeMedium' : 'productsSizeBig')}</Button>
                  ))}
                </div>
              )}
              {extraPortions.length > 1 && (
                <div className={`grid gap-2 ${extraPortions.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  {extraPortions.map((part) => (
                    <Button key={part} type="button" className="w-full px-2" variant={extraChosen?.portion === part ? 'gold' : 'secondary'} onClick={() => setExtraPortion(part)}>{t(part === 'cup' ? 'salesCup' : part === 'half' ? 'salesHalf' : 'salesFull')}</Button>
                  ))}
                </div>
              )}
              <Field label={t('salesQuantity')}><NumberInput value={extraQty} onValueChange={setExtraQty} /></Field>
              <Button type="button" className="w-full" variant="gold" loading={submittingId === openSavedBill.id} disabled={submittingId !== null} onClick={() => void addSavedItem()}>{t('salesAdd')}</Button>
            </div>
          )}
          <p className="mt-5 text-sm font-medium text-ink">{t('billPayment')}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button type="button" variant={paying ? 'secondary' : 'gold'} disabled={submittingId !== null} onClick={() => void setSavedPayment('unpaid')}>{t('billUnpaid')}</Button>
            <Button type="button" variant={paying ? 'gold' : 'secondary'} disabled={submittingId !== null} onClick={() => void setSavedPayment('paid')}>{t('billPaid')}</Button>
          </div>
          {paying && (
            <div className="mt-4 space-y-3">
              <Field label={t('billAmountPaid')}><NumberInput value={payAmount} onValueChange={setPayAmount} /></Field>
              <Button type="button" className="w-full" variant="gold" loading={submittingId === openSavedBill.id} disabled={submittingId !== null} onClick={() => void applyPayment()}>{t('billUpdate')}</Button>
            </div>
          )}
          {payError && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{payError}</p>}
        </Modal>
      )}
    </div>
  )
}
