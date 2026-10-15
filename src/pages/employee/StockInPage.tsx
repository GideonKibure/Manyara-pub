import { useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ProductPicker } from '@/components/ProductPicker'
import { Button } from '@/components/ui/Button'
import { Field, NumberInput, SelectInput, TextArea, TextInput } from '@/components/ui/Fields'
import { PageHeader, Panel } from '@/components/ui/Feedback'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { MessageKey } from '@/i18n/messages'
import type { SaleSize } from '@/types'
import { dateKey } from '@/utils/dates'
import { uid } from '@/utils/id'
import { nextInvoiceRef } from '@/utils/invoice'
import { stockInTotal, stockInUnits } from '@/utils/labels'

interface Line {
  id: string
  productId: string
  sizeName: SaleSize
  receivedQuantity: number
  costPerStockUnit: number
}

function sizeLabel(size: Exclude<SaleSize, 'one'>): MessageKey {
  if (size === 'small') return 'productsSizeSmall'
  if (size === 'medium') return 'productsSizeMedium'
  return 'productsSizeBig'
}

export function StockInPage() {
  const app = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const corrects = app.stockIns.find((item) => item.id === params.get('correct') && item.submittedBy === app.user?.id)
  const editing = app.user?.role === 'admin'
    ? app.stockIns.find((item) => item.id === params.get('edit') && (item.status === 'pending' || item.status === 'approved'))
    : undefined
  const source = editing ?? corrects
  const activeProducts = app.products.filter((product) => product.isActive)
  const [search, setSearch] = useState('')
  const [productId, setProductId] = useState(source?.items[0]?.productId ?? '')
  const [sizeName, setSizeName] = useState<SaleSize>(source?.items[0]?.sizeName ?? 'one')
  const [quantity, setQuantity] = useState<number | null>(null)
  const [cost, setCost] = useState<number | null>(null)
  const [lines, setLines] = useState<Line[]>(() => source?.items.map((item) => ({
    id: item.id || uid(),
    productId: item.productId,
    sizeName: item.sizeName === 'small' || item.sizeName === 'medium' || item.sizeName === 'big' ? item.sizeName : 'one',
    receivedQuantity: item.receivedQuantity,
    costPerStockUnit: item.costPerStockUnit,
  })) ?? [])
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [supplierName, setSupplierName] = useState(source?.supplierName ?? '')
  const [newSupplier, setNewSupplier] = useState(false)
  const [deliveryDate, setDeliveryDate] = useState(source?.deliveryDate ?? dateKey())
  const [notes, setNotes] = useState(source?.notes ?? '')
  const [usedInvoices, setUsedInvoices] = useState<string[]>([])
  const [correctionSent, setCorrectionSent] = useState(false)
  const invoiceRef = useMemo(
    () => editing?.invoiceRef || nextInvoiceRef([...app.stockIns.map((item) => item.invoiceRef), ...usedInvoices]),
    [app.stockIns, editing?.invoiceRef, usedInvoices],
  )
  const [addHint, setAddHint] = useState('')
  const [review, setReview] = useState(false)
  const newestLine = useRef<HTMLLIElement>(null)
  const formRef = useRef<HTMLDivElement>(null)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const selected = activeProducts.find((product) => product.id === productId)
  const sizeChoices = selected?.sizeMode === 'many' ? selected.sizes : []
  const chosenSize = sizeChoices.find((size) => size.name === sizeName) ?? sizeChoices[0]
  const sellingPrice = chosenSize?.price ?? selected?.sellingPrice ?? 0
  const receiveUnit = app.units.find((unit) => unit.id === selected?.receiveUnitId)
  const stockUnit = app.units.find((unit) => unit.id === selected?.stockUnitId)
  const suppliers = app.suppliers.filter((supplier) => supplier.isActive)
  const supplierReady = supplierName.trim().length >= 2
  const employeeSubmit = app.user?.role !== 'admin'
  const preview = useMemo(() => lines.map((line) => {
    const product = app.products.find((item) => item.id === line.productId)
    const stockQuantity = line.receivedQuantity * (product?.conversionFactor ?? 1)
    return { ...line, name: product?.name ?? t('productsProduct'), imageUrl: product?.imageUrl, stockQuantity, total: line.costPerStockUnit * stockQuantity }
  }), [lines, app.products, t])

  function sizeOf(line: { sizeName: SaleSize }) {
    return line.sizeName === 'one' ? '' : ` · ${t(sizeLabel(line.sizeName))}`
  }

  function removeLine(id: string) {
    const remaining = lines.filter((item) => item.id !== id)
    setLines(remaining)
    if (editingLineId === id) setEditingLineId(null)
    if (!remaining.length) setReview(false)
  }

  useEffect(() => {
    if (!review) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [review])

  const lineCount = useRef(lines.length)
  useEffect(() => {
    if (lines.length > lineCount.current) newestLine.current?.scrollIntoView({ block: 'nearest' })
    lineCount.current = lines.length
  }, [lines.length])

  function addLine() {
    if (!supplierReady) return
    if (!selected || quantity == null || cost == null || !Number.isInteger(quantity) || quantity < 1 || !Number.isInteger(cost) || cost < 0) {
      setAddHint(t('stockNeed'))
      return
    }
    setAddHint('')
    const nextSize: SaleSize = chosenSize?.name ?? 'one'
    const next: Line = {
      id: editingLineId ?? uid(),
      productId: selected.id,
      sizeName: nextSize,
      receivedQuantity: quantity,
      costPerStockUnit: cost,
    }
    setLines((current) => {
      if (editingLineId && current.some((line) => line.id === editingLineId)) {
        return current.map((line) => line.id === editingLineId ? next : line)
      }
      return [...current, { ...next, id: uid() }]
    })
    setEditingLineId(null)
    setQuantity(null)
    setCost(null)
  }

  function editLine(id: string) {
    const line = lines.find((item) => item.id === id)
    if (!line) return
    setProductId(line.productId)
    setSizeName(line.sizeName)
    setQuantity(line.receivedQuantity)
    setCost(line.costPerStockUnit)
    setEditingLineId(id)
    setSearch('')
    setReview(false)
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  async function submitLine(id: string) {
    const line = lines.find((item) => item.id === id)
    if (!line || submittingId) return
    const ref = invoiceRef
    setSubmittingId(id)
    const result = await app.sendStockIn({
      items: [{ productId: line.productId, sizeName: line.sizeName, receivedQuantity: line.receivedQuantity, costPerStockUnit: line.costPerStockUnit }],
      supplierName,
      deliveryDate,
      invoiceRef: ref,
      notes,
      correctsId: corrects && !correctionSent ? corrects.id : undefined,
    })
    setSubmittingId(null)
    if (!result.ok) return
    setUsedInvoices((current) => current.includes(ref) ? current : [...current, ref])
    if (corrects && !correctionSent) setCorrectionSent(true)
    const remaining = lines.filter((item) => item.id !== id)
    setLines(remaining)
    if (editingLineId === id) setEditingLineId(null)
    if (!remaining.length) {
      setReview(false)
      setNotes('')
      if (params.get('correct')) navigate('/employee/stock-in', { replace: true })
    }
  }

  async function submitAll() {
    if (submittingId || !lines.length) return
    setSubmittingId('all')
    const taken = [...app.stockIns.map((item) => item.invoiceRef), ...usedInvoices]
    let corrected = correctionSent
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const ref = nextInvoiceRef(taken)
      const result = await app.sendStockIn({
        items: [{ productId: line.productId, sizeName: line.sizeName, receivedQuantity: line.receivedQuantity, costPerStockUnit: line.costPerStockUnit }],
        supplierName,
        deliveryDate,
        invoiceRef: ref,
        notes,
        correctsId: corrects && !corrected ? corrects.id : undefined,
      })
      if (!result.ok) {
        setUsedInvoices(taken.slice(app.stockIns.length))
        if (corrected) setCorrectionSent(true)
        setLines(lines.slice(index))
        setSubmittingId(null)
        return
      }
      taken.push(ref)
      if (corrects) corrected = true
    }
    setUsedInvoices(taken.slice(app.stockIns.length))
    setCorrectionSent(corrected)
    setLines([])
    setEditingLineId(null)
    setSubmittingId(null)
    setReview(false)
    setNotes('')
    if (params.get('correct')) navigate('/employee/stock-in', { replace: true })
  }

  return (
    <div className={preview.length ? 'pb-20 md:pb-0' : undefined}>
      <PageHeader title={editing ? 'Edit stock delivery' : t('stockTitle')} description={editing ? 'The invoice number stays the same. Saving updates the supplier, the date, and the products.' : employeeSubmit ? t('stockDescription') : t('stockAdminDescription')} />
      {corrects && !correctionSent && <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">{t('salesCorrecting')} {corrects.code}. {t('stockCorrecting')}</p>}
      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(16rem,0.9fr)]">
        <div ref={formRef}>
        <Panel className="space-y-4">
          {editingLineId && (
            <div className="flex items-start justify-between gap-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <p>{t('stockUpdating')}</p>
              <button type="button" className="shrink-0 font-semibold" onClick={() => { setEditingLineId(null); setQuantity(null); setCost(null) }}>{t('stockCancelEdit')}</button>
            </div>
          )}
          <Field label={t('stockSupplier')} hint={t('stockSelectFirst')}>
            <SelectInput
              value={suppliers.some((supplier) => supplier.name === supplierName) ? supplierName : newSupplier || supplierName ? '__new__' : ''}
              onChange={(event) => {
                const value = event.target.value
                if (value === '__new__') {
                  setNewSupplier(true)
                  if (suppliers.some((supplier) => supplier.name === supplierName)) setSupplierName('')
                  return
                }
                setNewSupplier(false)
                setSupplierName(value)
              }}
            >
              <option value="">{t('stockSelectSupplier')}</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.name}>{supplier.name}</option>)}
              <option value="__new__">{t('stockNewSupplier')}</option>
            </SelectInput>
          </Field>
          {(newSupplier || (supplierName !== '' && !suppliers.some((supplier) => supplier.name === supplierName))) && (
            <Field label={t('stockNewSupplier')}>
              <TextInput value={supplierName} onChange={(event) => setSupplierName(event.target.value)} placeholder={t('stockSupplierPlaceholder')} />
            </Field>
          )}
          <Field label={t('stockDate')}><TextInput type="date" max={dateKey()} value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} /></Field>
          {!employeeSubmit && (
            <Field label={t('stockInvoice')} hint={t('stockInvoiceReady')}>
              <TextInput value={invoiceRef} readOnly className="bg-stone-100 font-medium" />
            </Field>
          )}
          <ProductPicker
            images="selected"
            products={activeProducts}
            selectedId={productId}
            query={search}
            onQuery={setSearch}
            snapshots={app.snapshots}
            canSeeStock
            onSelect={(next) => {
              const product = activeProducts.find((item) => item.id === next)
              setProductId(next)
              setSizeName(product?.sizeMode === 'many' ? product.sizes[0]?.name ?? 'one' : 'one')
              setSearch('')
              setCost(null)
              setQuantity(null)
              setEditingLineId(null)
            }}
          />
          {sizeChoices.length > 0 && (
            <Field label={t('salesSize')}>
              <div className={`grid gap-2 ${sizeChoices.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {sizeChoices.map((size) => (
                  <Button key={size.name} type="button" className="w-full px-2" variant={chosenSize?.name === size.name ? 'gold' : 'secondary'} onClick={() => setSizeName(size.name)}>
                    {t(size.name === 'small' ? 'productsSizeSmall' : size.name === 'medium' ? 'productsSizeMedium' : 'productsSizeBig')}
                  </Button>
                ))}
              </div>
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`${t('stockQuantity')} (${receiveUnit?.name ?? 'unit'})`}><NumberInput value={quantity} onValueChange={setQuantity} /></Field>
            <Field label={`${t('stockCost')} ${stockUnit?.abbreviation ?? 'unit'}`} hint={t('stockCostHint')}><NumberInput value={cost} onValueChange={setCost} /></Field>
          </div>
          {selected && (
            <div className="rounded-xl bg-stone-50 px-3 py-2 text-sm text-stone-600">
              <p className="text-xs uppercase tracking-wide text-stone-500">{t('salesPrice')}</p>
              <p className="text-lg font-semibold text-ink">{app.money(sellingPrice)}</p>
              <p className="mt-1">{t('productsCost')} {app.money(chosenSize?.cost ?? selected.costPrice)}</p>
              <p>{quantity || 0} {receiveUnit?.abbreviation} {t('stockAdds')} {(quantity || 0) * selected.conversionFactor} {stockUnit?.abbreviation}. {t('stockTotal')} {app.money((quantity || 0) * selected.conversionFactor * (cost || 0))}.</p>
            </div>
          )}
          {!supplierReady && <p className="text-sm text-amber-900">{t('stockSelectFirst')}</p>}
          {addHint && <p className="text-sm text-rose-700">{addHint}</p>}
          <Button type="button" variant="gold" size="lg" className="w-full shadow-md shadow-amber-900/20 disabled:bg-stone-800 disabled:text-white disabled:opacity-100" disabled={!supplierReady} onClick={addLine}>
            <Plus className="h-5 w-5" aria-hidden="true" />{editingLineId ? t('stockUpdate') : t('stockAdd')}
          </Button>
        </Panel>
        </div>
        <Panel className="md:sticky md:top-4 md:max-h-[calc(100vh-6rem)] md:self-start md:overflow-y-auto">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">{t('stockSummary')}</h2>
            <p className="text-sm tabular-nums text-stone-500">{preview.length} {t('stockMany')}</p>
          </div>
          <ol className="mt-3 space-y-2">
            {preview.map((line, index) => (
              <li key={line.id} ref={index === preview.length - 1 ? newestLine : undefined} className="rounded-xl bg-stone-50 px-3 py-2.5 text-sm">
                <p className="font-medium text-ink"><span className="mr-1.5 text-stone-400">{index + 1}.</span>{line.name}{sizeOf(line)}</p>
                <p className="mt-0.5 text-stone-500">{line.receivedQuantity} · {line.stockQuantity} · {app.money(line.total)}</p>
              </li>
            ))}
            {!preview.length && <li className="rounded-xl border border-dashed border-stone-300 px-3 py-6 text-center text-sm text-stone-500">{t('stockNone')}</li>}
          </ol>
          <p className="mt-4 text-sm font-semibold">{stockInUnits(preview.map((line) => ({ stockQuantity: line.stockQuantity })))} stock units · {app.money(stockInTotal(preview.map((line) => ({ totalCost: line.total }))))}</p>
          <div className="mt-4 hidden md:block">
            <Button className="w-full" variant="gold" disabled={!preview.length || !supplierReady} onClick={() => setReview(true)}>{editing ? 'Save delivery' : t('stockReview')}</Button>
          </div>
        </Panel>
      </div>
      {preview.length > 0 && (
        <div className="fixed inset-x-3 z-30 md:hidden" style={{ bottom: 'calc(6.75rem + env(safe-area-inset-bottom))' }}>
          <Button className="w-full" variant="gold" disabled={!supplierReady} onClick={() => setReview(true)}>{t('stockReview')} · {preview.length}</Button>
        </div>
      )}
      {review && (
        <div className="fixed inset-0 z-40 flex flex-col bg-[#f6f3ee]">
          <header className="flex items-center justify-between gap-3 border-b border-line bg-white px-3 py-3">
            <button type="button" className="text-sm font-semibold text-ink" disabled={submittingId !== null} onClick={() => setReview(false)}>{t('stockBack')}</button>
            <h2 className="text-base font-semibold text-ink">{t('stockReview')}</h2>
            <span className="text-sm tabular-nums text-stone-500">{preview.length}</span>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            <p className="text-sm leading-6 text-stone-600">{supplierName.trim()} · {deliveryDate}</p>
            <p className="text-sm leading-6 text-stone-600">{editing ? 'The invoice number stays the same.' : employeeSubmit ? t('stockReviewLead') : `${t('stockInvoice')} ${invoiceRef}. ${t('stockApproveBody')}`}</p>
            <Field label={t('stockNotes')}><TextArea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
            <ol className="space-y-3">
              {preview.map((line, index) => (
                <li key={line.id} className="rounded-2xl border border-line bg-white p-3 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">{index + 1}</p>
                  <p className="mt-1 text-base font-semibold text-ink">{line.name}{sizeOf(line)}</p>
                  <p className="mt-1 text-sm text-stone-500">{line.receivedQuantity} · {line.stockQuantity}</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-ink">{app.money(line.total)}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button size="sm" variant="secondary" disabled={submittingId !== null} onClick={() => editLine(line.id)}><Pencil className="h-4 w-4" aria-hidden="true" />{t('productsEdit')}</Button>
                    <Button size="sm" variant="danger" disabled={submittingId !== null} onClick={() => removeLine(line.id)}><Trash2 className="h-4 w-4" aria-hidden="true" />{t('salesRemove')}</Button>
                  </div>
                  {employeeSubmit && !editing && (
                    <Button className="mt-2 w-full" size="sm" variant="secondary" loading={submittingId === line.id} disabled={submittingId !== null && submittingId !== line.id} onClick={() => void submitLine(line.id)}>{t('stockSubmit')}</Button>
                  )}
                </li>
              ))}
            </ol>
          </div>
          <footer className="border-t border-line bg-white p-3">
            {employeeSubmit && !editing && (
              <Button className="w-full" variant="gold" loading={submittingId === 'all'} disabled={!preview.length || (submittingId !== null && submittingId !== 'all')} onClick={() => void submitAll()}>{t('stockSubmitAll')}</Button>
            )}
            {editing && (
              <Button className="w-full" variant="gold" loading={saving} onClick={async () => {
                setSaving(true)
                const result = await app.editStockIn(editing.id, { items: lines, supplierName, deliveryDate, notes })
                setSaving(false)
                if (!result.ok) return
                setReview(false)
                navigate('/admin/stock-in')
              }}>Save delivery</Button>
            )}
            {!editing && !employeeSubmit && (
              <Button className="w-full" variant="gold" loading={saving} onClick={async () => {
                setSaving(true)
                const result = await app.sendStockIn({ items: lines, supplierName, deliveryDate, invoiceRef, notes, correctsId: corrects?.id })
                setSaving(false)
                if (!result.ok) return
                setReview(false)
                navigate('/admin/stock-in')
              }}>{t('stockApprove')}</Button>
            )}
          </footer>
        </div>
      )}
    </div>
  )
}
