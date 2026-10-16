import { createClient } from '@supabase/supabase-js'
import {
  activityTypeSchema,
  categorySchema,
  employeeSchema,
  passwordSchema,
  productSchema,
  profileSchema,
  settingsSchema,
  supplierSchema,
  unitSchema,
} from '@/schemas'
import { ensureProduct } from '@/features/products/offer'
import { clearSupabaseAuthStorage, supabase, supabaseAnonKey, supabaseUrl } from '@/lib/supabase'
import {
  adjustInventory,
  approveActivity,
  approveExpense,
  approveSale,
  settleBillLoss,
  approveStockIn,
  cancelSubmission,
  emailForLogin,
  recordAudit,
  rejectActivity,
  rejectExpense,
  rejectSale,
  rejectStockIn,
  removeSupplier,
  staffDirectory,
  submitActivity,
  submitExpense,
  setBillPayment,
  recordBillPayment,
  appendBillItem,
  submitSale,
  submitRemainingCount as submitRemainingCountRemoteRpc,
  submitStockIn,
  updateSale,
  updateStockIn,
} from '@/services/supabase/rpc'
import type {
  ActionResult,
  ActivityDraft,
  ActivityTransaction,
  ExpenseDraft,
  ExpenseTransaction,
  ActivityType,
  AdjustmentDraft,
  AppNotification,
  Database,
  EmployeeDraft,
  InventoryMovement,
  NotifyChannel,
  Product,
  ProductDraft,
  Profile,
  SaleDraft,
  SalesTransaction,
  StockInDraft,
  StockInTransaction,
} from '@/types'

type Row = Record<string, unknown>

function fail(error: string): ActionResult {
  return { ok: false, error }
}

function missingRelation(error: { message?: string } | null) {
  return Boolean(error && /schema cache|does not exist|Could not find the table/i.test(error.message ?? ''))
}

export function errorText(error: { message?: string } | null, fallback = 'Something went wrong.') {
  const raw = error?.message?.trim()
  if (!raw) return fallback
  if (/schema cache|does not exist|Could not find the function|relation .* does not exist/i.test(raw)) {
    return 'The Supabase project is missing a Manyara Pub table or function. Run supabase/migrations/001_initial.sql if this is a new project, then paste and run 023_live_catchup.sql through 027_remaining_report_notice.sql in the SQL editor.'
  }
  if (/duplicate key/i.test(raw) && /username/i.test(raw)) return 'That username is already in use.'
  if (/duplicate key/i.test(raw) && /email/i.test(raw)) return 'That email address is already in use.'
  if (/duplicate key/i.test(raw) && /products_name/i.test(raw)) return 'A product with that name already exists.'
  if (/duplicate key/i.test(raw) && /sku/i.test(raw)) return 'That SKU is already in use.'
  if (/User already registered/i.test(raw)) return 'That email address is already in use.'
  if (/Invalid login credentials/i.test(raw)) return 'Email, username, or password is incorrect.'
  return raw
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

function str(row: Row, key: string, fallback = '') {
  const value = row[key]
  return typeof value === 'string' ? value : fallback
}

function num(row: Row, key: string) {
  const value = row[key]
  return typeof value === 'number' ? value : Number(value ?? 0)
}

function bool(row: Row, key: string) {
  return row[key] === true
}

function optional(row: Row, key: string) {
  const value = row[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function optionalNum(row: Row, key: string) {
  const value = row[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function channels(value: unknown): NotifyChannel[] {
  const list = Array.isArray(value) ? value : ['in_app']
  return list.filter((item): item is NotifyChannel => item === 'in_app' || item === 'email' || item === 'whatsapp')
}

function rowsOf(data: unknown): Row[] {
  return Array.isArray(data) ? (data as Row[]) : []
}

export function blankDatabase(): Database {
  return {
    version: 1,
    accounts: [],
    resetTokens: [],
    profiles: [],
    categories: [],
    units: [],
    products: [],
    suppliers: [],
    stockIns: [],
    sales: [],
    movements: [],
    activityTypes: [],
    activities: [],
    expenses: [],
    notifications: [],
    auditLogs: [],
    settings: {
      businessName: 'Manyara Pub',
      currency: 'TZS',
      currencySymbol: 'TSh',
      lowStockAlerts: true,
      allowRemainingCount: false,
      updatedAt: new Date().toISOString(),
    },
    counters: { stockIn: 0, sale: 0, activity: 0, expense: 0, adjustment: 0 },
  }
}

function mapProfile(row: Row): Profile {
  return {
    id: str(row, 'id'),
    fullName: str(row, 'full_name'),
    username: str(row, 'username'),
    email: str(row, 'email'),
    phone: str(row, 'phone'),
    role: str(row, 'role') === 'admin' ? 'admin' : 'employee',
    isActive: bool(row, 'is_active'),
    canSubmitActivities: bool(row, 'can_submit_activities'),
    canViewStock: bool(row, 'can_view_stock'),
    createdAt: str(row, 'created_at'),
    updatedAt: str(row, 'updated_at'),
    lastLoginAt: optional(row, 'last_login_at'),
    imageUrl: optional(row, 'avatar_url'),
  }
}

function nullableMoney(value: unknown) {
  if (value == null || value === '') return null
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(number) && number >= 0 ? number : null
}

function mapSizes(value: unknown): Product['sizes'] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Row
    const name = str(row, 'name')
    if (name !== 'small' && name !== 'medium' && name !== 'big') return []
    return [{ name, cost: row.cost == null || row.cost === '' ? Number.NaN : num(row, 'cost'), price: num(row, 'price'), cupPrice: nullableMoney(row.cupPrice), halfPrice: nullableMoney(row.halfPrice) }]
  })
}

function mapProduct(row: Row): Product {
  return ensureProduct({
    id: str(row, 'id'),
    name: str(row, 'name'),
    categoryId: str(row, 'category_id'),
    imageUrl: optional(row, 'image_url'),
    sku: str(row, 'sku'),
    stockUnitId: str(row, 'stock_unit_id'),
    receiveUnitId: str(row, 'receive_unit_id'),
    conversionFactor: num(row, 'conversion_factor'),
    costPrice: num(row, 'cost_price'),
    sellingPrice: num(row, 'selling_price'),
    sizeMode: str(row, 'size_mode') === 'many' ? 'many' : 'one',
    sizes: mapSizes(row.sizes),
    cupPrice: nullableMoney(row.cup_price),
    halfPrice: nullableMoney(row.half_price),
    minStock: num(row, 'min_stock'),
    isActive: bool(row, 'is_active'),
    createdAt: str(row, 'created_at'),
    updatedAt: str(row, 'updated_at'),
  })
}

async function audit(action: string, entityType: string, entityId: string, summary: string) {
  await recordAudit(action, entityType, entityId, summary)
}

export async function loadWorkspace(): Promise<{ ok: true; db: Database } | { ok: false; error: string }> {
  const dbClient = client()
  await dbClient.rpc('notify_overdue_bills')
  const [
    profiles,
    categories,
    units,
    products,
    suppliers,
    stockIns,
    stockItems,
    sales,
    saleItems,
    movements,
    activityTypes,
    activities,
    expenses,
    notifications,
    auditLogs,
    settings,
    directory,
  ] = await Promise.all([
    dbClient.from('profiles').select('*'),
    dbClient.from('categories').select('*'),
    dbClient.from('units').select('*'),
    dbClient.from('products').select('*'),
    dbClient.from('suppliers').select('*'),
    dbClient.from('stock_in_transactions').select('*'),
    dbClient.from('stock_in_items').select('*'),
    dbClient.from('sales_transactions').select('*'),
    dbClient.from('sales_items').select('*'),
    dbClient.from('inventory_movements').select('*'),
    dbClient.from('activity_types').select('*'),
    dbClient.from('activity_transactions').select('*'),
    dbClient.from('expenses').select('*'),
    dbClient.from('notifications').select('*'),
    dbClient.from('audit_logs').select('*'),
    dbClient.from('business_settings').select('*').eq('id', 1).maybeSingle(),
    staffDirectory(),
  ])

  const firstError = [
    profiles.error,
    categories.error,
    units.error,
    products.error,
    suppliers.error,
    stockIns.error,
    stockItems.error,
    sales.error,
    saleItems.error,
    movements.error,
    activityTypes.error,
    activities.error,
    missingRelation(expenses.error) ? null : expenses.error,
    notifications.error,
    auditLogs.error,
    settings.error,
    directory.error,
  ].find(Boolean)
  if (firstError) return { ok: false, error: errorText(firstError) }

  const stockItemRows = rowsOf(stockItems.data)
  const saleItemRows = rowsOf(saleItems.data)
  const mappedProfiles = rowsOf(profiles.data).map(mapProfile)
  const known = new Set(mappedProfiles.map((profile) => profile.id))
  for (const entry of rowsOf(directory.data)) {
    const id = str(entry, 'id')
    if (!id || known.has(id)) continue
    mappedProfiles.push({
      id,
      fullName: str(entry, 'full_name'),
      username: '',
      email: '',
      phone: '',
      role: 'employee',
      isActive: true,
      canSubmitActivities: false,
      canViewStock: true,
      createdAt: '',
      updatedAt: '',
    })
  }

  const stockTransactions: StockInTransaction[] = rowsOf(stockIns.data).map((row) => ({
    id: str(row, 'id'),
    code: str(row, 'code'),
    supplierId: str(row, 'supplier_id'),
    supplierName: str(row, 'supplier_name'),
    deliveryDate: str(row, 'delivery_date'),
    invoiceRef: str(row, 'invoice_ref'),
    notes: str(row, 'notes'),
    status: str(row, 'status') as StockInTransaction['status'],
    submittedBy: str(row, 'submitted_by'),
    submittedAt: str(row, 'submitted_at'),
    reviewedBy: optional(row, 'reviewed_by'),
    reviewedAt: optional(row, 'reviewed_at'),
    rejectionReason: optional(row, 'rejection_reason'),
    correctsId: optional(row, 'corrects_id'),
    items: stockItemRows
      .filter((item) => str(item, 'transaction_id') === str(row, 'id'))
      .map((item) => ({
        id: str(item, 'id'),
        productId: str(item, 'product_id'),
        sizeName: str(item, 'size_name') === 'small' || str(item, 'size_name') === 'medium' || str(item, 'size_name') === 'big' ? str(item, 'size_name') as 'small' | 'medium' | 'big' : 'one',
        receivedQuantity: num(item, 'received_quantity'),
        receiveUnitId: str(item, 'receive_unit_id'),
        conversionFactor: num(item, 'conversion_factor'),
        stockQuantity: num(item, 'stock_quantity'),
        costPerStockUnit: num(item, 'cost_per_stock_unit'),
        totalCost: num(item, 'total_cost'),
      })),
  }))

  const saleTransactions: SalesTransaction[] = rowsOf(sales.data).map((row) => ({
    id: str(row, 'id'),
    code: str(row, 'code'),
    customerName: str(row, 'customer_name'),
    paymentStatus: str(row, 'payment_status') === 'paid' ? 'paid' : 'unpaid',
    recordKind: str(row, 'record_kind') === 'bill' ? 'bill' : 'sale',
    generatedAt: optional(row, 'generated_at') || str(row, 'submitted_at'),
    notes: str(row, 'notes'),
    status: str(row, 'status') as SalesTransaction['status'],
    submittedBy: str(row, 'submitted_by'),
    submittedAt: str(row, 'submitted_at'),
    reviewedBy: optional(row, 'reviewed_by'),
    reviewedAt: optional(row, 'reviewed_at'),
    rejectionReason: optional(row, 'rejection_reason'),
    correctsId: optional(row, 'corrects_id'),
    isLoss: bool(row, 'is_loss'),
    amountPaid: num(row, 'amount_paid'),
    settledAmount: optionalNum(row, 'settled_amount'),
    sourceBillId: optional(row, 'source_bill_id'),
    items: saleItemRows
      .filter((item) => str(item, 'transaction_id') === str(row, 'id'))
      .map((item) => ({
        id: str(item, 'id'),
        productId: str(item, 'product_id'),
        quantity: num(item, 'quantity'),
        unitPrice: num(item, 'unit_price'),
        unitCost: num(item, 'unit_cost'),
        sizeName: str(item, 'size_name') === 'small' || str(item, 'size_name') === 'medium' || str(item, 'size_name') === 'big' ? str(item, 'size_name') as 'small' | 'medium' | 'big' : 'one',
        portion: str(item, 'portion') === 'cup' || str(item, 'portion') === 'half' ? str(item, 'portion') as 'cup' | 'half' : 'full',
      })),
  }))

  const settingsRow = (settings.data ?? null) as Row | null
  const levels = await dbClient.rpc('current_stock')
  const availability = !levels.error && Array.isArray(levels.data)
    ? (levels.data as Row[]).map((row) => ({
        productId: str(row, 'product_id'),
        confirmed: num(row, 'confirmed_qty'),
        reserved: num(row, 'reserved_qty'),
        available: num(row, 'available_qty'),
      }))
    : undefined
  const base = blankDatabase()
  return {
    ok: true,
    db: {
      ...base,
      profiles: mappedProfiles,
      categories: rowsOf(categories.data).map((row) => ({
        id: str(row, 'id'),
        name: str(row, 'name'),
        description: str(row, 'description'),
        isActive: bool(row, 'is_active'),
        createdAt: str(row, 'created_at'),
        updatedAt: str(row, 'updated_at'),
      })),
      units: rowsOf(units.data).map((row) => ({ id: str(row, 'id'), name: str(row, 'name'), abbreviation: str(row, 'abbreviation') })),
      products: rowsOf(products.data).map(mapProduct),
      suppliers: rowsOf(suppliers.data).map((row) => ({
        id: str(row, 'id'),
        name: str(row, 'name'),
        phone: str(row, 'phone'),
        isActive: bool(row, 'is_active'),
        createdAt: str(row, 'created_at'),
      })),
      stockIns: stockTransactions.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
      sales: saleTransactions.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
      availability,
      movements: rowsOf(movements.data).map(
        (row): InventoryMovement => ({
          id: str(row, 'id'),
          productId: str(row, 'product_id'),
          type: str(row, 'type') as InventoryMovement['type'],
          quantity: num(row, 'quantity'),
          unitCost: num(row, 'unit_cost'),
          referenceType: str(row, 'reference_type') as InventoryMovement['referenceType'],
          referenceId: str(row, 'reference_id'),
          note: str(row, 'note'),
          createdBy: str(row, 'created_by'),
          createdAt: str(row, 'created_at'),
        }),
      ),
      activityTypes: rowsOf(activityTypes.data).map(
        (row): ActivityType => ({
          id: str(row, 'id'),
          name: str(row, 'name'),
          code: str(row, 'code') === 'korokoro' ? 'korokoro' : 'pool_table',
          pricingMode: str(row, 'pricing_mode') as ActivityType['pricingMode'],
          unitPrice: num(row, 'unit_price'),
          unitLabel: str(row, 'unit_label'),
          isActive: bool(row, 'is_active'),
          updatedAt: str(row, 'updated_at'),
        }),
      ),
      activities: rowsOf(activities.data)
        .map(
          (row): ActivityTransaction => ({
            id: str(row, 'id'),
            code: str(row, 'code'),
            activityTypeId: str(row, 'activity_type_id'),
            quantity: num(row, 'quantity'),
            unitPrice: num(row, 'unit_price'),
            amount: num(row, 'amount'),
            paymentMethod: str(row, 'payment_method') as ActivityTransaction['paymentMethod'],
            notes: str(row, 'notes'),
            occurredAt: str(row, 'occurred_at'),
            status: str(row, 'status') as ActivityTransaction['status'],
            submittedBy: str(row, 'submitted_by'),
            submittedAt: str(row, 'submitted_at'),
            reviewedBy: optional(row, 'reviewed_by'),
            reviewedAt: optional(row, 'reviewed_at'),
            rejectionReason: optional(row, 'rejection_reason'),
            correctsId: optional(row, 'corrects_id'),
          }),
        )
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
      expenses: missingRelation(expenses.error)
        ? []
        : rowsOf(expenses.data)
            .map(
              (row): ExpenseTransaction => ({
                id: str(row, 'id'),
                code: str(row, 'code'),
                description: str(row, 'description'),
                amount: num(row, 'amount'),
                spentOn: str(row, 'spent_on').slice(0, 10),
                notes: str(row, 'notes'),
                status: str(row, 'status') as ExpenseTransaction['status'],
                submittedBy: str(row, 'submitted_by'),
                submittedAt: str(row, 'submitted_at'),
                reviewedBy: optional(row, 'reviewed_by'),
                reviewedAt: optional(row, 'reviewed_at'),
                rejectionReason: optional(row, 'rejection_reason'),
                correctsId: optional(row, 'corrects_id'),
              }),
            )
            .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
      notifications: rowsOf(notifications.data).map(
        (row): AppNotification => ({
          id: str(row, 'id'),
          recipientId: str(row, 'recipient_id'),
          type: str(row, 'type') as AppNotification['type'],
          title: str(row, 'title'),
          message: str(row, 'message'),
          href: str(row, 'href', '/'),
          read: bool(row, 'read'),
          createdAt: str(row, 'created_at'),
          dedupeKey: optional(row, 'dedupe_key'),
          resolvedAt: optional(row, 'resolved_at'),
          channels: channels(row.channels),
        }),
      ),
      auditLogs: rowsOf(auditLogs.data)
        .map((row) => ({
          id: str(row, 'id'),
          actorId: str(row, 'actor_id'),
          action: str(row, 'action'),
          entityType: str(row, 'entity_type'),
          entityId: str(row, 'entity_id'),
          summary: str(row, 'summary'),
          createdAt: str(row, 'created_at'),
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      settings: settingsRow
        ? {
            businessName: str(settingsRow, 'business_name', 'Manyara Pub'),
            currency: str(settingsRow, 'currency', 'TZS'),
            currencySymbol: str(settingsRow, 'currency_symbol', 'TSh'),
            lowStockAlerts: settingsRow.low_stock_alerts !== false,
            allowRemainingCount: settingsRow.allow_remaining_count === true,
            updatedAt: str(settingsRow, 'updated_at'),
          }
        : base.settings,
    },
  }
}

export async function signInRemote(identifier: string, password: string): Promise<ActionResult> {
  const lookup = await emailForLogin(identifier.trim())
  if (lookup.error) return fail(errorText(lookup.error))
  const email = typeof lookup.data === 'string' ? lookup.data : ''
  if (!email) return fail('Email, username, or password is incorrect.')
  const { data, error } = await client().auth.signInWithPassword({ email, password })
  if (error || !data.user) return fail(errorText(error, 'Email, username, or password is incorrect.'))
  const profile = await client().from('profiles').select('role, is_active').eq('id', data.user.id).maybeSingle()
  if (profile.error) return fail(errorText(profile.error))
  if (!profile.data?.is_active) {
    await client().auth.signOut()
    return fail('Your account is not active.')
  }
  await client().from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', data.user.id)
  return { ok: true, message: 'Signed in.', meta: { userId: data.user.id, role: String(profile.data.role) } }
}

export async function signOutRemote() {
  if (!supabase) return
  await supabase.auth.signOut()
  clearSupabaseAuthStorage()
}

export async function requestResetRemote(email: string): Promise<ActionResult> {
  const { error } = await client().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  if (error) return fail(errorText(error))
  return { ok: true, message: 'If that email is registered, a reset link is on its way.' }
}

export async function updatePasswordRemote(password: string): Promise<ActionResult> {
  const parsed = passwordSchema.safeParse(password)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Choose a stronger password.')
  const session = await client().auth.getSession()
  if (!session.data.session) return fail('Open the reset link from your email in this browser, then choose a new password.')
  const { error } = await client().auth.updateUser({ password: parsed.data })
  if (error) return fail(errorText(error))
  await client().auth.signOut()
  return { ok: true, message: 'Password updated. Sign in with the new password.' }
}

export async function changePasswordRemote(email: string, current: string, password: string): Promise<ActionResult> {
  const parsed = passwordSchema.safeParse(password)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Choose a stronger password.')
  const check = await client().auth.signInWithPassword({ email, password: current })
  if (check.error) return fail('The current password is incorrect.')
  const { error } = await client().auth.updateUser({ password: parsed.data })
  if (error) return fail(errorText(error))
  return { ok: true, message: 'Password updated.' }
}

export async function saveProfileRemote(input: { fullName: string; phone: string; imageUrl?: string }): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check your profile.')
  const user = await client().auth.getUser()
  if (!user.data.user) return fail('You are not signed in.')
  const payload: { full_name: string; phone: string; avatar_url?: string | null } = { full_name: parsed.data.fullName, phone: parsed.data.phone }
  if (input.imageUrl !== undefined) payload.avatar_url = input.imageUrl.trim() || null
  const { error } = await client().from('profiles').update(payload).eq('id', user.data.user.id)
  if (error) return fail(errorText(error))
  return { ok: true, message: 'Profile updated.' }
}

export async function saveCategoryRemote(id: string | null, input: { name: string; description: string; isActive: boolean }): Promise<ActionResult> {
  const parsed = categorySchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the category.')
  const payload = { name: parsed.data.name, description: parsed.data.description, is_active: parsed.data.isActive }
  const result = id
    ? await client().from('categories').update(payload).eq('id', id)
    : await client().from('categories').insert(payload).select('id').single()
  if (result.error) return fail(errorText(result.error))
  const entityId = id ?? String((result.data as Row | null)?.id ?? '')
  await audit(id ? 'category.update' : 'category.create', 'category', entityId, `${id ? 'Updated' : 'Created'} category ${parsed.data.name}.`)
  return { ok: true, message: id ? 'Category updated.' : 'Category created.' }
}

export async function saveUnitRemote(input: { name: string; abbreviation: string }): Promise<ActionResult> {
  const parsed = unitSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the unit.')
  const result = await client().from('units').insert({ name: parsed.data.name, abbreviation: parsed.data.abbreviation }).select('id').single()
  if (result.error) return fail(errorText(result.error))
  await audit('unit.create', 'unit', String((result.data as Row).id), `Added unit ${parsed.data.name}.`)
  return { ok: true, message: 'Unit added.' }
}

export async function saveSupplierRemote(input: { name: string; phone: string }): Promise<ActionResult> {
  const parsed = supplierSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the supplier.')
  const result = await client().from('suppliers').insert({ name: parsed.data.name, phone: parsed.data.phone }).select('id').single()
  if (result.error) return fail(errorText(result.error))
  await audit('supplier.create', 'supplier', String((result.data as Row).id), `Added supplier ${parsed.data.name}.`)
  return { ok: true, message: 'Supplier added.' }
}

export async function removeSupplierRemote(id: string): Promise<ActionResult> {
  const result = await removeSupplier(id)
  if (result.error) return fail(errorText(result.error))
  return { ok: true, message: 'Supplier removed.' }
}

function productPayload(input: ProductDraft) {
  return {
    name: input.name,
    category_id: input.categoryId,
    image_url: input.imageUrl?.trim() ? input.imageUrl.trim() : null,
    sku: input.sku?.trim() ?? '',
    stock_unit_id: input.stockUnitId,
    receive_unit_id: input.receiveUnitId,
    conversion_factor: input.conversionFactor,
    cost_price: input.costPrice,
    selling_price: input.sellingPrice,
    size_mode: input.sizeMode,
    sizes: input.sizes,
    cup_price: input.cupPrice,
    half_price: input.halfPrice,
    min_stock: input.minStock,
    is_active: input.isActive,
  }
}

export async function saveProductRemote(id: string | null, input: ProductDraft): Promise<ActionResult> {
  const parsed = productSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the product.')
  if (id) {
    const current = await client().from('products').select('name, size_mode, sizes, cup_price, half_price').eq('id', id).maybeSingle()
    if (current.error) return fail(errorText(current.error))
    if (!current.data) return fail('Product not found.')
    const row = current.data as Row
    const sizeMode = str(row, 'size_mode')
    const storedSizes = Array.isArray(row.sizes) ? row.sizes as Array<{ name?: string; cost?: number; price?: number; cupPrice?: number | null; halfPrice?: number | null }> : []
    const sizes = sizeMode === 'many'
      ? storedSizes.map((size) => {
          const next = parsed.data.sizes.find((item) => item.name === size.name)
          if (!next) return size
          return {
            ...size,
            cost: next.cost,
            price: next.price,
            cupPrice: size.cupPrice == null ? null : next.cupPrice,
            halfPrice: size.halfPrice == null ? null : next.halfPrice,
          }
        })
      : storedSizes
    const result = await client().from('products').update({
      cost_price: parsed.data.costPrice,
      selling_price: parsed.data.sellingPrice,
      sizes,
      cup_price: sizeMode === 'many' || row.cup_price == null ? row.cup_price ?? null : parsed.data.cupPrice,
      half_price: sizeMode === 'many' || row.half_price == null ? row.half_price ?? null : parsed.data.halfPrice,
    }).eq('id', id)
    if (result.error) return fail(errorText(result.error))
    await audit('product.update', 'product', id, `Updated prices for ${str(row, 'name')}.`)
    return { ok: true, message: 'Prices updated.' }
  }
  const payload = productPayload({ ...parsed.data, imageUrl: parsed.data.imageUrl ?? '', sku: parsed.data.sku ?? '' })
  const result = await client().from('products').insert(payload).select('id').single()
  if (result.error) return fail(errorText(result.error))
  const entityId = String((result.data as Row | null)?.id ?? '')
  await audit('product.create', 'product', entityId, `Created product ${parsed.data.name}.`)
  return { ok: true, message: 'Product created.' }
}

export async function saveEmployeeRemote(input: EmployeeDraft): Promise<ActionResult> {
  const parsed = employeeSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the employee account.')
  const existing = await client()
    .from('profiles')
    .select('id')
    .or(`email.eq.${parsed.data.email},username.eq.${parsed.data.username.toLowerCase()}`)
    .limit(1)
  if (existing.error) return fail(errorText(existing.error))
  if (existing.data?.length) return fail('That email or username is already in use.')

  const guest = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const signup = await guest.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.fullName,
        username: parsed.data.username.toLowerCase(),
        phone: parsed.data.phone ?? '',
      },
    },
  })
  if (signup.error || !signup.data.user) return fail(errorText(signup.error, 'The employee account could not be created.'))

  const { error } = await client()
    .from('profiles')
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone ?? '',
      can_submit_activities: parsed.data.canSubmitActivities,
      can_view_stock: parsed.data.canViewStock,
    })
    .eq('id', signup.data.user.id)
  if (error) return fail(errorText(error))
  await audit('employee.create', 'profile', signup.data.user.id, `Created employee account for ${parsed.data.fullName}.`)
  return {
    ok: true,
    message: 'Employee account created. They can sign in after their email is confirmed, if confirmation is turned on.',
    meta: { temporaryPassword: parsed.data.password },
  }
}

export async function updateEmployeeRemote(
  employeeId: string,
  patch: { fullName?: string; phone?: string; isActive?: boolean; canSubmitActivities?: boolean; canViewStock?: boolean; imageUrl?: string },
): Promise<ActionResult> {
  const payload: Record<string, string | boolean | null> = {}
  if (patch.fullName !== undefined) payload.full_name = patch.fullName.trim()
  if (patch.phone !== undefined) payload.phone = patch.phone
  if (patch.isActive !== undefined) payload.is_active = patch.isActive
  if (patch.canSubmitActivities !== undefined) payload.can_submit_activities = patch.canSubmitActivities
  if (patch.canViewStock !== undefined) payload.can_view_stock = patch.canViewStock
  if (patch.imageUrl !== undefined) payload.avatar_url = patch.imageUrl.trim() || null
  if (typeof payload.full_name === 'string' && payload.full_name.length < 2) return fail('Enter the employee name.')
  const { error } = await client().from('profiles').update(payload).eq('id', employeeId).eq('role', 'employee')
  if (error) return fail(errorText(error))
  await audit('employee.update', 'profile', employeeId, 'Updated employee access.')
  return { ok: true, message: 'Employee updated.' }
}

export async function sendStockInRemote(draft: StockInDraft): Promise<ActionResult> {
  const result = await submitStockIn({
    items: draft.items,
    supplierName: draft.supplierName,
    deliveryDate: draft.deliveryDate,
    invoiceRef: draft.invoiceRef ?? '',
    notes: draft.notes ?? '',
    correctsId: draft.correctsId ?? '',
  })
  if (result.error) return fail(errorText(result.error))
  const me = await client().auth.getUser()
  const profile = me.data.user
    ? await client().from('profiles').select('role').eq('id', me.data.user.id).maybeSingle()
    : null
  if (profile?.data?.role === 'admin') return { ok: true, message: 'Delivery approved. Confirmed stock was updated.' }
  return { ok: true, message: 'Delivery submitted for approval. Confirmed stock will not change until an administrator approves it.' }
}

export async function sendSaleRemote(draft: SaleDraft): Promise<ActionResult> {
  const result = await submitSale({
    items: draft.items,
    customerName: draft.customerName,
    paymentStatus: draft.paymentStatus,
    recordKind: draft.recordKind ?? 'sale',
    generatedAt: draft.generatedAt ?? '',
    notes: draft.notes ?? '',
    correctsId: draft.correctsId ?? '',
  })
  if (result.error) return fail(errorText(result.error))
  const kind = draft.recordKind === 'bill' ? 'bill' : 'sale'
  if (kind === 'bill' && draft.paymentStatus === 'paid') return { ok: true, message: 'Marked sold and recorded as a sale. Stock was updated.' }
  if (kind === 'bill') return { ok: true, message: 'Bill saved. Stock was updated. It stays in your bills until you mark it sold.' }
  return { ok: true, message: 'Sale recorded. Confirmed stock was updated.' }
}

export async function sendRemainingCountRemote(lines: Array<{ productId: string; remaining: number }>): Promise<ActionResult> {
  const result = await submitRemainingCountRemoteRpc({ items: lines })
  if (result.error) return fail(errorText(result.error))
  return { ok: true, message: 'Remaining stock was recorded as sales. Confirmed stock was updated.' }
}

export async function editSaleRemote(id: string, draft: SaleDraft): Promise<ActionResult> {
  const result = await updateSale(id, {
    items: draft.items,
    customerName: draft.customerName,
    paymentStatus: draft.paymentStatus,
    recordKind: draft.recordKind ?? 'sale',
    notes: draft.notes ?? '',
  })
  if (result.error) return fail(errorText(result.error))
  return { ok: true, message: 'Bill updated. The generated time was left unchanged.' }
}

export async function editStockInRemote(id: string, draft: StockInDraft): Promise<ActionResult> {
  const result = await updateStockIn(id, {
    items: draft.items,
    supplierName: draft.supplierName,
    deliveryDate: draft.deliveryDate,
    notes: draft.notes ?? '',
  })
  if (result.error) return fail(errorText(result.error))
  return { ok: true, message: 'Delivery updated. The invoice number was left unchanged.' }
}

export async function setBillPaymentRemote(id: string, paymentStatus: 'paid' | 'unpaid'): Promise<ActionResult> {
  const result = await setBillPayment(id, paymentStatus)
  if (result.error) return fail(errorText(result.error))
  return { ok: true, message: 'This bill is now a sale.' }
}

export async function recordBillPaymentRemote(id: string, amount: number): Promise<ActionResult> {
  const result = await recordBillPayment(id, amount)
  if (result.error) return fail(errorText(result.error))
  return { ok: true, message: 'Payment recorded in sales. The remaining balance stays on the bill.' }
}

export async function appendBillItemRemote(id: string, productId: string, quantity: number, sizeName: string, portion: string): Promise<ActionResult> {
  const result = await appendBillItem(id, productId, quantity, sizeName, portion)
  if (result.error) return fail(errorText(result.error))
  return { ok: true, message: 'Product added to the bill. Stock was updated.' }
}

export async function sendExpenseRemote(draft: ExpenseDraft): Promise<ActionResult> {
  const result = await submitExpense({ ...draft, notes: draft.notes ?? '', correctsId: draft.correctsId ?? '' })
  if (result.error) return fail(errorText(result.error))
  const me = await client().auth.getUser()
  const profile = me.data.user ? await client().from('profiles').select('role').eq('id', me.data.user.id).maybeSingle() : null
  const admin = profile?.data?.role === 'admin'
  return { ok: true, message: admin ? 'Expense recorded.' : 'Expense submitted for approval.' }
}

export async function sendActivityRemote(draft: ActivityDraft): Promise<ActionResult> {
  const result = await submitActivity({ ...draft, notes: draft.notes ?? '', correctsId: draft.correctsId ?? '' })
  if (result.error) return fail(errorText(result.error))
  return { ok: true, message: 'Income submitted for approval.' }
}

async function reviewed(result: Promise<{ error: { message?: string } | null }>, message: string): Promise<ActionResult> {
  const resolved = await result
  if (resolved.error) return fail(errorText(resolved.error))
  return { ok: true, message }
}

export const acceptStockInRemote = (id: string) => reviewed(approveStockIn(id), 'Delivery approved. Confirmed stock was updated.')
export const declineStockInRemote = (id: string, reason: string) => reviewed(rejectStockIn(id, reason), 'Delivery rejected. Confirmed stock was not changed.')
export const acceptSaleRemote = (id: string) => reviewed(approveSale(id), 'Approved. A bill keeps the stock already taken off when it was written.')
export const recordBillLossRemote = (id: string) => reviewed(settleBillLoss(id), 'Recorded as a loss. It is not counted as revenue.')
export const declineSaleRemote = (id: string, reason: string) => reviewed(rejectSale(id, reason), 'Sale rejected. Reserved stock was released.')
export const acceptActivityRemote = (id: string) => reviewed(approveActivity(id), 'Income approved.')
export const declineActivityRemote = (id: string, reason: string) => reviewed(rejectActivity(id, reason), 'Income rejected.')
export const acceptExpenseRemote = (id: string) => reviewed(approveExpense(id), 'Expense approved.')
export const declineExpenseRemote = (id: string, reason: string) => reviewed(rejectExpense(id, reason), 'Expense rejected.')

export async function withdrawRemote(kind: 'stock_in' | 'sale' | 'activity' | 'expense', id: string, reason: string): Promise<ActionResult> {
  const result = await cancelSubmission(kind, id, reason)
  if (result.error) return fail(errorText(result.error))
  return { ok: true, message: kind === 'sale' ? 'Submission cancelled. Reserved stock was released.' : 'Submission cancelled.' }
}

export async function adjustRemote(draft: AdjustmentDraft): Promise<ActionResult> {
  const delta = draft.direction === 'in' ? draft.quantity : -draft.quantity
  const result = await adjustInventory(draft.productId, delta, draft.reason)
  if (result.error) return fail(errorText(result.error))
  return { ok: true, message: `${String(result.data ?? 'Adjustment')} recorded.` }
}

export async function saveSettingsRemote(input: { businessName: string; currency: string; currencySymbol: string; lowStockAlerts: boolean; allowRemainingCount: boolean }): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the settings.')
  const { error } = await client()
    .from('business_settings')
    .update({
      business_name: parsed.data.businessName,
      currency: parsed.data.currency,
      currency_symbol: parsed.data.currencySymbol,
      low_stock_alerts: parsed.data.lowStockAlerts,
      allow_remaining_count: parsed.data.allowRemainingCount,
    })
    .eq('id', 1)
  if (error) return fail(errorText(error))
  await audit('settings.update', 'settings', 'business', 'Updated business settings.')
  return { ok: true, message: 'Settings saved.' }
}

export async function saveActivityTypeRemote(
  id: string,
  input: { pricingMode: 'per_game' | 'per_session' | 'per_play' | 'flat'; unitPrice: number; unitLabel: string; isActive: boolean },
): Promise<ActionResult> {
  const parsed = activityTypeSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the pricing rule.')
  const { error } = await client()
    .from('activity_types')
    .update({
      pricing_mode: parsed.data.pricingMode,
      unit_price: parsed.data.unitPrice,
      unit_label: parsed.data.unitLabel,
      is_active: parsed.data.isActive,
    })
    .eq('id', id)
  if (error) return fail(errorText(error))
  await audit('activity_type.update', 'activity_type', id, 'Updated activity pricing.')
  return { ok: true, message: 'Pricing updated.' }
}

export async function readNotificationRemote(id: string): Promise<ActionResult> {
  const user = await client().auth.getUser()
  if (!user.data.user) return fail('You are not signed in.')
  const { error } = await client().from('notifications').update({ read: true }).eq('id', id).eq('recipient_id', user.data.user.id)
  if (error) return fail(errorText(error))
  return { ok: true }
}

export async function readAllNotificationsRemote(): Promise<ActionResult> {
  const user = await client().auth.getUser()
  if (!user.data.user) return fail('You are not signed in.')
  const { error } = await client().from('notifications').update({ read: true }).eq('recipient_id', user.data.user.id).eq('read', false)
  if (error) return fail(errorText(error))
  return { ok: true }
}
