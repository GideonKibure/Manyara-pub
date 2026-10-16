import { useMemo, useState } from 'react'
import { ProductName, ProductPicker, ProductThumb } from '@/components/ProductPicker'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { Field, NumberInput, SelectInput, TextArea, TextInput } from '@/components/ui/Fields'
import { PageHeader, Panel, StockBadge } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import { formatDateTime } from '@/utils/dates'

export function InventoryPage() {
  const app = useApp()
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [productId, setProductId] = useState(app.products[0]?.id ?? '')
  const [open, setOpen] = useState(false)
  const rows = useMemo(
    () => app.products.filter((product) => product.name.toLowerCase().includes(query.trim().toLowerCase())),
    [app.products, query],
  )
  const movements = app.movements.filter((movement) => movement.productId === productId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const snap = app.snapshots.find((item) => item.productId === productId)

  return (
    <div>
      <PageHeader title={t('pageInventory')} description={t('pageInventoryBody')} actions={<Button variant="gold" onClick={() => setOpen(true)}>{t('pageAdjust')}</Button>} />
      <TextInput className="mb-4" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('searchProducts')} aria-label={t('searchProducts')} />
      <DataTable
        rows={rows}
        getRowId={(row) => row.id}
        resetKey={query}
        emptyTitle={t('reportNoProducts')}
        columns={[
          { key: 'name', header: t('productsProduct'), sortValue: (row) => row.name, render: (row) => <span className="flex items-center gap-2"><ProductThumb src={row.imageUrl} name={row.name} className="h-10 w-10 shrink-0" />{row.name}</span> },
          { key: 'confirmed', header: 'Confirmed', render: (row) => app.snapshots.find((item) => item.productId === row.id)?.confirmed ?? 0 },
          { key: 'reserved', header: 'Reserved', render: (row) => app.snapshots.find((item) => item.productId === row.id)?.reserved ?? 0 },
          { key: 'available', header: 'Available', sortValue: (row) => app.snapshots.find((item) => item.productId === row.id)?.available ?? 0, render: (row) => app.snapshots.find((item) => item.productId === row.id)?.available ?? 0 },
          { key: 'level', header: 'Status', render: (row) => <StockBadge level={app.snapshots.find((item) => item.productId === row.id)?.level ?? 'normal'} /> },
          { key: 'history', header: '', render: (row) => <Button size="sm" variant="secondary" onClick={() => setProductId(row.id)}>History</Button> },
        ]}
      />
      <Panel className="mt-4">
        <h2 className="font-semibold"><ProductName name={app.products.find((item) => item.id === productId)?.name ?? 'Product'} src={app.products.find((item) => item.id === productId)?.imageUrl} /> <span className="font-normal text-stone-500">movement history</span></h2>
        {snap && <p className="mt-1 text-sm text-stone-500">Confirmed {snap.confirmed} · Reserved {snap.reserved} · Available {snap.available}</p>}
        <ul className="mt-4 divide-y divide-line">
          {movements.map((movement) => (
            <li key={movement.id} className="flex items-start justify-between gap-3 py-3 text-sm">
              <div>
                <p className="font-medium capitalize">{movement.type.replace('_', ' ')} · {movement.quantity > 0 ? '+' : ''}{movement.quantity}</p>
                <p className="text-stone-500">{movement.note}</p>
              </div>
              <span className="text-stone-500">{formatDateTime(movement.createdAt)}</span>
            </li>
          ))}
          {!movements.length && <li className="py-4 text-sm text-stone-500">No movements yet.</li>}
        </ul>
      </Panel>
      <AdjustDialog open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

function AdjustDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const { products, adjust, snapshots } = useApp()
  const [search, setSearch] = useState('')
  const [productId, setProductId] = useState(products[0]?.id ?? '')
  const [direction, setDirection] = useState<'in' | 'out'>('out')
  const [quantity, setQuantity] = useState<number | null>(1)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  return (
    <Modal open={open} title={t('pageAdjust')} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault()
          if (quantity == null || quantity < 1) return
          setLoading(true)
          const result = await adjust({ productId, direction, quantity, reason })
          setLoading(false)
          if (result.ok) onClose()
        }}
      >
        <ProductPicker products={products.filter((product) => product.isActive)} selectedId={productId} onSelect={setProductId} query={search} onQuery={setSearch} snapshots={snapshots} canSeeStock />
        <Field label={t('fieldDirection')}>
          <SelectInput value={direction} onChange={(event) => setDirection(event.target.value as 'in' | 'out')}>
            <option value="out">{t('removeStock')}</option>
            <option value="in">{t('addStock')}</option>
          </SelectInput>
        </Field>
        <Field label={t('fieldQuantity')}><NumberInput value={quantity} onValueChange={setQuantity} /></Field>
        <Field label={t('fieldReason')}><TextArea value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
        <p className="text-sm text-stone-500">{t('adjustPermanent')}</p>
        <Button type="submit" variant="gold" loading={loading}>{t('recordAdjustment')}</Button>
      </form>
    </Modal>
  )
}
