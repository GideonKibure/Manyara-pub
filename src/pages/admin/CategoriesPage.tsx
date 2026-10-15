import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { Checkbox, Field, TextArea, TextInput } from '@/components/ui/Fields'
import { PageHeader } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import { categorySchema, type CategoryValues } from '@/schemas'
import type { Category } from '@/types'

export function CategoriesPage() {
  const { categories, products } = useApp()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
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
        emptyTitle="No categories"
        columns={[
          { key: 'name', header: 'Name', sortValue: (row) => row.name, render: (row) => row.name },
          { key: 'description', header: 'Description', className: 'hidden md:table-cell', render: (row) => row.description || '—' },
          { key: 'products', header: 'Products', render: (row) => products.filter((product) => product.categoryId === row.id).length },
          { key: 'status', header: 'Status', render: (row) => <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${row.isActive ? 'bg-emerald-100 text-emerald-950' : 'bg-stone-200 text-stone-700'}`}>{row.isActive ? 'Active' : 'Inactive'}</span> },
          { key: 'actions', header: '', render: (row) => <Button size="sm" variant="secondary" onClick={() => { setEditing(row); setOpen(true) }}>Edit</Button> },
        ]}
      />
      {open && <CategoryDialog category={editing} onClose={() => setOpen(false)} />}
    </div>
  )
}

function CategoryDialog({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const { addCategory, editCategory } = useApp()
  const form = useForm<CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: category ?? { name: '', description: '', isActive: true },
  })
  return (
    <Modal open title={category ? 'Edit category' : 'Add category'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          const result = category ? await editCategory(category.id, values) : await addCategory(values)
          if (result.ok) onClose()
        })}
      >
        <Field label="Name" error={form.formState.errors.name?.message}>
          <TextInput {...form.register('name')} />
        </Field>
        <Field label="Description" error={form.formState.errors.description?.message}>
          <TextArea {...form.register('description')} />
        </Field>
        <Checkbox label="Active" {...form.register('isActive')} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="gold" loading={form.formState.isSubmitting}>Save</Button>
        </div>
      </form>
    </Modal>
  )
}
