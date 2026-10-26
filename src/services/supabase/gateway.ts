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
import { applyCurrentPrices } from '@/features/products/priceHistory'
import { roundBuyingPrice } from '@/utils/money'
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
  clearBusinessData as clearBusinessDataRpc,
  adminUpdateEmployee,
  adminSetStaffAccess,
  adminDeleteEmployee,
  adminDeleteRecord,
  saveDayClose as saveDayCloseRpc,
  adminUpdateDayClose,
  adminDeleteDayClose,
  adminApproveDayClose,
  reviewDebtPaymentRpc,
  adminSetDebtPaymentRpc,
  setCogsDebtPaymentRpc,
  adminApplyPriceChange,
  staffDirectory,
  submitActivity,
  submitExpense,
  setBillPayment,
  recordBillPayment,
  appendBillItem,
  submitSale,
  submitRemainingCount as submitRemainingCountRemoteRpc,
  saveRestockOrderRpc,
  setRestockItemReceivedRpc,
  setRestockOrderStatusRpc,
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
  DayClose,
  DayDebt,
  CogsExpenseLine,
  CogsLine,
  CogsMobileItem,
  EmployeeDraft,
  EmployeePatch,
  InventoryMovement,
  NotifyChannel,
  Product,
  ProductDraft,
  ProductPriceChange,
  Profile,
  RecordDeleteKind,
  RestockOrderDraft,
  RestockOrderStatus,
  SaleDraft,
  SalesTransaction,
  StockInDraft,
  StockInTransaction,
} from '@/types'
import { accessFromAssigned, assignedRoleOf, canViewSupplierContacts } from '@/utils/access'
import { dateKey, normalizeRecordLookback } from '@/utils/dates'

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
    return 'The Supabase project is missing a Manyara Pub table or function. In the SQL editor run 001_initial.sql only if this is a new empty project, then paste and run 023_live_catchup.sql through 048_employee_set_cogs_debt.sql in order.'
  }
  if (/UPDATE requires a WHERE clause|DELETE requires a WHERE clause/i.test(raw)) {
    return 'Clearing business data needs the latest SQL. Paste and run supabase/migrations/028_clear_business_data.sql in the Supabase SQL editor, then try again.'
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

function mapDebts(value: unknown): DayDebt[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Row
    const customerName = str(row, 'customerName') || str(row, 'customer_name')
    const amount = num(row, 'amount')
    if (customerName.length < 2 || amount < 1) return []
    const paidAmount = num(row, 'paidAmount') || num(row, 'paid_amount')
    const paymentStatusRaw = str(row, 'paymentStatus') || str(row, 'payment_status')
    const paymentStatus = paymentStatusRaw === 'approved' || paymentStatusRaw === 'pending' || paymentStatusRaw === 'unpaid' ? paymentStatusRaw : paidAmount > 0 ? 'pending' : 'unpaid'
    const paidApprovedAmount = num(row, 'paidApprovedAmount') || num(row, 'paid_approved_amount')
    return [{
      id: str(row, 'id') || undefined,
      customerName,
      amount,
      products: str(row, 'products'),
      paidAmount,
      paymentStatus,
      paidApprovedAmount: paidApprovedAmount || undefined,
    }]
  })
}

function mapLines(value: unknown): CogsLine[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Row
    const name = str(row, 'name')
    if (!name) return []
    return [{
      productId: optional(row, 'productId') ?? optional(row, 'product_id'),
      name,
      remaining: num(row, 'remaining'),
      sold: num(row, 'sold'),
      amount: num(row, 'amount'),
      profit: num(row, 'profit'),
    }]
  })
}

function mapExpenseItems(value: unknown): CogsExpenseLine[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Row
    const description = str(row, 'description')
    const amount = num(row, 'amount')
    if (description.length < 2 || amount < 1) return []
    return [{ id: str(row, 'id') || undefined, description, amount, notes: str(row, 'notes') }]
  })
}

function mapMobileItems(value: unknown, fallbackDay: string, fallbackTotal: number): CogsMobileItem[] {
  if (Array.isArray(value)) {
    const items = value.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const row = item as Row
      const amount = num(row, 'amount')
      const date = str(row, 'date').slice(0, 10)
      if (amount < 1) return []
      return [{ id: str(row, 'id') || undefined, amount, date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : fallbackDay }]
    })
    if (items.length) return items
  }
  if (fallbackTotal >= 1) return [{ amount: fallbackTotal, date: fallbackDay }]
  return []
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
    priceChanges: [],
    suppliers: [],
    stockIns: [],
    restockOrders: [],
    sales: [],
    movements: [],
    activityTypes: [],
    activities: [],
    expenses: [],
    dayCloses: [],
    notifications: [],
    auditLogs: [],
    settings: {
      businessName: 'Manyara Pub',
      currency: 'TZS',
      currencySymbol: 'TSh',
      lowStockAlerts: true,
      allowRemainingCount: false,
      recordLookbackDays: 2,
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
    staffTitle: str(row, 'staff_title') === 'manager' ? 'manager' : 'staff',
    isActive: bool(row, 'is_active'),
    canSubmitActivities: bool(row, 'can_submit_activities'),
    canViewStock: row.can_view_stock !== false,
    canViewSuppliers: bool(row, 'can_view_suppliers') || str(row, 'role') === 'admin' || str(row, 'staff_title') === 'manager',
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
    dayCloses,
    priceChanges,
    restockOrders,
    restockItems,
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
    dbClient.from('day_closes').select('*'),
    dbClient.from('product_price_changes').select('*'),
    dbClient.from('restock_orders').select('*'),
    dbClient.from('restock_order_items').select('*'),
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
    missingRelation(dayCloses.error) ? null : dayCloses.error,
    missingRelation(priceChanges.error) ? null : priceChanges.error,
    missingRelation(restockOrders.error) ? null : restockOrders.error,
    missingRelation(restockItems.error) ? null : restockItems.error,
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
      staffTitle: 'staff',
      isActive: true,
      canSubmitActivities: false,
      canViewStock: true,
      canViewSuppliers: false,
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

  const sessionUser = (await dbClient.auth.getUser()).data.user
  const viewer = mappedProfiles.find((profile) => profile.id === sessionUser?.id)
  const mappedSuppliers = rowsOf(suppliers.data).map((row) => ({
    id: str(row, 'id'),
    name: str(row, 'name'),
    phone: canViewSupplierContacts(viewer) ? str(row, 'phone') : '',
    imageUrl: canViewSupplierContacts(viewer) ? optional(row, 'image_url') : undefined,
    isActive: bool(row, 'is_active'),
    createdAt: str(row, 'created_at'),
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
      priceChanges: missingRelation(priceChanges.error)
        ? []
        : rowsOf(priceChanges.data).map(
            (row): ProductPriceChange => ({
              id: str(row, 'id'),
              productId: str(row, 'product_id'),
              effectiveDate: str(row, 'effective_date').slice(0, 10),
              costPrice: num(row, 'cost_price'),
              sellingPrice: num(row, 'selling_price'),
              createdBy: str(row, 'created_by'),
              createdAt: str(row, 'created_at'),
            }),
          ),
      suppliers: mappedSuppliers,
      stockIns: stockTransactions.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
      restockOrders: missingRelation(restockOrders.error)
        ? []
        : rowsOf(restockOrders.data)
            .map((row) => ({
              id: str(row, 'id'),
              code: str(row, 'code'),
              notes: str(row, 'notes'),
              status:
                str(row, 'status') === 'received'
                  ? ('received' as const)
                  : str(row, 'status') === 'partial'
                    ? ('partial' as const)
                    : ('not_received' as const),
              submittedBy: str(row, 'submitted_by'),
              submittedAt: str(row, 'submitted_at'),
              receivedAt: optional(row, 'received_at'),
              receivedBy: optional(row, 'received_by'),
              stockInId: optional(row, 'stock_in_id'),
              receivedEditUsed: bool(row, 'received_edit_used'),
              items: rowsOf(restockItems.data)
                .filter((item) => str(item, 'order_id') === str(row, 'id'))
                .map((item) => ({
                  id: str(item, 'id'),
                  productId: str(item, 'product_id'),
                  receivedQuantity: num(item, 'received_quantity'),
                  receiveUnitId: str(item, 'receive_unit_id'),
                  conversionFactor: num(item, 'conversion_factor'),
                  stockQuantity: num(item, 'stock_quantity'),
                  received: bool(item, 'received'),
                  receivedAt: optional(item, 'received_at'),
                })),
            }))
            .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
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
      dayCloses: missingRelation(dayCloses.error)
        ? []
        : rowsOf(dayCloses.data)
            .map(
              (row): DayClose => ({
                id: str(row, 'id'),
                day: str(row, 'day').slice(0, 10),
                submittedBy: str(row, 'submitted_by'),
                remainingSaleId: optional(row, 'remaining_sale_id'),
                debts: mapDebts(row.debts),
                lines: mapLines(row.lines),
                expenseItems: mapExpenseItems(row.expense_items),
                mobileItems: mapMobileItems(row.mobile_items, str(row, 'day').slice(0, 10), num(row, 'mobile_received')),
                mobileReceived: num(row, 'mobile_received'),
                expenseTotal: num(row, 'expense_total'),
                status: str(row, 'status') === 'approved' ? 'approved' : 'pending',
                reviewedBy: optional(row, 'reviewed_by'),
                reviewedAt: optional(row, 'reviewed_at'),
                createdAt: str(row, 'created_at'),
              }),
            )
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
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
            recordLookbackDays: normalizeRecordLookback(settingsRow.record_lookback_days),
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
  await signOutRemote()
  return { ok: true, message: 'Password updated. Sign in with the new password.' }
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

export async function saveSupplierRemote(input: { name: string; phone: string; imageUrl?: string }): Promise<ActionResult> {
  const parsed = supplierSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the supplier.')
  const result = await client()
    .from('suppliers')
    .insert({ name: parsed.data.name, phone: parsed.data.phone, image_url: input.imageUrl?.trim() || null })
    .select('id')
    .single()
  if (result.error) return fail(errorText(result.error))
  await audit('supplier.create', 'supplier', String((result.data as Row).id), `Added supplier ${parsed.data.name}.`)
  return { ok: true, message: 'Supplier added.' }
}

export async function updateSupplierRemote(id: string, patch: { name?: string; phone?: string; imageUrl?: string }): Promise<ActionResult> {
  const payload: Record<string, string | null> = {}
  if (patch.name !== undefined) payload.name = patch.name.trim()
  if (patch.phone !== undefined) payload.phone = patch.phone
  if (patch.imageUrl !== undefined) payload.image_url = patch.imageUrl.trim() || null
  if (typeof payload.name === 'string' && payload.name.length < 2) return fail('Enter the supplier name.')
  const { error } = await client().from('suppliers').update(payload).eq('id', id)
  if (error) return fail(errorText(error))
  await audit('supplier.update', 'supplier', id, 'Updated supplier details.')
  return { ok: true, message: 'Supplier updated.' }
}

export async function removeSupplierRemote(id: string): Promise<ActionResult> {
  const result = await removeSupplier(id)
  if (result.error) return fail(errorText(result.error))
  return { ok: true, message: 'Supplier removed.' }
}

export async function deleteCategoryRemote(id: string): Promise<ActionResult> {
  const current = await client().from('categories').select('name').eq('id', id).maybeSingle()
  if (current.error) return fail(errorText(current.error))
  if (!current.data) return fail('Category not found.')
  const used = await client().from('products').select('id').eq('category_id', id).limit(1)
  if (used.error) return fail(errorText(used.error))
  if (used.data?.length) return fail('This category still has products. Move or delete those products first.')
  const result = await client().from('categories').delete().eq('id', id)
  if (result.error) return fail(errorText(result.error))
  await audit('category.delete', 'category', id, `Deleted category ${str(current.data as Row, 'name')}.`)
  return { ok: true, message: 'Category deleted.' }
}

export async function deleteUnitRemote(id: string): Promise<ActionResult> {
  const current = await client().from('units').select('name').eq('id', id).maybeSingle()
  if (current.error) return fail(errorText(current.error))
  if (!current.data) return fail('That unit could not be found.')
  const used = await client().from('products').select('id').or(`stock_unit_id.eq.${id},receive_unit_id.eq.${id}`).limit(1)
  if (used.error) return fail(errorText(used.error))
  if (used.data?.length) return fail('This unit is still used by a product. Change those products first.')
  const result = await client().from('units').delete().eq('id', id)
  if (result.error) return fail(errorText(result.error))
  await audit('unit.delete', 'unit', id, `Deleted unit ${str(current.data as Row, 'name')}.`)
  return { ok: true, message: 'Unit deleted.' }
}

export async function clearBusinessDataRemote(): Promise<ActionResult> {
  const result = await clearBusinessDataRpc()
  if (result.error) return fail(errorText(result.error))
  return { ok: true, message: 'Business data cleared. Accounts, categories, units, and settings were kept.' }
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
    cost_price: roundBuyingPrice(input.costPrice),
    selling_price: Math.round(input.sellingPrice),
    size_mode: input.sizeMode,
    sizes: input.sizes.map((size) => ({ ...size, cost: roundBuyingPrice(size.cost) })),
    cup_price: input.cupPrice,
    half_price: input.halfPrice,
    min_stock: input.minStock,
    is_active: input.isActive,
  }
}

async function writeCatalogPrices(input: {
  productId: string
  costPrice: number
  sellingPrice: number
  sizes?: Product['sizes']
  cupPrice?: number | null
  halfPrice?: number | null
}): Promise<ActionResult> {
  const current = await client().from('products').select('*').eq('id', input.productId).maybeSingle()
  if (current.error) return fail(errorText(current.error))
  if (!current.data) return fail('Product not found.')
  const cost = roundBuyingPrice(input.costPrice)
  const selling = Math.round(input.sellingPrice)
  const priced = applyCurrentPrices(mapProduct(current.data as Row), cost, selling, input.sizes)
  const saved = await client()
    .from('products')
    .update({
      cost_price: priced.costPrice,
      selling_price: priced.sellingPrice,
      sizes: priced.sizes,
      cup_price: input.cupPrice !== undefined ? input.cupPrice : priced.cupPrice,
      half_price: input.halfPrice !== undefined ? input.halfPrice : priced.halfPrice,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.productId)
    .select('id, cost_price, selling_price')
    .maybeSingle()
  if (saved.error) return fail(errorText(saved.error))
  if (!saved.data) {
    return fail('The product prices were not saved. Sign in as an administrator and run supabase/migrations/054_fix_product_price_save.sql in the SQL editor.')
  }
  const row = saved.data as Row
  if (num(row, 'cost_price') !== priced.costPrice || num(row, 'selling_price') !== priced.sellingPrice) {
    return fail('The product prices did not stick. Run supabase/migrations/054_fix_product_price_save.sql in the SQL editor, then save again.')
  }
  return { ok: true }
}

export async function saveProductRemote(id: string | null, input: ProductDraft): Promise<ActionResult> {
  const parsed = productSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the product.')
  if (id) {
    const current = await client().from('products').select('id').eq('id', id).maybeSingle()
    if (current.error) return fail(errorText(current.error))
    if (!current.data) return fail('Product not found.')
    const payload = productPayload({ ...parsed.data, imageUrl: parsed.data.imageUrl ?? '', sku: parsed.data.sku ?? '' })
    const result = await client().from('products').update(payload).eq('id', id)
    if (result.error) return fail(errorText(result.error))
    await audit('product.update', 'product', id, `Updated product ${parsed.data.name}.`)
    const priced = await applyPriceChangeRemote({
      productId: id,
      day: dateKey(),
      costPrice: parsed.data.costPrice,
      sellingPrice: parsed.data.sellingPrice,
      sizes: parsed.data.sizeMode === 'many' ? parsed.data.sizes : undefined,
      cupPrice: parsed.data.cupPrice,
      halfPrice: parsed.data.halfPrice,
    })
    if (!priced.ok) return priced
    return { ok: true, message: 'Product updated.' }
  }
  const payload = productPayload({ ...parsed.data, imageUrl: parsed.data.imageUrl ?? '', sku: parsed.data.sku ?? '' })
  const result = await client().from('products').insert(payload).select('id').single()
  if (result.error) return fail(errorText(result.error))
  const entityId = String((result.data as Row | null)?.id ?? '')
  await audit('product.create', 'product', entityId, `Created product ${parsed.data.name}.`)
  return { ok: true, message: 'Product created.' }
}

export async function deleteProductRemote(id: string): Promise<ActionResult> {
  const current = await client().from('products').select('name').eq('id', id).maybeSingle()
  if (current.error) return fail(errorText(current.error))
  if (!current.data) return fail('Product not found.')
  const name = str(current.data as Row, 'name')
  const [sales, stock, movements] = await Promise.all([
    client().from('sales_items').select('id').eq('product_id', id).limit(1),
    client().from('stock_in_items').select('id').eq('product_id', id).limit(1),
    client().from('inventory_movements').select('id').eq('product_id', id).limit(1),
  ])
  if (sales.error) return fail(errorText(sales.error))
  if (stock.error) return fail(errorText(stock.error))
  if (movements.error) return fail(errorText(movements.error))
  const used = Boolean(sales.data?.length || stock.data?.length || movements.data?.length)
  if (used) {
    const result = await client().from('products').update({ is_active: false }).eq('id', id)
    if (result.error) return fail(errorText(result.error))
    await audit('product.deactivate', 'product', id, `Turned ${name} inactive because it has sales or stock records.`)
    return { ok: true, message: 'This product has sales or stock records, so it was turned inactive instead of deleted.' }
  }
  const result = await client().from('products').delete().eq('id', id)
  if (result.error) return fail(errorText(result.error))
  await audit('product.delete', 'product', id, `Deleted product ${name}.`)
  return { ok: true, message: 'Product deleted.' }
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
  const access = accessFromAssigned(parsed.data.assignedRole ?? 'employee', parsed.data)
  const granted = await adminSetStaffAccess(
    signup.data.user.id,
    parsed.data.assignedRole ?? 'employee',
    access.canSubmitActivities,
    access.canViewStock,
    access.canViewSuppliers,
  )
  if (granted.error && !missingRelation(granted.error)) return fail(errorText(granted.error))
  await audit('employee.create', 'profile', signup.data.user.id, `Created employee account for ${parsed.data.fullName}.`)
  return {
    ok: true,
    message: 'Employee account created. They can sign in after their email is confirmed, if confirmation is turned on.',
    meta: { temporaryPassword: parsed.data.password },
  }
}

export async function updateEmployeeRemote(employeeId: string, patch: EmployeePatch): Promise<ActionResult> {
  if (patch.username !== undefined || patch.password) {
    const current = await client().from('profiles').select('full_name, phone, username').eq('id', employeeId).maybeSingle()
    if (current.error) return fail(errorText(current.error))
    if (!current.data) return fail('Staff account not found.')
    const row = current.data as Row
    const result = await adminUpdateEmployee(
      employeeId,
      (patch.fullName ?? str(row, 'full_name')).trim(),
      patch.phone ?? str(row, 'phone'),
      (patch.username ?? str(row, 'username')).trim().toLowerCase(),
      patch.password ?? '',
    )
    if (result.error) return fail(errorText(result.error))
  }
  if (patch.assignedRole || patch.canSubmitActivities !== undefined || patch.canViewStock !== undefined || patch.canViewSuppliers !== undefined) {
    const current = await client().from('profiles').select('role, staff_title, can_submit_activities, can_view_stock, can_view_suppliers').eq('id', employeeId).maybeSingle()
    if (current.error) return fail(errorText(current.error))
    if (!current.data) return fail('Staff account not found.')
    const row = current.data as Row
    const assigned = patch.assignedRole ?? assignedRoleOf({
      role: str(row, 'role') === 'admin' ? 'admin' : 'employee',
      staffTitle: str(row, 'staff_title') === 'manager' ? 'manager' : 'staff',
    })
    const access = accessFromAssigned(assigned, {
      canSubmitActivities: patch.canSubmitActivities ?? bool(row, 'can_submit_activities'),
      canViewStock: patch.canViewStock ?? row.can_view_stock !== false,
      canViewSuppliers: patch.canViewSuppliers ?? bool(row, 'can_view_suppliers'),
    })
    const granted = await adminSetStaffAccess(employeeId, assigned, access.canSubmitActivities, access.canViewStock, access.canViewSuppliers)
    if (granted.error && !missingRelation(granted.error)) return fail(errorText(granted.error))
  }
  const payload: Record<string, string | boolean | null> = {}
  if (patch.fullName !== undefined) payload.full_name = patch.fullName.trim()
  if (patch.phone !== undefined) payload.phone = patch.phone
  if (patch.isActive !== undefined) payload.is_active = patch.isActive
  if (patch.imageUrl !== undefined) payload.avatar_url = patch.imageUrl.trim() || null
  if (typeof payload.full_name === 'string' && payload.full_name.length < 2) return fail('Enter the employee name.')
  if (Object.keys(payload).length) {
    const { error } = await client().from('profiles').update(payload).eq('id', employeeId)
    if (error) return fail(errorText(error))
  }
  await audit('employee.update', 'profile', employeeId, 'Updated staff access.')
  return { ok: true, message: 'Staff updated.', meta: patch.password ? { temporaryPassword: patch.password } : undefined }
}

export async function deleteEmployeeRemote(id: string): Promise<ActionResult> {
  const result = await adminDeleteEmployee(id)
  if (result.error) return fail(errorText(result.error))
  if (result.data === 'deactivated') {
    return { ok: true, message: 'This employee has sales or stock records, so the account was turned inactive instead of deleted.' }
  }
  return { ok: true, message: 'Employee deleted.' }
}

export async function saveRestockOrderRemote(draft: RestockOrderDraft): Promise<ActionResult> {
  const result = await saveRestockOrderRpc(draft.id ?? null, {
    notes: draft.notes ?? '',
    items: draft.items,
  })
  if (result.error) return fail(errorText(result.error))
  return { ok: true, message: draft.id ? 'Order saved.' : 'Order saved. Mark it received when the stock arrives.' }
}

export async function setRestockOrderStatusRemote(id: string, status: RestockOrderStatus): Promise<ActionResult> {
  const result = await setRestockOrderStatusRpc(id, status)
  if (result.error) return fail(errorText(result.error))
  return {
    ok: true,
    message: status === 'received' ? 'Order marked received. Confirmed stock was updated.' : 'Order marked not received. Stock in was reversed.',
  }
}

export async function setRestockItemStatusRemote(orderId: string, itemId: string, received: boolean): Promise<ActionResult> {
  void orderId
  const result = await setRestockItemReceivedRpc(itemId, received)
  if (result.error) return fail(errorText(result.error))
  return {
    ok: true,
    message: received ? 'Product marked received. Confirmed stock was updated.' : 'Received products cannot be unmarked.',
  }
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

export async function sendRemainingCountRemote(lines: Array<{ productId: string; remaining: number; unitCost?: number | null }>): Promise<ActionResult> {
  const result = await submitRemainingCountRemoteRpc({ items: lines })
  if (result.error) return fail(errorText(result.error))
  return { ok: true, message: 'Remaining stock was recorded as sales. Confirmed stock was updated.', meta: result.data ? { id: String(result.data) } : undefined }
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

export async function saveSettingsRemote(input: { businessName: string; currency: string; currencySymbol: string; lowStockAlerts: boolean; allowRemainingCount: boolean; recordLookbackDays: 1 | 2 | 3 | 5 | 7 }): Promise<ActionResult> {
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
      record_lookback_days: parsed.data.recordLookbackDays,
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
  return setNotificationsReadRemote([id], true)
}

export async function readAllNotificationsRemote(): Promise<ActionResult> {
  const user = await client().auth.getUser()
  if (!user.data.user) return fail('You are not signed in.')
  const { error } = await client().from('notifications').update({ read: true }).eq('recipient_id', user.data.user.id).eq('read', false)
  if (error) return fail(errorText(error))
  return { ok: true }
}

export async function setNotificationsReadRemote(ids: string[], read: boolean): Promise<ActionResult> {
  const user = await client().auth.getUser()
  if (!user.data.user) return fail('You are not signed in.')
  if (!ids.length) return { ok: true }
  const { error } = await client().from('notifications').update({ read }).eq('recipient_id', user.data.user.id).in('id', ids)
  if (error) return fail(errorText(error))
  return { ok: true }
}

export async function deleteNotificationsRemote(ids: string[]): Promise<ActionResult> {
  const user = await client().auth.getUser()
  if (!user.data.user) return fail('You are not signed in.')
  if (!ids.length) return fail('No notifications selected.')
  const { error } = await client().from('notifications').delete().eq('recipient_id', user.data.user.id).in('id', ids)
  if (error) {
    if (/row-level security/i.test(error.message ?? '')) {
      return fail('Deleting notifications needs the latest SQL. Paste and run supabase/migrations/052_notification_delete.sql in the Supabase SQL editor, then try again.')
    }
    return fail(errorText(error))
  }
  return { ok: true, message: ids.length === 1 ? 'Notification deleted.' : `${ids.length} notifications deleted.` }
}

export async function deleteRecordRemote(kind: RecordDeleteKind, id: string): Promise<ActionResult> {
  const result = await adminDeleteRecord(kind, id)
  if (result.error) return fail(errorText(result.error))
  return { ok: true, message: 'Record deleted.' }
}

export async function saveDayCloseRemote(input: {
  day: string
  remainingSaleId?: string
  debts: DayDebt[]
  mobileReceived: number
  expenseTotal?: number
  lines?: CogsLine[]
  expenseItems?: CogsExpenseLine[]
  mobileItems?: CogsMobileItem[]
  submittedBy?: string
}): Promise<ActionResult> {
  const result = await saveDayCloseRpc({
    day: input.day,
    remainingSaleId: input.remainingSaleId ?? null,
    debts: input.debts,
    mobileReceived: input.mobileReceived,
    expenseTotal: input.expenseTotal ?? 0,
    lines: input.lines ?? [],
    expenseItems: input.expenseItems ?? [],
    mobileItems: input.mobileItems ?? [],
    submittedBy: input.submittedBy ?? null,
  })
  if (result.error) return fail(errorText(result.error))
  return { ok: true, message: 'COGS close saved.' }
}

export async function updateDayCloseRemote(id: string, input: {
  debts: DayDebt[]
  mobileReceived: number
  expenseTotal: number
  lines?: CogsLine[]
  expenseItems?: CogsExpenseLine[]
  mobileItems?: CogsMobileItem[]
}): Promise<ActionResult> {
  const result = await adminUpdateDayClose(id, input)
  if (result.error) return fail(errorText(result.error))
  return { ok: true, message: 'COGS report updated.' }
}

export async function deleteDayCloseRemote(id: string): Promise<ActionResult> {
  const result = await adminDeleteDayClose(id)
  if (result.error) return fail(errorText(result.error))
  return { ok: true, message: 'COGS report deleted.' }
}

export async function approveDayCloseRemote(id: string): Promise<ActionResult> {
  const result = await adminApproveDayClose(id)
  if (result.error) return fail(errorText(result.error))
  return { ok: true, message: 'COGS report approved.' }
}

export async function reviewDebtPaymentRemote(closeId: string, debtId: string, approve: boolean): Promise<ActionResult> {
  const result = await reviewDebtPaymentRpc(closeId, debtId, approve)
  if (result.error) return fail(errorText(result.error))
  return { ok: true, message: approve ? 'Debt payment approved.' : 'Debt payment rejected.' }
}

export async function setDayCloseDebtPaymentRemote(
  closeId: string,
  debtId: string,
  paidAmount: number,
  details?: { customerName?: string; amount?: number; products?: string },
): Promise<ActionResult> {
  const result = await setCogsDebtPaymentRpc(closeId, debtId, paidAmount, details)
  if (result.error) {
    const fallback = await adminSetDebtPaymentRpc(closeId, debtId, paidAmount)
    if (fallback.error) return fail(errorText(result.error))
  }
  return { ok: true, message: paidAmount > 0 ? 'Debt payment updated.' : 'Debt marked unpaid.' }
}

function missingRpc(error: { message?: string } | null) {
  return Boolean(error && /schema cache|does not exist|Could not find the function/i.test(error.message ?? ''))
}

export async function applyPriceChangeRemote(input: {
  productId: string
  day: string
  costPrice: number
  sellingPrice: number
  sizes?: Product['sizes']
  cupPrice?: number | null
  halfPrice?: number | null
}): Promise<ActionResult> {
  const cost = roundBuyingPrice(input.costPrice)
  const selling = Math.round(input.sellingPrice)
  const day = input.day.slice(0, 10)
  const rpc = await adminApplyPriceChange(input.productId, day, cost, selling)
  if (rpc.error) {
    const actor = (await client().auth.getUser()).data.user?.id
    if (actor) {
      await client().from('product_price_changes').upsert(
        {
          product_id: input.productId,
          effective_date: day,
          cost_price: cost,
          selling_price: selling,
          created_by: actor,
        },
        { onConflict: 'product_id,effective_date' },
      )
    }
  }

  const later = await client()
    .from('product_price_changes')
    .select('id')
    .eq('product_id', input.productId)
    .gt('effective_date', day)
    .limit(1)
  const hasLater = !later.error && Boolean(later.data?.length)
  if (!hasLater) {
    const written = await writeCatalogPrices({
      productId: input.productId,
      costPrice: cost,
      sellingPrice: selling,
      sizes: input.sizes,
      cupPrice: input.cupPrice,
      halfPrice: input.halfPrice,
    })
    if (!written.ok) return written
  }

  if (rpc.error) {
    await audit('product.price_change', 'product', input.productId, `Price change from ${day}.`)
  }
  const updated = typeof rpc.data === 'number' ? rpc.data : 0
  return { ok: true, message: `Prices saved. ${updated} COGS sheet${updated === 1 ? '' : 's'} updated.` }
}
