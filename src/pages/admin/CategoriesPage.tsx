import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { Checkbox, Field, TextArea, TextInput } from '@/components/ui/Fields'
import { PageHeader } from '@/components/ui/Feedback'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import { categorySchema, type CategoryValues } from '@/schemas'
import type { Category } from '@/types'

export function CategoriesPage() {
  const { categories, products, removeCategory } = useApp()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [removing, setRemoving] = useState<Category | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <div>
      <PageHeader
        title={t('pageCategories')}
        description={t('pageCategoriesBody')}
        actions={<Button variant="gold" onClick={() => { setEditing(null); setOpen(true) }}>{t('pageAddCategory')}</Button>}
      />
      <DataTable
        rows={categories}
        getRowId={(row) => row.id}
        emptyTitle={t('emptyCategories')}
        columns={[
          { key: 'name', header: t('fieldName'), sortValue: (row) => row.name, render: (row) => row.name },
          { key: 'description', header: t('fieldDescription'), className: 'hidden md:table-cell', render: (row) => row.description || '—' },
          { key: 'products', header: t('navProducts'), render: (row) => products.filter((product) => product.categoryId === row.id).length },
          { key: 'status', header: t('labelStatus'), render: (row) => <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${row.isActive ? 'bg-emerald-100 text-emerald-950' : 'bg-stone-200 text-stone-700'}`}>{row.isActive ? t('fieldActive') : t('inactive')}</span> },
          {
            key: 'actions',
            header: '',
            render: (row) => (
              <span className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={() => { setEditing(row); setOpen(true) }}>{t('edit')}</Button>
                <Button size="sm" variant="danger" onClick={() => setRemoving(row)}>{t('categoryDelete')}</Button>
              </span>
            ),
          },
        ]}
      />
      {open && <CategoryDialog category={editing} onClose={() => setOpen(false)} />}
      <ConfirmDialog
        open={Boolean(removing)}
        title={t('categoryDeleteTitle')}
        body={removing ? `${removing.name}. ${t('categoryDeleteBody')}` : ''}
        confirmLabel={t('categoryDelete')}
        tone="danger"
        loading={busy}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return
          setBusy(true)
          const result = await removeCategory(removing.id)
          setBusy(false)
          if (result.ok) setRemoving(null)
        }}
      />
    </div>
  )
}

function CategoryDialog({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const { t } = useI18n()
  const { addCategory, editCategory } = useApp()
  const form = useForm<CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: category ?? { name: '', description: '', isActive: true },
  })
  return (
    <Modal open title={category ? t('edit') : t('pageAddCategory')} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          const result = category ? await editCategory(category.id, values) : await addCategory(values)
          if (result.ok) onClose()
        })}
      >
        <Field label={t('fieldName')} error={form.formState.errors.name?.message}>
          <TextInput {...form.register('name')} />
        </Field>
        <Field label={t('fieldDescription')} error={form.formState.errors.description?.message}>
          <TextArea {...form.register('description')} />
        </Field>
        <Checkbox label={t('fieldActive')} {...form.register('isActive')} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit" variant="gold" loading={form.formState.isSubmitting}>{t('save')}</Button>
        </div>
      </form>
    </Modal>
  )
}
