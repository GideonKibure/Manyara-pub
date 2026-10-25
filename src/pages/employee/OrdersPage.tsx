import { useMemo, useState } from 'react'
import { Check, Clock, PackagePlus, Save, Search, X } from 'lucide-react'
import { ProductThumb } from '@/components/ProductPicker'
import { Button } from '@/components/ui/Button'
import { ChainScroll } from '@/components/ui/ChainScroll'
import { NumberInput, TextArea } from '@/components/ui/Fields'
import { PageHeader, StockBadge } from '@/components/ui/Feedback'
import { stockQtyFromReceived } from '@/features/inventory/stock'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { Product, RestockOrder } from '@/types'
import { sizeCost } from '@/features/products/offer'
import { formatDateTime } from '@/utils/dates'
import { roundBuyingPrice } from '@/utils/money'
import { cn } from '@/utils/cn'

function formatQty(value: number) {
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

function stockRank(level?: string) {
  if (level === 'low') return 0
  if (level === 'out') return 1
  return 2
}

export function OrdersPage() {
  const app = useApp()
  const { t } = useI18n()
  const [tab, setTab] = useState<'write' | 'saved'>('write')
  const [needle, setNeedle] = useState('')
  const [notes, setNotes] = useState('')
  const [qty, setQty] = useState<Record<string, number | null>>({})
  const [extraIds, setExtraIds] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [statusBusy, setStatusBusy] = useState('')
  const [filter, setFilter] = useState<'all' | 'not_received' | 'received'>('all')

  const active = app.products.filter((product) => product.isActive)
  const snapOf = (id: string) => app.snapshots.find((item) => item.productId === id)
  const ranked = useMemo(
    () =>
      active
        .map((product) => ({ product, snap: snapOf(product.id) }))
        .sort((a, b) => {
          const rank = stockRank(a.snap?.level) - stockRank(b.snap?.level)
          if (rank) return rank
          return a.product.name.localeCompare(b.product.name)
        }),
    [active, app.snapshots],
  )
  const needed = ranked.filter(({ snap }) => snap?.level === 'low' || snap?.level === 'out')
  const extras = extraIds
    .map((id) => active.find((product) => product.id === id))
    .filter((product): product is Product => {
      if (!product) return false
      const level = snapOf(product.id)?.level
      return level !== 'low' && level !== 'out'
    })
  const query = needle.trim().toLowerCase()
  const visible = useMemo(() => {
    if (query) {
      return ranked
        .filter(({ product }) => `${product.name} ${product.sku}`.toLowerCase().includes(query))
        .map(({ product }) => product)
    }
    const priority = needed.map(({ product }) => product)
    const rest = extras.filter((product) => !priority.some((item) => item.id === product.id))
    return [...priority, ...rest]
  }, [query, ranked, needed, extras])
  const draftItems = Object.entries(qty)
    .filter(([, value]) => value != null && value > 0)
    .map(([productId, receivedQuantity]) => ({ productId, receivedQuantity: receivedQuantity as number }))
  const mineAll = useMemo(
    () =>
      (app.restockOrders ?? [])
        .filter((order) => app.user?.role === 'admin' || order.submittedBy === app.user?.id)
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    [app.restockOrders, app.user?.id, app.user?.role],
  )
  const waiting = mineAll.filter((order) => order.status !== 'received')
  const received = mineAll.filter((order) => order.status === 'received')
  const mine = mineAll.filter((order) =>
    filter === 'all' ? true : filter === 'received' ? order.status === 'received' : order.status !== 'received',
  )
  const editingCode = app.restockOrders.find((item) => item.id === editingId)?.code

  function unitName(id?: string) {
    return app.units.find((unit) => unit.id === id)?.abbreviation ?? ''
  }

  function setProductQty(id: string, value: number | null) {
    const next = value != null && value > 0 ? Math.round(value * 100) / 100 : null
    setQty((current) => ({ ...current, [id]: next }))
    const level = snapOf(id)?.level
    if (level === 'low' || level === 'out') return
    setExtraIds((current) => {
      if (next) return current.includes(id) ? current : [...current, id]
      return current.filter((item) => item !== id)
    })
  }

  function nudge(id: string, delta: number) {
    const next = Math.max(0, Math.round(((qty[id] ?? 0) + delta) * 100) / 100)
    setProductQty(id, next || null)
  }

  function canEditOrder(order: RestockOrder) {
    return !order.receivedEditUsed
  }

  function loadOrder(order: RestockOrder) {
    if (!canEditOrder(order)) return
    setEditingId(order.id)
    setNotes(order.notes)
    setQty(Object.fromEntries(order.items.map((item) => [item.productId, item.receivedQuantity])))
    setExtraIds(order.items.map((item) => item.productId).filter((id) => !needed.some((row) => row.product.id === id)))
    setTab('write')
  }

  function statusLabel(status: RestockOrder['status']) {
    if (status === 'received') return t('orderReceived')
    if (status === 'partial') return t('orderPartial')
    return t('orderNotReceived')
  }

  function clearDraft() {
    setEditingId(null)
    setNotes('')
    setQty({})
    setExtraIds([])
  }

  async function save() {
    setSaving(true)
    const result = await app.saveRestockOrder({ id: editingId ?? undefined, notes, items: draftItems })
    setSaving(false)
    if (result.ok) {
      clearDraft()
      setTab('saved')
    }
  }

  return (
    <div className="order-page pb-24 md:pb-8">
      <PageHeader title={t('pageOrders')} description={t('pageOrdersBody')} />

      <div className="order-kpis mb-4">
        <article className="order-kpi">
          <p>{t('orderNeed')}</p>
          <strong className={needed.length ? 'text-rose-800' : 'text-ink'}>{needed.length}</strong>
        </article>
        <article className="order-kpi">
          <p>{t('orderDraft')}</p>
          <strong className={draftItems.length ? 'text-amber-800' : 'text-ink'}>{draftItems.length}</strong>
        </article>
        <article className="order-kpi">
          <p>{t('orderWaiting')}</p>
          <strong className={waiting.length ? 'text-amber-800' : 'text-ink'}>{waiting.length}</strong>
        </article>
      </div>

      <div className="order-tabs sticky z-10 mb-4 backdrop-blur-md" style={{ top: 'calc(var(--app-header, 3.75rem) + 0.35rem)' }}>
        <button type="button" className={cn('order-tab', tab === 'write' && 'on')} onClick={() => setTab('write')}>
          {t('orderWrite')}
        </button>
        <button type="button" className={cn('order-tab', tab === 'saved' && 'on')} onClick={() => setTab('saved')}>
          {t('orderSaved')}
          {waiting.length ? ` · ${waiting.length}` : ''}
        </button>
      </div>

      {tab === 'write' && (
        <div className="space-y-3">
          {editingId && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
              <span className="min-w-0 truncate font-semibold">
                {t('orderEditing')} {editingCode}
                {app.restockOrders.find((item) => item.id === editingId)?.items.some((item) => item.received) ? ` · ${t('orderEditOnceHint')}` : ''}
              </span>
              <button type="button" className="shrink-0 font-semibold underline" onClick={clearDraft}>{t('orderNew')}</button>
            </div>
          )}

          <section className="order-screen">
            <div className="border-b border-amber-100/80 px-3 py-2">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 shrink-0 text-stone-400" />
                <input
                  value={needle}
                  onChange={(event) => setNeedle(event.target.value)}
                  placeholder={t('orderSearch')}
                  className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-stone-400"
                />
                {needle && (
                  <button type="button" className="grid h-8 w-8 place-items-center rounded-full bg-stone-100 text-stone-600" onClick={() => setNeedle('')} aria-label={t('closeMenu')}>
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-stone-500">{t('orderSearchHint')}</p>
            </div>
            <ChainScroll className="order-grid min-h-0 flex-1 overflow-y-auto">
              {visible.map((product) => {
                const snap = snapOf(product.id)
                const level = snap?.level ?? 'out'
                const conversion = product.conversionFactor
                const ordered = qty[product.id]
                const add = ordered && ordered > 0 ? stockQtyFromReceived(ordered, conversion) : 0
                const extra = extras.some((item) => item.id === product.id)
                return (
                  <article key={product.id} className={cn('order-card', add > 0 && 'on')}>
                    <ProductThumb src={product.imageUrl} name={product.name} className="h-14 w-14 shrink-0 rounded-2xl sm:h-16 sm:w-16" />
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="min-w-0 truncate text-[15px] font-semibold leading-5 text-ink">{product.name}</h2>
                        <div className="flex shrink-0 items-center gap-1">
                          <StockBadge level={level} />
                          {extra && !query && (
                            <button
                              type="button"
                              className="grid h-8 w-8 place-items-center rounded-full bg-stone-100 text-stone-600"
                              onClick={() => {
                                setExtraIds((current) => current.filter((id) => id !== product.id))
                                setQty((current) => ({ ...current, [product.id]: null }))
                              }}
                              aria-label={t('orderRemove')}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="mt-1 text-[11px] leading-4 text-stone-500">
                        {t('orderOnHand')} {formatQty(snap?.available ?? 0)} {unitName(product.stockUnitId)}
                        {conversion > 1 ? ` · 1 ${unitName(product.receiveUnitId)} = ${conversion} ${unitName(product.stockUnitId)}` : ''}
                        {` · ${t('productsCost')} ${app.money(roundBuyingPrice(sizeCost(product)))}`}
                      </p>
                      <div className="order-qty mt-2.5">
                        <button type="button" onClick={() => nudge(product.id, -1)} aria-label="-">−</button>
                        <NumberInput
                          allowDecimal
                          decimalPlaces={2}
                          value={ordered ?? null}
                          onValueChange={(value) => setProductQty(product.id, value)}
                          className="h-11 rounded-[0.9rem] border-amber-200/80 bg-white text-center text-lg font-semibold"
                        />
                        <button type="button" onClick={() => nudge(product.id, 1)} aria-label="+">+</button>
                      </div>
                      {add > 0 && (
                        <p className="mt-1.5 text-xs font-semibold text-emerald-800">
                          {t('orderAdds')} +{formatQty(add)} {unitName(product.stockUnitId)}
                        </p>
                      )}
                    </div>
                  </article>
                )
              })}
              {!visible.length && (
                <div className="col-span-full rounded-2xl border border-dashed border-stone-200 bg-white/50 px-4 py-10 text-center text-sm text-stone-500">
                  {needle ? t('pickerEmpty') : t('orderEmptyNeed')}
                </div>
              )}
            </ChainScroll>
          </section>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{t('expenseNotes')}</span>
            <TextArea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className="rounded-2xl" />
          </label>
        </div>
      )}

      {tab === 'saved' && (
        <div className="space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {([
              ['all', t('dashAll'), mineAll.length],
              ['not_received', t('orderNotReceived'), waiting.length],
              ['received', t('orderReceived'), received.length],
            ] as const).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                className={cn(
                  'shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold',
                  filter === id ? 'bg-charcoal text-white' : 'bg-white/80 text-ink',
                )}
                onClick={() => setFilter(id)}
              >
                {label} · {count}
              </button>
            ))}
          </div>
          <div className="order-saved">
            {mine.map((order) => {
              const pending = order.items.filter((item) => !item.received)
              const canEdit = canEditOrder(order)
              return (
              <article key={order.id} className="order-saved-card flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{order.code}</p>
                    <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-ink">
                      <Clock className="h-3.5 w-3.5 shrink-0 text-amber-800" />
                      <span>
                        {t('orderSavedAt')} · {formatDateTime(order.submittedAt)}
                      </span>
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
                      order.status === 'received'
                        ? 'bg-emerald-100 text-emerald-950'
                        : order.status === 'partial'
                          ? 'bg-sky-100 text-sky-950'
                          : 'bg-amber-100 text-amber-950',
                    )}
                  >
                    {statusLabel(order.status)}
                  </span>
                </div>
                <ul className="mt-3 space-y-2">
                  {order.items.map((item) => {
                    const product = app.products.find((row) => row.id === item.productId)
                    const busy = statusBusy === `${order.id}:${item.id}`
                    return (
                      <li key={item.id} className={cn('order-saved-line', item.received && 'is-received')}>
                        <ProductThumb src={product?.imageUrl} name={product?.name ?? t('productsProduct')} className="h-10 w-10 shrink-0 rounded-xl" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{product?.name ?? t('productsProduct')}</p>
                          <p className="mt-0.5 text-xs tabular-nums text-stone-600">
                            {formatQty(item.receivedQuantity)} {unitName(item.receiveUnitId)}
                            <span className="text-emerald-800"> · +{formatQty(item.stockQuantity)} {unitName(product?.stockUnitId)}</span>
                          </p>
                        </div>
                        {item.received ? (
                          <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-950">
                            {t('orderItemReceived')}
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="gold"
                            className="h-9 shrink-0 px-2.5 text-xs"
                            loading={busy}
                            onClick={async () => {
                              setStatusBusy(`${order.id}:${item.id}`)
                              await app.setRestockItemStatus(order.id, item.id, true)
                              setStatusBusy('')
                            }}
                          >
                            <Check className="h-3.5 w-3.5" />
                            {t('orderMarkReceived')}
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
                {order.notes ? <p className="mt-3 text-sm text-stone-500">{order.notes}</p> : null}
                {order.receivedEditUsed ? <p className="mt-2 text-xs font-medium text-stone-500">{t('orderEditUsed')}</p> : null}
                <div className="mt-auto grid grid-cols-1 gap-2 pt-3 sm:grid-cols-2">
                  {canEdit && (
                    <Button size="sm" variant="secondary" className="min-h-11 w-full" onClick={() => loadOrder(order)}>
                      {t('orderEdit')}
                    </Button>
                  )}
                  {pending.length > 0 && (
                    <Button
                      size="sm"
                      variant="gold"
                      className={cn('min-h-11 w-full', !canEdit && 'sm:col-span-2')}
                      loading={statusBusy === `${order.id}:all`}
                      onClick={async () => {
                        setStatusBusy(`${order.id}:all`)
                        await app.setRestockOrderStatus(order.id, 'received')
                        setStatusBusy('')
                      }}
                    >
                      <PackagePlus className="h-4 w-4" />
                      {t('orderMarkAllReceived')}
                    </Button>
                  )}
                </div>
              </article>
              )
            })}
          </div>
          {!mine.length && (
            <div className="rounded-[1.5rem] border border-dashed border-stone-300 bg-white/60 px-5 py-12 text-center">
              <PackagePlus className="mx-auto h-8 w-8 text-stone-400" />
              <p className="mt-3 text-sm text-stone-500">{t('pageOrdersEmpty')}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'write' && (
        <div className="cogs-dock">
          <div className="cogs-dock-inner pointer-events-auto w-full max-w-lg rounded-[1.2rem] border border-white/55 bg-stone-950/90 p-1.5 shadow-[0_14px_32px_rgba(28,25,23,0.28)] backdrop-blur-xl sm:ml-auto">
            <Button
              variant="gold"
              className="cogs-dock-btn cogs-dock-btn-save w-full"
              loading={saving}
              disabled={!draftItems.length}
              onClick={() => void save()}
            >
              <Save className="h-4 w-4" />
              {t('orderSave')}
              {draftItems.length ? ` · ${draftItems.length}` : ''}
            </Button>
          </div>
        </div>
      )}

    </div>
  )
}
