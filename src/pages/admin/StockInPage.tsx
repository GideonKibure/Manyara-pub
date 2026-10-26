import { useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ApproveAllButton } from '@/components/ui/ApproveAll'
import { Button } from '@/components/ui/Button'
import { StockInPdfButton } from '@/features/stockIn/StockInPdfButton'
import { StockInRecordCard } from '@/features/stockIn/StockInRecordCard'
import { stockInMatchesQuery, stockInProductNames } from '@/features/stockIn/stockInSearch'
import { PersonPhoto } from '@/components/ProductPicker'
import { Field, SelectInput, TextInput } from '@/components/ui/Fields'
import { PageHeader, Panel } from '@/components/ui/Feedback'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { StockInDetail } from '@/features/transactions/Details'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { StockInTransaction } from '@/types'
import { cn } from '@/utils/cn'
import { dateKey, formatDate } from '@/utils/dates'
import { storeProfileImage } from '@/utils/image'

function monthParts(cursor: Date) {
  return { year: cursor.getFullYear(), month: cursor.getMonth() }
}

function monthCells(year: number, month: number) {
  const first = new Date(year, month, 1)
  const pad = (first.getDay() + 6) % 7
  const days = new Date(year, month + 1, 0).getDate()
  const cells: Array<{ key: string; day: number } | null> = []
  for (let index = 0; index < pad; index += 1) cells.push(null)
  for (let day = 1; day <= days; day += 1) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    cells.push({ key, day })
  }
  while (cells.length % 7) cells.push(null)
  return cells
}

function monthWord(key: string) {
  const [year, month] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(new Date(year, month - 1, 1)).toUpperCase()
}

export function StockInPage() {
  const app = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [cursor, setCursor] = useState(() => new Date())
  const { year, month } = monthParts(cursor)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<StockInTransaction | null>(null)
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [suppliersOpen, setSuppliersOpen] = useState(false)
  const [supplierName, setSupplierName] = useState('')
  const [supplierPhone, setSupplierPhone] = useState('')
  const [supplierPhoto, setSupplierPhoto] = useState('')
  const photoRef = useRef<HTMLInputElement>(null)
  const [photoFor, setPhotoFor] = useState<string | null>(null)
  const [removing, setRemoving] = useState('')
  const [removingBusy, setRemovingBusy] = useState(false)
  const [approving, setApproving] = useState(false)
  const [deleteAllOpen, setDeleteAllOpen] = useState(false)
  const [deleteDayOpen, setDeleteDayOpen] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)
  const pendingCount = app.stockIns.filter((item) => item.status === 'pending').length
  const supplierToRemove = app.suppliers.find((supplier) => supplier.id === removing)
  const today = dateKey()
  const cells = monthCells(year, month)
  const monthTitle = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1))
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const rows = useMemo(
    () =>
      app.stockIns.filter((item) => {
        if (status !== 'all' && item.status !== status) return false
        return stockInMatchesQuery(item, app.products, query)
      }),
    [app.products, app.stockIns, query, status],
  )

  const byDay = useMemo(() => {
    const map = new Map<string, StockInTransaction[]>()
    for (const item of rows) {
      const list = map.get(item.deliveryDate) ?? []
      list.push(item)
      map.set(item.deliveryDate, list)
    }
    return map
  }, [rows])

  const selectedRows = selected ? (byDay.get(selected) ?? []).slice().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)) : []
  const matchList = query.trim()
    ? rows.slice().sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate) || b.submittedAt.localeCompare(a.submittedAt)).slice(0, 12)
    : []

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('pageStockReceived')}
        description={t('pageStockReceivedBody')}
        actions={
          <span className="flex w-full flex-wrap gap-2 sm:w-auto">
            <StockInPdfButton className="flex-1 sm:flex-none" />
            <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => setSupplierOpen(true)}>{t('pageAddSupplier')}</Button>
            <Button variant="gold" className="flex-1 sm:flex-none" onClick={() => navigate('/admin/stock-in/new')}>{t('addStock')}</Button>
          </span>
        }
      />
      <Panel>
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setSuppliersOpen((open) => !open)}>
          <span>
            <span className="block font-semibold">{t('suppliersTitle')}</span>
            <span className="block text-sm text-stone-500">{app.suppliers.length} · {t('suppliersBody')}</span>
          </span>
          <ChevronDown className={cn('h-5 w-5 shrink-0 text-amber-900 transition', suppliersOpen && 'rotate-180')} />
        </button>
        {suppliersOpen && (
          <ul className="mt-3 divide-y divide-line">
            {app.suppliers.map((supplier) => (
              <li key={supplier.id} className="flex items-center justify-between gap-3 py-3">
                <span className="flex min-w-0 items-center gap-3">
                  <PersonPhoto src={supplier.imageUrl} name={supplier.name} className="h-12 w-12" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{supplier.name}</span>
                    <span className="block text-sm text-stone-500">{supplier.phone || '—'}</span>
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap justify-end gap-2">
                  <Button size="sm" variant="secondary" onClick={() => { setPhotoFor(supplier.id); photoRef.current?.click() }}>{supplier.imageUrl ? t('suppliersChangePhoto') : t('suppliersPhoto')}</Button>
                  <Button size="sm" variant="danger" onClick={() => setRemoving(supplier.id)}>{t('suppliersRemove')}</Button>
                </span>
              </li>
            ))}
            {!app.suppliers.length && <li className="py-3 text-sm text-stone-500">{t('suppliersEmpty')}</li>}
          </ul>
        )}
      </Panel>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <ApproveAllButton
          count={pendingCount}
          loading={approving}
          className="mb-0 flex-1"
          label={t('approveAllStockIn')}
          onClick={async () => {
            setApproving(true)
            await app.approveAllPending('stock_in')
            setApproving(false)
          }}
        />
        {rows.length > 0 && (
          <Button variant="danger" className="w-full sm:w-auto" onClick={() => setDeleteAllOpen(true)}>
            {t('deleteAllStockIn')}
          </Button>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('searchDeliveries')} aria-label={t('searchDeliveries')} />
        <SelectInput value={status} onChange={(event) => setStatus(event.target.value)} aria-label={t('filterStatus')}>
          <option value="all">{t('allStatuses')}</option>
          <option value="pending">{t('statusPending')}</option>
          <option value="approved">{t('statusApproved')}</option>
          <option value="rejected">{t('statusRejected')}</option>
          <option value="cancelled">{t('statusCancelled')}</option>
        </SelectInput>
      </div>

      {matchList.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-ink">{t('stockMatching')} · {rows.length}</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {matchList.map((item) => (
              <StockInRecordCard key={item.id} record={item} showDate manage onView={setDetail} />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" size="sm" aria-label={t('tablePrev')} onClick={() => setCursor(new Date(year, month - 1, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="font-display text-xl text-ink sm:text-2xl">{monthTitle}</h2>
        <Button variant="secondary" size="sm" aria-label={t('tableNext')} onClick={() => setCursor(new Date(year, month + 1, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-stone-500 sm:gap-2">
        {weekdays.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
        {cells.map((cell, index) => {
          if (!cell) return <div key={`empty-${index}`} className="min-h-16 sm:min-h-28" />
          const deliveries = byDay.get(cell.key) ?? []
          const ready = deliveries.length > 0
          const pending = deliveries.some((item) => item.status === 'pending')
          const approved = deliveries.some((item) => item.status === 'approved')
          const names = [...new Set(deliveries.flatMap((item) => stockInProductNames(item, app.products)))].slice(0, 2)
          const future = cell.key > today
          return (
            <button
              key={cell.key}
              type="button"
              disabled={future}
              onClick={() => setSelected(cell.key)}
              className={cn(
                'reveal-card flex min-h-16 flex-col items-center rounded-2xl px-1 py-2 text-center transition sm:min-h-28 sm:rounded-3xl sm:px-2',
                future && 'cursor-not-allowed opacity-40',
                ready
                  ? 'glass-panel hover:-translate-y-0.5 hover:shadow-lg'
                  : 'border border-dashed border-white/50 bg-white/20 text-stone-400',
                selected === cell.key && ready && 'ring-2 ring-amber-600',
                approved && !pending && 'bg-emerald-50/70',
                pending && 'bg-amber-50/80',
              )}
            >
              <span className={cn('font-display text-xl leading-none sm:text-3xl', ready ? 'text-ink' : 'text-stone-400')}>{cell.day}</span>
              <span className={cn('mt-1 text-[10px] font-bold tracking-[0.18em]', ready ? 'text-amber-800' : 'text-stone-400')}>{monthWord(cell.key)}</span>
              {ready && (
                <>
                  <span className="mt-1 hidden w-full truncate text-[10px] font-medium leading-tight text-ink sm:block">{names.join(', ')}</span>
                  <span className="mt-1 rounded-full bg-stone-900/80 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">{deliveries.length}</span>
                </>
              )}
            </button>
          )
        })}
      </div>
      {!rows.length && <p className="text-center text-sm text-stone-500">{t('emptyDeliveries')}</p>}

      <Modal open={Boolean(selected)} title={selected ? `${t('pageStockReceived')} · ${formatDate(selected)}` : t('pageStockReceived')} onClose={() => setSelected(null)} wide>
        <div className="space-y-3">
          {selected && selectedRows.length > 0 && (
            <StockInPdfButton className="w-full sm:w-auto" variant="gold" day={selected} records={selectedRows} />
          )}
          {selectedRows.map((item) => (
            <StockInRecordCard key={item.id} record={item} manage onView={setDetail} />
          ))}
          {!selectedRows.length && (
            <div className="space-y-3">
              <p className="text-sm text-stone-500">{t('stockDayEmpty')}</p>
              {selected && (
                <Button variant="gold" onClick={() => navigate(`/admin/stock-in/new?day=${selected}`)}>{t('stockAddThisDay')}</Button>
              )}
            </div>
          )}
        </div>
      </Modal>
      <Modal open={Boolean(detail)} title={t('deliveryDetails')} onClose={() => setDetail(null)} wide>
        {detail && <StockInDetail record={app.stockIns.find((item) => item.id === detail.id) ?? detail} mode="review" />}
      </Modal>
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          try {
            const imageUrl = await storeProfileImage(file)
            if (photoFor) await app.editSupplier(photoFor, { imageUrl })
            else setSupplierPhoto(imageUrl)
          } catch {
            /* keep previous photo */
          }
          setPhotoFor(null)
        }}
      />
      <Modal open={supplierOpen} title={t('pageAddSupplier')} onClose={() => setSupplierOpen(false)}>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault()
            const result = await app.addSupplier({ name: supplierName, phone: supplierPhone, imageUrl: supplierPhoto })
            if (result.ok) {
              setSupplierName('')
              setSupplierPhone('')
              setSupplierPhoto('')
              setSupplierOpen(false)
            }
          }}
        >
          <div className="flex items-center gap-3">
            <PersonPhoto src={supplierPhoto} name={supplierName || t('pageAddSupplier')} className="h-16 w-16" />
            <Button type="button" variant="secondary" onClick={() => { setPhotoFor(null); photoRef.current?.click() }}>{supplierPhoto ? t('suppliersChangePhoto') : t('suppliersPhoto')}</Button>
          </div>
          <Field label={t('fieldName')}><TextInput value={supplierName} onChange={(event) => setSupplierName(event.target.value)} required /></Field>
          <Field label={t('phone')}><TextInput value={supplierPhone} onChange={(event) => setSupplierPhone(event.target.value)} /></Field>
          <Button type="submit" variant="gold">{t('saveSupplier')}</Button>
        </form>
      </Modal>
      <ConfirmDialog
        open={deleteAllOpen}
        title={t('deleteAllStockInTitle')}
        body={`${rows.length}. ${t('deleteAllStockInBody')}`}
        confirmLabel={t('deleteAllStockIn')}
        cancelLabel={t('suppliersCancel')}
        tone="danger"
        loading={deletingAll}
        onClose={() => setDeleteAllOpen(false)}
        onConfirm={async () => {
          const ids = rows.map((item) => item.id)
          setDeletingAll(true)
          const result = await app.deleteAllRecords('stock_in', ids)
          setDeletingAll(false)
          if (result.ok) setDeleteAllOpen(false)
        }}
      />
      <ConfirmDialog
        open={Boolean(supplierToRemove)}
        title={t('suppliersRemoveTitle')}
        body={supplierToRemove ? `${supplierToRemove.name}. ${t('suppliersRemoveBody')}` : ''}
        confirmLabel={t('suppliersRemove')}
        cancelLabel={t('suppliersCancel')}
        tone="danger"
        loading={removingBusy}
        onClose={() => setRemoving('')}
        onConfirm={async () => {
          if (!supplierToRemove) return
          setRemovingBusy(true)
          const result = await app.removeSupplier(supplierToRemove.id)
          setRemovingBusy(false)
          if (result.ok) setRemoving('')
        }}
      />
    </div>
  )
}
