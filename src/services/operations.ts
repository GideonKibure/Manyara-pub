import { snapshotFor, stockQtyFromReceived } from '@/features/inventory/stock'
import { overdueUnpaidBill, unpaidBillHeld } from '@/features/sales/holds'
import { portionPrice, sizeCost } from '@/features/products/offer'
import { applyCurrentPrices, latestPriceChange, nextPriceChangeDate, repriceDayCloses } from '@/features/products/priceHistory'
import { applyDebtPaymentReview, approvePendingDebts, debtPaid, hasPendingDebtPayment, setDebtPayment } from '@/features/dayClose/debts'
import { syncStockAlerts } from '@/features/notifications/alerts'
import { saleTotal } from '@/utils/labels'
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
import type {
  ActivityDraft,
  ActivityTransaction,
  AdjustmentDraft,
  AppNotification,
  AuditLog,
  Database,
  DayClose,
  DayDebt,
  CogsExpenseLine,
  CogsLine,
  CogsMobileItem,
  EmployeeDraft,
  EmployeePatch,
  ExpenseDraft,
  ExpenseTransaction,
  InventoryMovement,
  Product,
  ProductDraft,
  ProductPriceChange,
  Profile,
  RecordDeleteKind,
  RestockOrder,
  RestockOrderDraft,
  RestockOrderItem,
  RestockOrderStatus,
  SaleDraft,
  SaleSize,
  SalesItem,
  SalesTransaction,
  StockInDraft,
  StockInItem,
  StockInTransaction,
} from '@/types'
import { accessFromAssigned, assignedRoleOf } from '@/utils/access'
import { asDateKey, dateKey, isEmployeeAllowedDay } from '@/utils/dates'
import { uid } from '@/utils/id'
import { allocateInvoiceRef } from '@/utils/invoice'
import { roundBuyingPrice } from '@/utils/money'

function pricedStockIn(cost: number, stockQuantity: number) {
  const costPerStockUnit = roundBuyingPrice(cost)
  return { costPerStockUnit, totalCost: Math.round(costPerStockUnit * stockQuantity) }
}

function employeeDayOk(db: Database, day: string, extra?: string) {
  return isEmployeeAllowedDay(day, extra, db.settings.recordLookbackDays)
}

const RECORD_WINDOW_FAIL = 'You can only record within the days allowed by the administrator.'

export type OpResult =
  | { ok: true; db: Database; message?: string; meta?: Record<string, string> }
  | { ok: false; error: string }

function fail(error: string): OpResult {
  return { ok: false, error }
}

function finish(db: Database, message?: string, meta?: Record<string, string>): OpResult {
  return { ok: true, db: syncStockAlerts(db), message, meta }
}

function now() {
  return new Date().toISOString()
}

function takeCode(db: Database, key: keyof Database['counters'], prefix: string) {
  const value = db.counters[key] + 1
  return {
    code: `${prefix}-${String(value).padStart(4, '0')}`,
    db: { ...db, counters: { ...db.counters, [key]: value } },
  }
}

function audit(db: Database, actorId: string, action: string, entityType: string, entityId: string, summary: string): Database {
  const entry: AuditLog = { id: uid(), actorId, action, entityType, entityId, summary, createdAt: now() }
  return { ...db, auditLogs: [entry, ...db.auditLogs] }
}

function notify(db: Database, recipientId: string, input: Omit<AppNotification, 'id' | 'recipientId' | 'read' | 'createdAt' | 'channels'>): Database {
  // In-app is stored now. A later email or WhatsApp adapter can read this same record.
  const entry: AppNotification = {
    ...input,
    id: uid(),
    recipientId,
    read: false,
    createdAt: now(),
    channels: ['in_app'],
  }
  return { ...db, notifications: [entry, ...db.notifications] }
}

function notifyAdmins(db: Database, input: Omit<AppNotification, 'id' | 'recipientId' | 'read' | 'createdAt' | 'channels'>) {
  return db.profiles
    .filter((profile) => profile.role === 'admin' && profile.isActive)
    .reduce((next, profile) => notify(next, profile.id, input), db)
}

function activeProfile(db: Database, userId: string): { ok: true; profile: Profile } | { ok: false; error: string } {
  const profile = db.profiles.find((item) => item.id === userId && item.isActive)
  if (!profile) return { ok: false, error: 'Your account is not active.' }
  return { ok: true, profile }
}

function requireAdmin(db: Database, userId: string): { ok: true; profile: Profile } | { ok: false; error: string } {
  const result = activeProfile(db, userId)
  if (!result.ok) return result
  if (result.profile.role !== 'admin') return { ok: false, error: 'Only an administrator can do that.' }
  return result
}

function productName(db: Database, productId: string) {
  return db.products.find((product) => product.id === productId)?.name ?? 'that product'
}

function applyCogsDebtPayment(db: Database, ownerId: string, day: string, customerName: string, extraPaid: number, asAdmin: boolean): Database {
  const key = asDateKey(day)
  const name = customerName.trim().toLowerCase()
  if (!key || !name || extraPaid < 1) return db
  const close = (db.dayCloses ?? []).find((item) => item.day === key && item.submittedBy === ownerId)
  if (!close) return db
  let matched = false
  const debts = close.debts.map((item) => {
    if (matched || item.customerName.trim().toLowerCase() !== name) return item
    const leftover = Math.max(0, Math.floor(item.amount || 0) - debtPaid(item))
    if (leftover <= 0) return item
    matched = true
    return setDebtPayment(item, debtPaid(item) + extraPaid, asAdmin)
  })
  if (!matched) return db
  return {
    ...db,
    dayCloses: (db.dayCloses ?? []).map((item) => (item.id === close.id ? { ...item, debts } : item)),
  }
}

function replaceProfile(db: Database, profile: Profile): Database {
  return { ...db, profiles: db.profiles.map((item) => (item.id === profile.id ? profile : item)) }
}

export function authenticate(db: Database, identifier: string, password: string): OpResult {
  const key = identifier.trim().toLowerCase()
  const profile = db.profiles.find((item) => item.email.toLowerCase() === key || item.username.toLowerCase() === key)
  const account = profile ? db.accounts.find((item) => item.profileId === profile.id) : undefined
  if (!profile || !account || account.password !== password) {
    return fail('Incorrect email, username, or password.')
  }
  if (!profile.isActive) return fail('This account is deactivated. Contact the administrator.')
  const stamped = { ...profile, lastLoginAt: now(), updatedAt: profile.updatedAt }
  let next = replaceProfile(db, stamped)
  next = audit(next, profile.id, 'auth.login', 'profile', profile.id, `${profile.fullName} signed in.`)
  return { ok: true, db: next, meta: { role: profile.role, userId: profile.id } }
}

export function requestPasswordReset(db: Database, email: string): OpResult {
  const message = 'If that email matches an active account, a reset link is ready below.'
  const profile = db.profiles.find((item) => item.email.toLowerCase() === email.trim().toLowerCase() && item.isActive)
  if (!profile) return { ok: true, db, message }
  const token = `${uid().replaceAll('-', '')}${uid().replaceAll('-', '')}`
  const resetTokens = db.resetTokens.filter((item) => item.profileId !== profile.id)
  resetTokens.push({ token, profileId: profile.id, expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() })
  let next = audit({ ...db, resetTokens }, profile.id, 'auth.reset_request', 'profile', profile.id, 'Password reset requested.')
  return { ok: true, db: next, message, meta: { resetUrl: `/reset-password?token=${token}` } }
}

export function resetPassword(db: Database, token: string, password: string): OpResult {
  const parsed = passwordSchema.safeParse(password)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Choose a stronger password.')
  const match = db.resetTokens.find((item) => item.token === token)
  if (!match || new Date(match.expiresAt).getTime() < Date.now()) return fail('This reset link is invalid or has expired.')
  const accounts = db.accounts.map((account) => (account.profileId === match.profileId ? { ...account, password } : account))
  let next = audit(
    { ...db, accounts, resetTokens: db.resetTokens.filter((item) => item.token !== token) },
    match.profileId,
    'auth.reset',
    'profile',
    match.profileId,
    'Password was reset.',
  )
  return { ok: true, db: next, message: 'Password updated. You can sign in now.' }
}

export function changePassword(db: Database, userId: string, current: string, password: string): OpResult {
  const actor = activeProfile(db, userId)
  if (!actor.ok) return actor
  const parsed = passwordSchema.safeParse(password)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Choose a stronger password.')
  const account = db.accounts.find((item) => item.profileId === userId)
  if (!account || account.password !== current) return fail('The current password is incorrect.')
  const accounts = db.accounts.map((item) => (item.profileId === userId ? { ...item, password } : item))
  return finish(audit({ ...db, accounts }, userId, 'auth.password', 'profile', userId, 'Password changed.'), 'Password updated. Sign in with the new password.')
}

export function updateOwnProfile(db: Database, userId: string, input: { fullName: string; phone: string; imageUrl?: string }): OpResult {
  const actor = activeProfile(db, userId)
  if (!actor.ok) return actor
  const parsed = profileSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the profile details.')
  const profile = {
    ...actor.profile,
    fullName: parsed.data.fullName,
    phone: parsed.data.phone,
    imageUrl: input.imageUrl === undefined ? actor.profile.imageUrl : input.imageUrl.trim() || undefined,
    updatedAt: now(),
  }
  return finish(audit(replaceProfile(db, profile), userId, 'profile.update', 'profile', userId, 'Profile details updated.'), 'Profile updated.')
}

export function createCategory(db: Database, userId: string, input: { name: string; description: string; isActive: boolean }): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const parsed = categorySchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the category.')
  if (db.categories.some((category) => category.name.toLowerCase() === parsed.data.name.toLowerCase())) {
    return fail('A category with that name already exists.')
  }
  const category = { id: uid(), ...parsed.data, createdAt: now(), updatedAt: now() }
  const next = audit({ ...db, categories: [...db.categories, category] }, userId, 'category.create', 'category', category.id, `Created category ${category.name}.`)
  return finish(next, 'Category created.')
}

export function updateCategory(db: Database, userId: string, categoryId: string, input: { name: string; description: string; isActive: boolean }): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const parsed = categorySchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the category.')
  const current = db.categories.find((category) => category.id === categoryId)
  if (!current) return fail('Category not found.')
  if (db.categories.some((category) => category.id !== categoryId && category.name.toLowerCase() === parsed.data.name.toLowerCase())) {
    return fail('A category with that name already exists.')
  }
  const categories = db.categories.map((category) => (category.id === categoryId ? { ...category, ...parsed.data, updatedAt: now() } : category))
  return finish(audit({ ...db, categories }, userId, 'category.update', 'category', categoryId, `Updated category ${parsed.data.name}.`), 'Category updated.')
}

export function deleteCategory(db: Database, userId: string, categoryId: string): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const current = db.categories.find((category) => category.id === categoryId)
  if (!current) return fail('Category not found.')
  const used = db.products.filter((product) => product.categoryId === categoryId).length
  if (used) return fail(`This category still has ${used} product${used === 1 ? '' : 's'}. Move or delete those products first.`)
  return finish(
    audit({ ...db, categories: db.categories.filter((category) => category.id !== categoryId) }, userId, 'category.delete', 'category', categoryId, `Deleted category ${current.name}.`),
    'Category deleted.',
  )
}

export function createUnit(db: Database, userId: string, input: { name: string; abbreviation: string }): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const parsed = unitSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the unit.')
  if (db.units.some((unit) => unit.name.toLowerCase() === parsed.data.name.toLowerCase())) return fail('That unit already exists.')
  const unit = { id: uid(), name: parsed.data.name, abbreviation: parsed.data.abbreviation }
  return finish(audit({ ...db, units: [...db.units, unit] }, userId, 'unit.create', 'unit', unit.id, `Added unit ${unit.name}.`), 'Unit added.')
}

export function deleteUnit(db: Database, userId: string, unitId: string): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const current = db.units.find((unit) => unit.id === unitId)
  if (!current) return fail('That unit could not be found.')
  const used = db.products.filter((product) => product.stockUnitId === unitId || product.receiveUnitId === unitId).length
  if (used) return fail(`This unit is still used by ${used} product${used === 1 ? '' : 's'}. Change those products first.`)
  return finish(
    audit({ ...db, units: db.units.filter((unit) => unit.id !== unitId) }, userId, 'unit.delete', 'unit', unitId, `Deleted unit ${current.name}.`),
    'Unit deleted.',
  )
}

export function createSupplier(db: Database, userId: string, input: { name: string; phone: string; imageUrl?: string }): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const parsed = supplierSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the supplier.')
  if (db.suppliers.some((supplier) => supplier.name.toLowerCase() === parsed.data.name.toLowerCase())) {
    return fail('That supplier already exists.')
  }
  const supplier = {
    id: uid(),
    name: parsed.data.name,
    phone: parsed.data.phone,
    imageUrl: input.imageUrl?.trim() || undefined,
    isActive: true,
    createdAt: now(),
  }
  return finish(audit({ ...db, suppliers: [...db.suppliers, supplier] }, userId, 'supplier.create', 'supplier', supplier.id, `Added supplier ${supplier.name}.`), 'Supplier added.')
}

export function updateSupplier(db: Database, userId: string, id: string, patch: { name?: string; phone?: string; imageUrl?: string }): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const current = db.suppliers.find((item) => item.id === id)
  if (!current) return fail('That supplier could not be found.')
  const name = patch.name?.trim() ?? current.name
  if (name.length < 2) return fail('Enter the supplier name.')
  if (db.suppliers.some((item) => item.id !== id && item.name.toLowerCase() === name.toLowerCase())) {
    return fail('That supplier already exists.')
  }
  const supplier = {
    ...current,
    name,
    phone: patch.phone ?? current.phone,
    imageUrl: patch.imageUrl === undefined ? current.imageUrl : patch.imageUrl.trim() || undefined,
  }
  return finish(
    audit({ ...db, suppliers: db.suppliers.map((item) => (item.id === id ? supplier : item)) }, userId, 'supplier.update', 'supplier', id, `Updated supplier ${supplier.name}.`),
    'Supplier updated.',
  )
}

export function deleteSupplier(db: Database, userId: string, id: string): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const supplier = db.suppliers.find((item) => item.id === id)
  if (!supplier) return fail('That supplier could not be found.')
  const next: Database = {
    ...db,
    suppliers: db.suppliers.filter((item) => item.id !== id),
    stockIns: db.stockIns.map((item) => (item.supplierId === id ? { ...item, supplierId: '' } : item)),
  }
  return finish(audit(next, userId, 'supplier.remove', 'supplier', id, `Removed supplier ${supplier.name}.`), 'Supplier removed.')
}

export function createProduct(db: Database, userId: string, input: ProductDraft): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const parsed = productSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the product details.')
  const name = parsed.data.name
  const sku = (parsed.data.sku ?? '').trim()
  if (db.products.some((product) => product.name.toLowerCase() === name.toLowerCase())) return fail('A product with that name already exists.')
  if (sku && db.products.some((product) => product.sku.toLowerCase() === sku.toLowerCase())) return fail('That SKU is already in use.')
  if (!db.categories.some((category) => category.id === parsed.data.categoryId)) return fail('Choose a valid category.')
  const product = {
    id: uid(),
    name,
    categoryId: parsed.data.categoryId,
    imageUrl: parsed.data.imageUrl || undefined,
    sku,
    stockUnitId: parsed.data.stockUnitId,
    receiveUnitId: parsed.data.receiveUnitId,
    conversionFactor: parsed.data.conversionFactor,
    costPrice: roundBuyingPrice(parsed.data.costPrice),
    sellingPrice: parsed.data.sellingPrice,
    sizeMode: parsed.data.sizeMode,
    sizes: parsed.data.sizes.map((size) => ({ ...size, cost: roundBuyingPrice(size.cost) })),
    cupPrice: parsed.data.cupPrice,
    halfPrice: parsed.data.halfPrice,
    minStock: parsed.data.minStock,
    isActive: parsed.data.isActive,
    createdAt: now(),
    updatedAt: now(),
  }
  return finish(audit({ ...db, products: [...db.products, product] }, userId, 'product.create', 'product', product.id, `Created product ${product.name}.`), 'Product created.')
}

export function updateProduct(db: Database, userId: string, productId: string, input: ProductDraft): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const parsed = productSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the product details.')
  const current = db.products.find((product) => product.id === productId)
  if (!current) return fail('Product not found.')
  const sku = (parsed.data.sku ?? '').trim()
  if (db.products.some((product) => product.id !== productId && product.name.toLowerCase() === parsed.data.name.toLowerCase())) {
    return fail('A product with that name already exists.')
  }
  if (sku && db.products.some((product) => product.id !== productId && product.sku.toLowerCase() === sku.toLowerCase())) {
    return fail('That SKU is already in use.')
  }
  if (!db.categories.some((category) => category.id === parsed.data.categoryId)) return fail('Choose a valid category.')
  const products = db.products.map((product) =>
    product.id === productId
      ? {
          ...product,
          name: parsed.data.name,
          categoryId: parsed.data.categoryId,
          imageUrl: parsed.data.imageUrl || undefined,
          sku,
          stockUnitId: parsed.data.stockUnitId,
          receiveUnitId: parsed.data.receiveUnitId,
          conversionFactor: parsed.data.conversionFactor,
          costPrice: roundBuyingPrice(parsed.data.costPrice),
          sellingPrice: Math.round(parsed.data.sellingPrice),
          sizeMode: parsed.data.sizeMode,
          sizes: parsed.data.sizes.map((size) => ({ ...size, cost: roundBuyingPrice(size.cost), price: Math.round(size.price) })),
          cupPrice: parsed.data.cupPrice,
          halfPrice: parsed.data.halfPrice,
          minStock: parsed.data.minStock,
          isActive: parsed.data.isActive,
          updatedAt: now(),
        }
      : product,
  )
  const saved = audit({ ...db, products }, userId, 'product.update', 'product', productId, `Updated product ${parsed.data.name}.`)
  const priced = applyPriceChange(saved, userId, {
    productId,
    day: dateKey(),
    costPrice: parsed.data.costPrice,
    sellingPrice: parsed.data.sellingPrice,
    sizes: parsed.data.sizeMode === 'many' ? parsed.data.sizes : undefined,
    cupPrice: parsed.data.cupPrice,
    halfPrice: parsed.data.halfPrice,
  })
  return priced.ok ? { ok: true, db: priced.db, message: 'Product updated.' } : finish(saved, 'Product updated.')
}

export function applyPriceChange(
  db: Database,
  userId: string,
  input: { productId: string; day: string; costPrice: number; sellingPrice: number; sizes?: Product['sizes']; cupPrice?: number | null; halfPrice?: number | null },
): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const product = db.products.find((item) => item.id === input.productId)
  if (!product) return fail('Product not found.')
  const day = input.day.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return fail('Choose a valid price-change date.')
  if (day > dateKey()) return fail('The price-change date cannot be in the future.')
  const costPrice = roundBuyingPrice(input.costPrice)
  const sellingPrice = Math.round(input.sellingPrice)
  if (!Number.isFinite(costPrice) || costPrice < 0 || !Number.isFinite(sellingPrice) || sellingPrice < 0) {
    return fail('Buying and selling prices must be zero or more.')
  }
  const existing = (db.priceChanges ?? []).find((item) => item.productId === product.id && item.effectiveDate === day)
  const record: ProductPriceChange = {
    id: existing?.id ?? uid(),
    productId: product.id,
    effectiveDate: day,
    costPrice,
    sellingPrice,
    createdBy: userId,
    createdAt: now(),
  }
  const priceChanges = [...(db.priceChanges ?? []).filter((item) => item.id !== record.id), record]
  const until = nextPriceChangeDate(priceChanges, product.id, day)
  const repriced = repriceDayCloses(db.dayCloses ?? [], product, day, costPrice, sellingPrice, until)
  const latest = latestPriceChange(priceChanges, product.id)
  const products = db.products.map((item) => {
    if (item.id !== product.id || !latest) return item
    const priced = applyCurrentPrices(
      item,
      latest.costPrice,
      latest.sellingPrice,
      latest.effectiveDate === day ? input.sizes : undefined,
    )
    return {
      ...priced,
      cupPrice: latest.effectiveDate === day && input.cupPrice !== undefined ? input.cupPrice : priced.cupPrice,
      halfPrice: latest.effectiveDate === day && input.halfPrice !== undefined ? input.halfPrice : priced.halfPrice,
      updatedAt: now(),
    }
  })
  const next = audit(
    { ...db, products, priceChanges, dayCloses: repriced.dayCloses },
    userId,
    'product.price_change',
    'product',
    product.id,
    `Price change for ${product.name} from ${day}. ${repriced.updated} COGS sheet${repriced.updated === 1 ? '' : 's'} updated.`,
  )
  return finish(next, `${product.name} prices saved. ${repriced.updated} COGS sheet${repriced.updated === 1 ? '' : 's'} updated.`)
}

function productHasHistory(db: Database, productId: string) {
  return (
    db.sales.some((sale) => sale.items.some((item) => item.productId === productId)) ||
    db.stockIns.some((entry) => entry.items.some((item) => item.productId === productId)) ||
    db.movements.some((movement) => movement.productId === productId)
  )
}

export function deleteProduct(db: Database, userId: string, productId: string): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const current = db.products.find((product) => product.id === productId)
  if (!current) return fail('Product not found.')
  if (productHasHistory(db, productId)) {
    const products = db.products.map((product) =>
      product.id === productId ? { ...product, isActive: false, updatedAt: now() } : product,
    )
    return finish(
      audit({ ...db, products }, userId, 'product.deactivate', 'product', productId, `Turned ${current.name} inactive because it has sales or stock records.`),
      'This product has sales or stock records, so it was turned inactive instead of deleted.',
    )
  }
  const next: Database = {
    ...db,
    products: db.products.filter((product) => product.id !== productId),
    availability: db.availability?.filter((row) => row.productId !== productId),
    notifications: db.notifications.map((note) =>
      note.dedupeKey === `low_stock:${productId}` || note.dedupeKey === `out_of_stock:${productId}`
        ? { ...note, resolvedAt: now() }
        : note,
    ),
  }
  return finish(audit(next, userId, 'product.delete', 'product', productId, `Deleted product ${current.name}.`), 'Product deleted.')
}

export function clearBusinessData(db: Database, userId: string): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const next: Database = {
    ...db,
    products: [],
    priceChanges: [],
    suppliers: [],
    stockIns: [],
    restockOrders: [],
    sales: [],
    movements: [],
    activities: [],
    expenses: [],
    dayCloses: [],
    notifications: [],
    auditLogs: [],
    availability: [],
    counters: { stockIn: 0, sale: 0, activity: 0, expense: 0, adjustment: 0 },
  }
  return finish(
    audit(next, userId, 'business.clear', 'settings', 'all', 'Cleared business operational data.'),
    'Business data cleared. Accounts, categories, units, and settings were kept.',
  )
}

export function createEmployee(db: Database, userId: string, input: EmployeeDraft): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const parsed = employeeSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the employee details.')
  const email = parsed.data.email.toLowerCase()
  const username = parsed.data.username.trim()
  if (db.profiles.some((profile) => profile.email.toLowerCase() === email || profile.username.toLowerCase() === username.toLowerCase())) {
    return fail('That email or username is already in use.')
  }
  const access = accessFromAssigned(parsed.data.assignedRole ?? 'employee', parsed.data)
  const id = uid()
  const profile: Profile = {
    id,
    fullName: parsed.data.fullName,
    username,
    email,
    phone: parsed.data.phone ?? '',
    role: access.role,
    staffTitle: access.staffTitle,
    isActive: true,
    canSubmitActivities: access.canSubmitActivities,
    canViewStock: access.canViewStock,
    canViewSuppliers: access.canViewSuppliers,
    createdAt: now(),
    updatedAt: now(),
  }
  let next: Database = {
    ...db,
    profiles: [...db.profiles, profile],
    accounts: [...db.accounts, { profileId: id, password: parsed.data.password }],
  }
  next = audit(next, userId, 'employee.create', 'profile', id, `Created employee account for ${profile.fullName}.`)
  return finish(next, 'Employee account created.', { temporaryPassword: parsed.data.password })
}

export function updateEmployee(db: Database, userId: string, employeeId: string, patch: EmployeePatch): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const current = db.profiles.find((profile) => profile.id === employeeId)
  if (!current) return fail('Staff account not found.')
  if (patch.isActive === false && employeeId === userId) return fail('You cannot deactivate your own account.')
  const nextAccess = patch.assignedRole
    ? accessFromAssigned(patch.assignedRole, {
        canSubmitActivities: patch.canSubmitActivities ?? current.canSubmitActivities,
        canViewStock: patch.canViewStock ?? current.canViewStock,
        canViewSuppliers: patch.canViewSuppliers ?? current.canViewSuppliers,
      })
    : null
  if (nextAccess && nextAccess.role !== 'admin' && current.role === 'admin' && current.isActive) {
    const otherAdmins = db.profiles.filter((profile) => profile.id !== employeeId && profile.role === 'admin' && profile.isActive).length
    if (!otherAdmins) return fail('Keep at least one administrator.')
  }
  const username = patch.username?.trim().toLowerCase()
  if (username) {
    const parsed = employeeSchema.shape.username.safeParse(patch.username)
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the username.')
    if (db.profiles.some((profile) => profile.id !== employeeId && profile.username.toLowerCase() === username)) {
      return fail('That username is already in use.')
    }
  }
  if (patch.password) {
    const parsed = passwordSchema.safeParse(patch.password)
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Choose a stronger password.')
  }
  const profile: Profile = {
    ...current,
    fullName: patch.fullName?.trim() || current.fullName,
    phone: patch.phone ?? current.phone,
    username: username || current.username,
    isActive: patch.isActive ?? current.isActive,
    role: nextAccess?.role ?? current.role,
    staffTitle: nextAccess?.staffTitle ?? current.staffTitle ?? 'staff',
    canSubmitActivities: nextAccess?.canSubmitActivities ?? patch.canSubmitActivities ?? current.canSubmitActivities,
    canViewStock: nextAccess?.canViewStock ?? patch.canViewStock ?? current.canViewStock,
    canViewSuppliers: nextAccess?.canViewSuppliers ?? patch.canViewSuppliers ?? current.canViewSuppliers ?? false,
    imageUrl: patch.imageUrl === undefined ? current.imageUrl : patch.imageUrl.trim() || undefined,
    updatedAt: now(),
  }
  if (profile.fullName.length < 2) return fail('Enter the employee name.')
  let next = replaceProfile(db, profile)
  if (patch.password) {
    next = {
      ...next,
      accounts: next.accounts.map((account) => (account.profileId === employeeId ? { ...account, password: patch.password as string } : account)),
    }
  }
  return finish(audit(next, userId, 'employee.update', 'profile', employeeId, `Updated ${assignedRoleOf(profile)} access for ${profile.fullName}.`), 'Staff updated.')
}

function employeeHasRecords(db: Database, employeeId: string) {
  return (
    db.sales.some((item) => item.submittedBy === employeeId || item.reviewedBy === employeeId) ||
    db.stockIns.some((item) => item.submittedBy === employeeId || item.reviewedBy === employeeId) ||
    db.activities.some((item) => item.submittedBy === employeeId || item.reviewedBy === employeeId) ||
    db.expenses.some((item) => item.submittedBy === employeeId || item.reviewedBy === employeeId) ||
    db.movements.some((item) => item.createdBy === employeeId)
  )
}

export function deleteEmployee(db: Database, userId: string, employeeId: string): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  if (employeeId === userId) return fail('You cannot delete your own account.')
  const current = db.profiles.find((profile) => profile.id === employeeId)
  if (!current) return fail('Staff account not found.')
  if (current.role === 'admin') return fail('Demote this administrator before deleting the account.')
  if (employeeHasRecords(db, employeeId)) {
    const profile = { ...current, isActive: false, updatedAt: now() }
    return finish(
      audit(replaceProfile(db, profile), userId, 'employee.deactivate', 'profile', employeeId, `Turned ${current.fullName} inactive because they have records.`),
      'This employee has sales or stock records, so the account was turned inactive instead of deleted.',
    )
  }
  const next: Database = {
    ...db,
    profiles: db.profiles.filter((profile) => profile.id !== employeeId),
    accounts: db.accounts.filter((account) => account.profileId !== employeeId),
    notifications: db.notifications.filter((note) => note.recipientId !== employeeId),
    auditLogs: db.auditLogs.map((entry) => (entry.actorId === employeeId ? { ...entry, actorId: '' } : entry)),
  }
  return finish(audit(next, userId, 'employee.delete', 'profile', employeeId, `Deleted employee ${current.fullName}.`), 'Employee deleted.')
}

function assertCorrection(db: Database, userId: string, kind: 'stockIns' | 'sales' | 'activities' | 'expenses', correctsId?: string) {
  if (!correctsId) return { ok: true as const }
  const record = db[kind].find((item) => item.id === correctsId)
  if (!record || record.submittedBy !== userId) return fail('The original submission could not be found.')
  if (record.status !== 'rejected' && record.status !== 'cancelled') {
    return fail('Only a rejected or withdrawn submission can be corrected.')
  }
  return { ok: true as const }
}

export function submitStockIn(db: Database, userId: string, draft: StockInDraft): OpResult {
  const actor = activeProfile(db, userId)
  if (!actor.ok) return actor
  const correction = assertCorrection(db, userId, 'stockIns', draft.correctsId)
  if (!correction.ok) return correction
  if (!draft.items.length) return fail('Add at least one product.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.deliveryDate) || draft.deliveryDate > dateKey()) {
    return fail('Enter a delivery date that is today or earlier.')
  }
  if (actor.profile.role !== 'admin' && !employeeDayOk(db, draft.deliveryDate)) {
    return fail(RECORD_WINDOW_FAIL)
  }
  const supplierName = draft.supplierName.trim()
  if (supplierName.length < 2) return fail('Enter the supplier.')
  if ((draft.notes ?? '').trim().length > 400) return fail('Notes are too long.')

  const items = []
  for (const line of draft.items) {
    const product = db.products.find((item) => item.id === line.productId && item.isActive)
    if (!product) return fail('Choose an active product.')
    if (!Number.isFinite(line.receivedQuantity) || line.receivedQuantity <= 0 || line.receivedQuantity > 100_000) {
      return fail(`Enter a valid quantity for ${product.name}.`)
    }
    if (!Number.isFinite(line.costPerStockUnit) || line.costPerStockUnit < 0 || line.costPerStockUnit > 100_000_000) {
      return fail(`Enter a valid cost for ${product.name}.`)
    }
    const stockQuantity = line.receivedQuantity * product.conversionFactor
    const sizeName: SaleSize = line.sizeName === 'small' || line.sizeName === 'medium' || line.sizeName === 'big' ? line.sizeName : 'one'
    const priced = pricedStockIn(line.costPerStockUnit, stockQuantity)
    items.push({
      id: uid(),
      productId: product.id,
      sizeName,
      receivedQuantity: line.receivedQuantity,
      receiveUnitId: product.receiveUnitId,
      conversionFactor: product.conversionFactor,
      stockQuantity,
      costPerStockUnit: priced.costPerStockUnit,
      totalCost: priced.totalCost,
    })
  }

  let suppliers = db.suppliers
  let supplier = suppliers.find((item) => item.name.toLowerCase() === supplierName.toLowerCase())
  if (!supplier) {
    supplier = { id: uid(), name: supplierName, phone: '', isActive: true, createdAt: now() }
    suppliers = [...suppliers, supplier]
  }
  const coded = takeCode({ ...db, suppliers }, 'stockIn', 'SI')
  const invoiceRef = allocateInvoiceRef(db.stockIns.map((item) => item.invoiceRef), draft.invoiceRef ?? '')
  const stamped = now()
  const transaction: StockInTransaction = {
    id: uid(),
    code: coded.code,
    supplierId: supplier.id,
    supplierName: supplier.name,
    deliveryDate: draft.deliveryDate,
    invoiceRef,
    notes: (draft.notes ?? '').trim(),
    status: invoiceRef && actor.profile.role === 'admin' ? 'approved' : 'pending',
    submittedBy: userId,
    submittedAt: stamped,
    reviewedBy: invoiceRef && actor.profile.role === 'admin' ? userId : undefined,
    reviewedAt: invoiceRef && actor.profile.role === 'admin' ? stamped : undefined,
    correctsId: draft.correctsId,
    items,
  }
  let next: Database = { ...coded.db, stockIns: [transaction, ...coded.db.stockIns] }
  if (invoiceRef && actor.profile.role === 'admin') {
    next = applyStockInApproval(next, transaction, stamped)
    next = audit(
      next,
      userId,
      'stock_in.auto_approve',
      'stock_in',
      transaction.id,
      `Approved delivery ${transaction.code} automatically because invoice ${invoiceRef} was provided.`,
    )
    next = notifyAdmins(next, {
      type: 'submission_approved',
      title: `${transaction.code} approved`,
      message: `${actor.profile.fullName} recorded ${transaction.code} with invoice ${invoiceRef}. Confirmed stock was updated.`,
      href: '/admin/stock-in',
    })
    return finish(next, `${transaction.code} approved. Confirmed stock was updated.`)
  }
  next = audit(next, userId, 'stock_in.submit', 'stock_in', transaction.id, `Submitted delivery ${transaction.code} for approval.`)
  next = notifyAdmins(next, {
    type: 'submission_pending',
    title: 'Stock delivery waiting for review',
    message: `${actor.profile.fullName} submitted ${transaction.code}. Confirmed stock will not change until you approve it.`,
    href: '/admin/approvals',
  })
  return finish(next, `${transaction.code} submitted for approval. Confirmed stock will not change until an administrator approves it.`)
}

function applyStockInApproval(db: Database, record: StockInTransaction, stamped: string, createdBy = record.submittedBy): Database {
  const movements: InventoryMovement[] = record.items.map((item) => ({
    id: uid(),
    productId: item.productId,
    type: 'stock_in',
    quantity: item.stockQuantity,
    unitCost: item.costPerStockUnit,
    referenceType: 'stock_in',
    referenceId: record.id,
    note: `Approved delivery ${record.code}`,
    createdBy,
    createdAt: stamped,
  }))
  return { ...db, movements: [...db.movements, ...movements] }
}

/** Pending deliveries that already have an invoice reference are approved once. */
export function approveInvoicedDeliveries(db: Database): Database {
  const waiting = db.stockIns.filter((item) => item.status === 'pending' && item.invoiceRef.trim().length > 0)
  if (!waiting.length) return db
  let next = db
  for (const record of waiting) {
    const stamped = now()
    const approved: StockInTransaction = { ...record, status: 'approved', reviewedBy: record.submittedBy, reviewedAt: stamped, rejectionReason: undefined }
    next = {
      ...next,
      stockIns: next.stockIns.map((item) => (item.id === record.id ? approved : item)),
    }
    next = applyStockInApproval(next, approved, stamped)
    next = audit(
      next,
      record.submittedBy,
      'stock_in.auto_approve',
      'stock_in',
      record.id,
      `Approved delivery ${record.code} automatically because invoice ${record.invoiceRef.trim()} was provided.`,
    )
    next = notifyAdmins(next, {
      type: 'submission_approved',
      title: `${record.code} approved`,
      message: `${record.code} had invoice ${record.invoiceRef.trim()}, so it was approved and added to confirmed stock.`,
      href: '/admin/stock-in',
    })
  }
  return syncStockAlerts(next)
}

export function approveRecordedSales(db: Database): Database {
  const waiting = db.sales.filter((sale) => sale.status === 'pending' && sale.recordKind !== 'bill')
  if (!waiting.length) return db
  let next = db
  for (const record of waiting) {
    const stamped = now()
    const taken = next.movements.some((movement) => movement.referenceType === 'sale' && movement.referenceId === record.id && movement.quantity < 0)
    const movements: InventoryMovement[] = taken
      ? []
      : record.items.map((item) => ({
          id: uid(),
          productId: item.productId,
          type: 'sale',
          quantity: -item.quantity,
          unitCost: item.unitCost,
          referenceType: 'sale',
          referenceId: record.id,
          note: `Sale ${record.code}`,
          createdBy: record.submittedBy,
          createdAt: stamped,
        }))
    next = {
      ...next,
      sales: next.sales.map((sale) => (sale.id === record.id ? { ...sale, status: 'approved' as const, reviewedBy: sale.submittedBy, reviewedAt: stamped, rejectionReason: undefined } : sale)),
      movements: [...next.movements, ...movements],
    }
  }
  return next
}

function buildSaleItems(db: Database, lines: SaleDraft['items']): { ok: true; items: SalesItem[]; totals: Map<string, number> } | { ok: false; error: string } {
  const merged = new Map<string, SalesItem>()
  const totals = new Map<string, number>()
  for (const line of lines) {
    const product = db.products.find((item) => item.id === line.productId && item.isActive)
    if (!product) return { ok: false, error: 'Choose an active product.' }
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 100_000) {
      return { ok: false, error: `Enter a valid quantity for ${product.name}.` }
    }
    const sizeName: SaleSize = line.sizeName === 'small' || line.sizeName === 'medium' || line.sizeName === 'big' ? line.sizeName : 'one'
    const portion = line.portion === 'cup' || line.portion === 'half' ? line.portion : 'full'
    const unitPrice = portionPrice(product, sizeName, portion)
    if (unitPrice == null) return { ok: false, error: `${product.name} is not sold in that size.` }
    const key = `${product.id}|${sizeName}|${portion}`
    const current = merged.get(key)
    merged.set(key, {
      id: current?.id ?? uid(),
      productId: product.id,
      quantity: (current?.quantity ?? 0) + line.quantity,
      unitPrice,
      unitCost: sizeCost(product, sizeName),
      sizeName,
      portion,
    })
    totals.set(product.id, (totals.get(product.id) ?? 0) + line.quantity)
  }
  if (!merged.size) return { ok: false, error: 'Add at least one product.' }
  return { ok: true, items: [...merged.values()], totals }
}

function takenForSale(db: Database, saleId: string) {
  return db.movements.some((movement) => movement.referenceType === 'sale' && movement.referenceId === saleId && movement.quantity < 0)
}

function returnSaleStock(db: Database, saleId: string, userId: string, stamped: string, note: string): InventoryMovement[] {
  return db.movements
    .filter((movement) => movement.referenceType === 'sale' && movement.referenceId === saleId && movement.quantity < 0)
    .map((movement) => ({
      id: uid(),
      productId: movement.productId,
      type: 'sale' as const,
      quantity: -movement.quantity,
      unitCost: movement.unitCost,
      referenceType: 'sale' as const,
      referenceId: saleId,
      note,
      createdBy: userId,
      createdAt: stamped,
    }))
}

export function submitSale(db: Database, userId: string, draft: SaleDraft): OpResult {
  const actor = activeProfile(db, userId)
  if (!actor.ok) return actor
  const correction = assertCorrection(db, userId, 'sales', draft.correctsId)
  if (!correction.ok) return correction
  if (!draft.items.length) return fail('Add at least one product.')
  const wroteBill = draft.recordKind === 'bill'
  const recordKind = wroteBill && draft.paymentStatus === 'paid' ? 'sale' : wroteBill ? 'bill' : 'sale'
  const customerName = wroteBill ? draft.customerName.trim() : ''
  if (wroteBill && (customerName.length < 2 || customerName.length > 80)) return fail('Enter the customer name.')
  if (wroteBill && draft.paymentStatus !== 'paid' && draft.paymentStatus !== 'unpaid') return fail('Mark the bill paid or unpaid.')
  if (!wroteBill && draft.paymentStatus !== 'paid') return fail('A sale can be recorded only when it is paid.')
  if (actor.profile.role !== 'admin' && db.settings.allowRemainingCount && recordKind === 'sale' && !wroteBill) {
    return fail('Sales are taken from remaining stock while that mode is on. Use Remaining stock.')
  }
  if ((draft.notes ?? '').trim().length > 400) return fail('Notes are too long.')

  const priced = buildSaleItems(db, draft.items)
  if (!priced.ok) return priced
  for (const [productId, quantity] of priced.totals) {
    const snap = snapshotFor(db, productId)
    if (quantity > snap.available) {
      const name = productName(db, productId)
      return fail(
        snap.reserved > 0
          ? `Only ${snap.available} of ${name} can be sold. ${snap.confirmed} are confirmed and ${snap.reserved} are reserved by pending sales.`
          : `Only ${snap.available} of ${name} can be sold.`,
      )
    }
  }

  const coded = takeCode(db, 'sale', 'SL')
  const stamped = now()
  const opened = new Date(draft.generatedAt ?? '')
  const openedOk = !Number.isNaN(opened.getTime()) && opened.getTime() <= Date.now() + 60_000
  const generatedAt = openedOk && (actor.profile.role === 'admin' || employeeDayOk(db, dateKey(opened)))
    ? opened.toISOString()
    : stamped
  const openBill = recordKind === 'bill'
  const transaction: SalesTransaction = {
    id: uid(),
    code: coded.code,
    customerName,
    paymentStatus: openBill ? 'unpaid' : 'paid',
    recordKind,
    generatedAt,
    notes: (draft.notes ?? '').trim(),
    status: openBill ? 'pending' : 'approved',
    submittedBy: userId,
    submittedAt: stamped,
    reviewedBy: openBill ? undefined : userId,
    reviewedAt: openBill ? undefined : stamped,
    correctsId: draft.correctsId,
    items: priced.items,
  }
  const stockMoves: InventoryMovement[] = transaction.items.map((item) => ({
    id: uid(),
    productId: item.productId,
    type: 'sale',
    quantity: -item.quantity,
    unitCost: item.unitCost,
    referenceType: 'sale',
    referenceId: transaction.id,
    note: recordKind === 'bill' ? `Bill ${transaction.code}` : `Sale ${transaction.code}`,
    createdBy: userId,
    createdAt: stamped,
  }))
  let next: Database = { ...coded.db, sales: [transaction, ...coded.db.sales], movements: [...coded.db.movements, ...stockMoves] }
  if (!openBill) {
    next = audit(next, userId, 'sale.approve', 'sale', transaction.id, wroteBill ? `Marked bill ${transaction.code} for ${customerName} as sold and recorded it as a sale. Stock was updated.` : `Recorded sale ${transaction.code}. Confirmed stock was updated.`)
    return finish(next, wroteBill ? `${transaction.code} is now a sale. Stock was updated.` : `${transaction.code} recorded. Confirmed stock was updated.`)
  }
  next = audit(next, userId, 'sale.submit', 'sale', transaction.id, `Saved bill ${transaction.code} for ${customerName}. Stock was updated. It stays a bill until it is marked sold.`)
  return finish(next, `${transaction.code} saved. Stock was updated. It stays in your bills until you mark it sold.`)
}

export function submitRemainingCount(db: Database, userId: string, lines: Array<{ productId: string; remaining: number; unitCost?: number | null }>): OpResult {
  const actor = activeProfile(db, userId)
  if (!actor.ok) return actor
  if (actor.profile.role !== 'admin' && !db.settings.allowRemainingCount) {
    return fail('The administrator has not opened remaining-stock count.')
  }
  if (!lines.length) return fail('Enter the remaining quantity for each product.')
  const items: SalesItem[] = []
  for (const line of lines) {
    const product = db.products.find((item) => item.id === line.productId && item.isActive)
    if (!product) return fail('Choose an active product.')
    const halfOk = Number.isFinite(line.remaining) && line.remaining >= 0 && Math.abs(line.remaining * 2 - Math.round(line.remaining * 2)) < 1e-6
    if (!halfOk) return fail(`Enter the remaining quantity for ${product.name} as a whole number or a half (for example 10.5).`)
    const snap = snapshotFor(db, product.id)
    if (line.remaining > snap.available) {
      return fail(`${product.name} has ${snap.available} available. Remaining cannot be higher.`)
    }
    const sold = snap.available - line.remaining
    if (sold <= 0) continue
    const unitCost = roundBuyingPrice(
      line.unitCost == null || !Number.isFinite(line.unitCost) || line.unitCost < 0 ? product.costPrice : line.unitCost,
    )
    items.push({
      id: uid(),
      productId: product.id,
      quantity: sold,
      unitPrice: product.sellingPrice,
      unitCost,
      sizeName: 'one',
      portion: 'full',
    })
  }
  if (!items.length) return fail('The remaining quantities match current stock. Nothing was sold.')
  const coded = takeCode(db, 'sale', 'SL')
  const stamped = now()
  const transaction: SalesTransaction = {
    id: uid(),
    code: coded.code,
    customerName: '',
    paymentStatus: 'paid',
    recordKind: 'sale',
    generatedAt: stamped,
    notes: 'Remaining stock count',
    status: 'approved',
    submittedBy: userId,
    submittedAt: stamped,
    reviewedBy: userId,
    reviewedAt: stamped,
    items,
  }
  const stockMoves: InventoryMovement[] = items.map((item) => ({
    id: uid(),
    productId: item.productId,
    type: 'sale',
    quantity: -item.quantity,
    unitCost: item.unitCost,
    referenceType: 'sale',
    referenceId: transaction.id,
    note: `Remaining count ${transaction.code}`,
    createdBy: userId,
    createdAt: stamped,
  }))
  const profit = items.reduce((sum, item) => sum + item.quantity * (item.unitPrice - item.unitCost), 0)
  let next: Database = { ...coded.db, sales: [transaction, ...coded.db.sales], movements: [...coded.db.movements, ...stockMoves] }
  next = audit(next, userId, 'sale.remaining', 'sale', transaction.id, `Recorded remaining stock as sale ${transaction.code}.`)
  next = notifyAdmins(next, {
    type: 'submission_approved',
    title: `${transaction.code} remaining stock report`,
    message: `${actor.profile.fullName} sent a remaining-stock report. ${transaction.code}: ${items.reduce((sum, item) => sum + item.quantity, 0)} sold, profit ${profit}. Open Remaining stock to review and download it.`,
    href: '/admin/remaining',
  })
  return finish(next, `${transaction.code} recorded from remaining stock. Estimated profit ${profit}.`, { id: transaction.id })
}

export function setBillPayment(db: Database, userId: string, transactionId: string, paymentStatus: SalesTransaction['paymentStatus']): OpResult {
  const actor = activeProfile(db, userId)
  if (!actor.ok) return actor
  const record = db.sales.find((item) => item.id === transactionId)
  if (!record) return fail('Bill not found.')
  if (record.recordKind !== 'bill') return fail('This is already a sale.')
  if (paymentStatus !== 'paid') return fail('Mark the bill sold when the customer has paid.')
  if (record.status === 'rejected' || record.status === 'cancelled') return fail('This bill can no longer be changed.')
  if (actor.profile.role !== 'admin' && record.submittedBy !== userId) return fail('Bill not found.')
  const stamped = now()
  const taken = takenForSale(db, record.id)
  const movements: InventoryMovement[] = taken
    ? []
    : record.items.map((item) => ({
        id: uid(),
        productId: item.productId,
        type: 'sale' as const,
        quantity: -item.quantity,
        unitCost: item.unitCost,
        referenceType: 'sale' as const,
        referenceId: record.id,
        note: `Sale ${record.code}`,
        createdBy: userId,
        createdAt: stamped,
      }))
  const sales = db.sales.map((item) =>
    item.id === transactionId
      ? { ...item, recordKind: 'sale' as const, paymentStatus: 'paid' as const, status: 'approved' as const, isLoss: false, reviewedBy: userId, reviewedAt: stamped, rejectionReason: undefined }
      : item,
  )
  const remaining = saleTotal(record.items) - (record.amountPaid ?? 0)
  const next = audit(
    applyCogsDebtPayment({ ...db, sales, movements: [...db.movements, ...movements] }, record.submittedBy, record.generatedAt, record.customerName, remaining, actor.profile.role === 'admin'),
    userId,
    'sale.payment',
    'sale',
    transactionId,
    `Marked ${record.code} for ${record.customerName || 'a customer'} as sold. It is now a sale.`,
  )
  return finish(next, `${record.code} is now a sale.`)
}

export function recordBillPayment(db: Database, userId: string, transactionId: string, amount: number): OpResult {
  const actor = activeProfile(db, userId)
  if (!actor.ok) return actor
  const record = db.sales.find((item) => item.id === transactionId)
  if (!record) return fail('Bill not found.')
  if (record.recordKind !== 'bill') return fail('This is already a sale.')
  if (record.status === 'rejected' || record.status === 'cancelled') return fail('This bill can no longer be changed.')
  if (actor.profile.role !== 'admin' && record.submittedBy !== userId) return fail('Bill not found.')
  if (!Number.isInteger(amount) || amount < 1) return fail('Enter the amount paid.')
  const remaining = saleTotal(record.items) - (record.amountPaid ?? 0)
  if (amount > remaining) return fail('The amount is more than the remaining balance.')
  const coded = takeCode(db, 'sale', 'SL')
  const stamped = now()
  const payment: SalesTransaction = {
    id: uid(),
    code: coded.code,
    customerName: record.customerName,
    paymentStatus: 'paid',
    recordKind: 'sale',
    generatedAt: stamped,
    notes: `Payment toward ${record.code}`,
    status: 'approved',
    submittedBy: userId,
    submittedAt: stamped,
    reviewedBy: userId,
    reviewedAt: stamped,
    settledAmount: amount,
    sourceBillId: record.id,
    items: [],
  }
  const sales = coded.db.sales.map((item) => (item.id === record.id ? { ...item, amountPaid: (item.amountPaid ?? 0) + amount } : item))
  const left = remaining - amount
  const next = audit(
    applyCogsDebtPayment({ ...coded.db, sales: [payment, ...sales] }, record.submittedBy, record.generatedAt, record.customerName, amount, actor.profile.role === 'admin'),
    userId,
    'sale.payment',
    'sale',
    payment.id,
    `Recorded ${amount} paid on ${record.code} for ${record.customerName || 'a customer'}. ${left} remains on the bill.`,
  )
  return finish(next, left > 0 ? `${coded.code} added to sales. ${left} remains on the bill.` : `${coded.code} added to sales. This bill is fully paid.`)
}

export function appendBillItem(db: Database, userId: string, transactionId: string, line: SaleDraft['items'][number]): OpResult {
  const actor = activeProfile(db, userId)
  if (!actor.ok) return actor
  const record = db.sales.find((item) => item.id === transactionId)
  if (!record) return fail('Bill not found.')
  if (record.recordKind !== 'bill') return fail('This is already a sale.')
  if (record.status === 'rejected' || record.status === 'cancelled') return fail('This bill can no longer be changed.')
  if (actor.profile.role !== 'admin' && record.submittedBy !== userId) return fail('Bill not found.')
  const product = db.products.find((item) => item.id === line.productId && item.isActive)
  if (!product) return fail('Choose an active product.')
  if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 100_000) return fail(`Enter a valid quantity for ${product.name}.`)
  const sizeName: SaleSize = line.sizeName === 'small' || line.sizeName === 'medium' || line.sizeName === 'big' ? line.sizeName : 'one'
  const portion = line.portion === 'cup' || line.portion === 'half' ? line.portion : 'full'
  const unitPrice = portionPrice(product, sizeName, portion)
  if (unitPrice == null) return fail(`${product.name} is not sold in that size.`)
  const snap = snapshotFor(db, product.id)
  if (line.quantity > snap.available) {
    return fail(snap.available < 1 ? `${product.name} is not in stock.` : `Only ${snap.available} of ${product.name} can be added.`)
  }
  const stamped = now()
  const item: SalesItem = {
    id: uid(),
    productId: product.id,
    quantity: line.quantity,
    unitPrice,
    unitCost: sizeCost(product, sizeName),
    sizeName,
    portion,
  }
  const movement: InventoryMovement = {
    id: uid(),
    productId: product.id,
    type: 'sale',
    quantity: -line.quantity,
    unitCost: item.unitCost,
    referenceType: 'sale',
    referenceId: record.id,
    note: `Bill ${record.code}`,
    createdBy: userId,
    createdAt: stamped,
  }
  const sales = db.sales.map((entry) => (entry.id === record.id ? { ...entry, items: [...entry.items, item] } : entry))
  const next = audit(
    { ...db, sales, movements: [...db.movements, movement] },
    userId,
    'sale.edit',
    'sale',
    record.id,
    `Added ${line.quantity} of ${product.name} to bill ${record.code}. Stock was updated.`,
  )
  return finish(next, `${product.name} added to ${record.code}. Stock was updated.`)
}

export function editSale(db: Database, userId: string, transactionId: string, draft: SaleDraft): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const record = db.sales.find((item) => item.id === transactionId)
  if (!record) return fail('Bill not found.')
  if (record.status !== 'pending' && record.status !== 'approved') return fail('This bill can no longer be edited.')
  if (!draft.items.length) return fail('Add at least one product.')
  const customerName = record.recordKind === 'bill' ? draft.customerName.trim() : ''
  if (record.recordKind === 'bill' && (customerName.length < 2 || customerName.length > 80)) return fail('Enter the customer name.')
  if (record.recordKind === 'bill' && draft.paymentStatus !== 'paid' && draft.paymentStatus !== 'unpaid') return fail('Mark the bill paid or unpaid.')
  if (record.recordKind !== 'bill' && draft.paymentStatus !== 'paid') return fail('A sale can be recorded only when it is paid.')
  if ((draft.notes ?? '').trim().length > 400) return fail('Notes are too long.')

  const priced = buildSaleItems(db, draft.items)
  if (!priced.ok) return priced
  const rewriteStock = record.status === 'approved' || record.recordKind === 'bill'
  const comparable: Database = {
    ...db,
    sales: db.sales.filter((item) => item.id !== record.id),
    movements: rewriteStock ? db.movements.filter((item) => !(item.referenceType === 'sale' && item.referenceId === record.id)) : db.movements,
  }
  for (const [productId, quantity] of priced.totals) {
    const snap = snapshotFor(comparable, productId)
    if (quantity > snap.available) {
      return fail(`Only ${snap.available} of ${productName(db, productId)} can be sold.`)
    }
  }
  const items = priced.items
  const updated: SalesTransaction = { ...record, customerName, paymentStatus: record.recordKind === 'bill' && draft.paymentStatus === 'unpaid' ? 'unpaid' : 'paid', notes: (draft.notes ?? '').trim(), items }
  let next: Database = { ...comparable, sales: db.sales.map((item) => (item.id === record.id ? updated : item)) }
  if (rewriteStock) {
    const stamped = now()
    const movements: InventoryMovement[] = items.map((item) => ({
      id: uid(),
      productId: item.productId,
      type: 'sale',
      quantity: -item.quantity,
      unitCost: item.unitCost,
      referenceType: 'sale',
      referenceId: record.id,
      note: `Approved sale ${record.code}`,
      createdBy: userId,
      createdAt: stamped,
    }))
    next = { ...next, movements: [...next.movements, ...movements] }
  }
  next = audit(next, userId, 'sale.edit', 'sale', record.id, `Edited bill ${record.code}. The generated time was left unchanged.`)
  return finish(next, `${record.code} updated. The generated time was left unchanged.`)
}

export function editStockIn(db: Database, userId: string, transactionId: string, draft: StockInDraft): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const record = db.stockIns.find((item) => item.id === transactionId)
  if (!record) return fail('Delivery not found.')
  if (record.status !== 'pending' && record.status !== 'approved') return fail('This delivery can no longer be edited.')
  if (!draft.items.length) return fail('Add at least one product.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.deliveryDate) || draft.deliveryDate > dateKey()) {
    return fail('Enter a delivery date that is today or earlier.')
  }
  const supplierName = draft.supplierName.trim()
  if (supplierName.length < 2) return fail('Enter the supplier.')
  if ((draft.notes ?? '').trim().length > 400) return fail('Notes are too long.')

  const items = []
  for (const line of draft.items) {
    const product = db.products.find((item) => item.id === line.productId && item.isActive)
    if (!product) return fail('Choose an active product.')
    if (!Number.isFinite(line.receivedQuantity) || line.receivedQuantity <= 0 || line.receivedQuantity > 100_000) {
      return fail(`Enter a valid quantity for ${product.name}.`)
    }
    if (!Number.isFinite(line.costPerStockUnit) || line.costPerStockUnit < 0 || line.costPerStockUnit > 100_000_000) {
      return fail(`Enter a valid cost for ${product.name}.`)
    }
    const stockQuantity = line.receivedQuantity * product.conversionFactor
    const sizeName: SaleSize = line.sizeName === 'small' || line.sizeName === 'medium' || line.sizeName === 'big' ? line.sizeName : 'one'
    const priced = pricedStockIn(line.costPerStockUnit, stockQuantity)
    items.push({
      id: uid(),
      productId: product.id,
      sizeName,
      receivedQuantity: line.receivedQuantity,
      receiveUnitId: product.receiveUnitId,
      conversionFactor: product.conversionFactor,
      stockQuantity,
      costPerStockUnit: priced.costPerStockUnit,
      totalCost: priced.totalCost,
    })
  }

  const movements = record.status === 'approved'
    ? db.movements.filter((item) => !(item.referenceType === 'stock_in' && item.referenceId === record.id))
    : db.movements
  const touched = new Set([...record.items.map((item) => item.productId), ...items.map((item) => item.productId)])
  for (const productId of touched) {
    const snap = snapshotFor({ ...db, movements }, productId)
    const adding = items.find((item) => item.productId === productId)?.stockQuantity ?? 0
    if (snap.available + adding < 0) return fail(`That change would take ${productName(db, productId)} below pending sales.`)
  }

  let suppliers = db.suppliers
  let supplier = suppliers.find((item) => item.name.toLowerCase() === supplierName.toLowerCase())
  if (!supplier) {
    supplier = { id: uid(), name: supplierName, phone: '', isActive: true, createdAt: now() }
    suppliers = [...suppliers, supplier]
  }
  const updated: StockInTransaction = {
    ...record,
    supplierId: supplier.id,
    supplierName: supplier.name,
    deliveryDate: draft.deliveryDate,
    notes: (draft.notes ?? '').trim(),
    items,
  }
  let next: Database = {
    ...db,
    suppliers,
    movements,
    stockIns: db.stockIns.map((item) => (item.id === record.id ? updated : item)),
  }
  if (record.status === 'approved') next = applyStockInApproval(next, updated, now(), userId)
  next = audit(next, userId, 'stock_in.edit', 'stock_in', record.id, `Edited delivery ${record.code}. Invoice ${record.invoiceRef} was left unchanged.`)
  return finish(next, `${record.code} updated. Invoice ${record.invoiceRef} was left unchanged.`)
}

export function submitExpense(db: Database, userId: string, draft: ExpenseDraft): OpResult {
  const actor = activeProfile(db, userId)
  if (!actor.ok) return actor
  const correction = assertCorrection(db, userId, 'expenses', draft.correctsId)
  if (!correction.ok) return correction
  const description = draft.description.trim()
  if (description.length < 2 || description.length > 120) return fail('Describe the expense.')
  if (!Number.isInteger(draft.amount) || draft.amount < 1 || draft.amount > 100_000_000) return fail('Enter the amount spent.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.spentOn) || draft.spentOn > dateKey()) {
    return fail('Enter a date that is today or earlier.')
  }
  if (actor.profile.role !== 'admin' && !employeeDayOk(db, draft.spentOn)) {
    return fail(RECORD_WINDOW_FAIL)
  }
  if ((draft.notes ?? '').trim().length > 400) return fail('Notes are too long.')

  const admin = actor.profile.role === 'admin'
  const coded = takeCode(db, 'expense', 'EX')
  const stamped = now()
  const transaction: ExpenseTransaction = {
    id: uid(),
    code: coded.code,
    description,
    amount: draft.amount,
    spentOn: draft.spentOn,
    notes: (draft.notes ?? '').trim(),
    status: admin ? 'approved' : 'pending',
    submittedBy: userId,
    submittedAt: stamped,
    reviewedBy: admin ? userId : undefined,
    reviewedAt: admin ? stamped : undefined,
    correctsId: draft.correctsId,
  }
  let next = audit(
    { ...coded.db, expenses: [transaction, ...(coded.db.expenses ?? [])] },
    userId,
    admin ? 'expense.approve' : 'expense.submit',
    'expense',
    transaction.id,
    admin ? `Recorded and approved expense ${transaction.code}: ${description}.` : `Submitted expense ${transaction.code}: ${description}.`,
  )
  if (!admin) {
    next = notifyAdmins(next, {
      type: 'submission_pending',
      title: 'Expense waiting for review',
      message: `${actor.profile.fullName} submitted ${transaction.code} for ${description}.`,
      href: '/admin/approvals',
    })
  }
  return finish(next, admin ? `${transaction.code} recorded.` : `${transaction.code} submitted for approval.`)
}

export function submitActivity(db: Database, userId: string, draft: ActivityDraft): OpResult {
  const actor = activeProfile(db, userId)
  if (!actor.ok) return actor
  if (!actor.profile.canSubmitActivities) return fail('You are not allowed to record pool table or korokoro income.')
  const correction = assertCorrection(db, userId, 'activities', draft.correctsId)
  if (!correction.ok) return correction
  const activityType = db.activityTypes.find((item) => item.id === draft.activityTypeId && item.isActive)
  if (!activityType) return fail('Choose an active income type.')
  if (!Number.isInteger(draft.quantity) || draft.quantity < 1 || draft.quantity > 100_000) return fail('Enter a valid quantity.')
  if (!Number.isInteger(draft.amount) || draft.amount < 0 || draft.amount > 100_000_000) return fail('Enter the amount collected.')
  const occurred = new Date(draft.occurredAt)
  if (Number.isNaN(occurred.getTime()) || occurred.getTime() > Date.now() + 60_000) {
    return fail('Enter a date and time that is not in the future.')
  }
  if (!['cash', 'mobile_money', 'card', 'other'].includes(draft.paymentMethod)) return fail('Choose a payment method.')
  if ((draft.notes ?? '').trim().length > 400) return fail('Notes are too long.')

  const coded = takeCode(db, 'activity', 'AC')
  const transaction: ActivityTransaction = {
    id: uid(),
    code: coded.code,
    activityTypeId: activityType.id,
    quantity: draft.quantity,
    unitPrice: activityType.unitPrice,
    amount: draft.amount,
    paymentMethod: draft.paymentMethod,
    notes: (draft.notes ?? '').trim(),
    occurredAt: occurred.toISOString(),
    status: 'pending',
    submittedBy: userId,
    submittedAt: now(),
    correctsId: draft.correctsId,
  }
  let next = audit(
    { ...coded.db, activities: [transaction, ...coded.db.activities] },
    userId,
    'activity.submit',
    'activity',
    transaction.id,
    `Submitted ${activityType.name.toLowerCase()} collection ${transaction.code} for approval.`,
  )
  next = notifyAdmins(next, {
    type: 'submission_pending',
    title: `${activityType.name} income waiting for review`,
    message: `${actor.profile.fullName} submitted ${transaction.code}. This does not change beverage stock.`,
    href: '/admin/approvals',
  })
  return finish(next, `${transaction.code} submitted for approval.`)
}

function pendingRecord<T extends { id: string; status: string; submittedBy: string }>(records: T[], id: string) {
  const record = records.find((item) => item.id === id)
  if (!record) return { ok: false as const, error: 'Submission not found.' }
  if (record.status !== 'pending') return { ok: false as const, error: 'This submission has already been reviewed.' }
  return { ok: true as const, record }
}

export function approveStockIn(db: Database, userId: string, transactionId: string): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const found = pendingRecord(db.stockIns, transactionId)
  if (!found.ok) return found
  if (found.record.submittedBy === userId) return fail('You cannot review a submission you created.')
  const stamped = now()
  const approved: StockInTransaction = { ...found.record, status: 'approved', reviewedBy: userId, reviewedAt: stamped, rejectionReason: undefined }
  const stockIns = db.stockIns.map((item) => (item.id === transactionId ? approved : item))
  let next: Database = applyStockInApproval({ ...db, stockIns }, approved, stamped, userId)
  next = audit(next, userId, 'stock_in.approve', 'stock_in', transactionId, `Approved delivery ${found.record.code} and updated confirmed stock.`)
  next = notify(next, found.record.submittedBy, {
    type: 'submission_approved',
    title: `${found.record.code} approved`,
    message: 'Your stock delivery was approved and added to confirmed inventory.',
    href: '/employee/submissions',
  })
  return finish(next, `${found.record.code} approved. Confirmed stock was updated.`)
}

export function rejectStockIn(db: Database, userId: string, transactionId: string, reason: string): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const found = pendingRecord(db.stockIns, transactionId)
  if (!found.ok) return found
  if (found.record.submittedBy === userId) return fail('You cannot review a submission you created.')
  const clean = reason.trim()
  if (clean.length < 3) return fail('Enter a rejection reason.')
  const stamped = now()
  const stockIns = db.stockIns.map((item) =>
    item.id === transactionId ? { ...item, status: 'rejected' as const, reviewedBy: userId, reviewedAt: stamped, rejectionReason: clean } : item,
  )
  let next = audit({ ...db, stockIns }, userId, 'stock_in.reject', 'stock_in', transactionId, `Rejected delivery ${found.record.code}. ${clean}`)
  next = notify(next, found.record.submittedBy, {
    type: 'submission_rejected',
    title: `${found.record.code} was rejected`,
    message: clean,
    href: '/employee/submissions',
  })
  return finish(next, `${found.record.code} rejected. Confirmed stock was not changed.`)
}

export function approveSale(db: Database, userId: string, transactionId: string): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const found = pendingRecord(db.sales, transactionId)
  if (!found.ok) return found
  if (found.record.submittedBy === userId) return fail('You cannot review a submission you created.')
  if (found.record.recordKind === 'bill' && found.record.paymentStatus !== 'paid' && unpaidBillHeld(found.record)) {
    return fail('This unpaid bill is sent to you after three days.')
  }
  const deducted = takenForSale(db, found.record.id)
  const stamped = now()
  const movements: InventoryMovement[] = []
  if (!deducted) {
    for (const item of found.record.items) {
      const confirmed = db.movements.reduce((sum, movement) => (movement.productId === item.productId ? sum + movement.quantity : sum), 0)
      if (item.quantity > confirmed) {
        return fail(`Not enough confirmed stock for ${productName(db, item.productId)}. Nothing was changed.`)
      }
    }
    for (const item of found.record.items) {
      movements.push({
        id: uid(),
        productId: item.productId,
        type: 'sale',
        quantity: -item.quantity,
        unitCost: item.unitCost,
        referenceType: 'sale',
        referenceId: found.record.id,
        note: `Approved sale ${found.record.code}`,
        createdBy: userId,
        createdAt: stamped,
      })
    }
  }
  const sales = db.sales.map((item) =>
    item.id === transactionId
      ? {
          ...item,
          status: 'approved' as const,
          paymentStatus: item.recordKind === 'bill' ? 'paid' as const : item.paymentStatus,
          isLoss: false,
          reviewedBy: userId,
          reviewedAt: stamped,
          rejectionReason: undefined,
        }
      : item,
  )
  let next: Database = { ...db, sales, movements: [...db.movements, ...movements] }
  next = audit(next, userId, 'sale.approve', 'sale', transactionId, `Approved ${found.record.code}${deducted ? '. Stock was already updated when the bill was written.' : ' and reduced confirmed stock.'}`)
  next = notify(next, found.record.submittedBy, {
    type: 'submission_approved',
    title: `${found.record.code} approved`,
    message: deducted ? 'Your bill was approved as paid. Stock was already updated when it was written.' : 'Your sale was approved and removed from confirmed stock.',
    href: '/employee/submissions',
  })
  return finish(next, deducted ? `${found.record.code} approved as paid. Stock was already updated.` : `${found.record.code} approved. Confirmed stock was updated.`)
}

export function recordBillLoss(db: Database, userId: string, transactionId: string): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const found = pendingRecord(db.sales, transactionId)
  if (!found.ok) return found
  if (found.record.recordKind !== 'bill') return fail('Only a bill can be recorded as a loss.')
  if (found.record.submittedBy === userId) return fail('You cannot review a submission you created.')
  if (unpaidBillHeld(found.record)) return fail('This unpaid bill is sent to you after three days.')
  const stamped = now()
  const sales = db.sales.map((item) =>
    item.id === transactionId
      ? { ...item, status: 'approved' as const, paymentStatus: 'unpaid' as const, isLoss: true, reviewedBy: userId, reviewedAt: stamped, rejectionReason: undefined }
      : item,
  )
  let next = audit({ ...db, sales }, userId, 'sale.loss', 'sale', transactionId, `Recorded ${found.record.code} as a loss. Stock stays deducted and it is not counted as revenue.`)
  next = notify(next, found.record.submittedBy, {
    type: 'submission_approved',
    title: `${found.record.code} recorded as a loss`,
    message: 'The administrator recorded this unpaid bill as a loss. The stock stays deducted.',
    href: '/employee/submissions',
  })
  return finish(next, `${found.record.code} recorded as a loss. It is not counted as revenue.`)
}

export function escalateOverdueBills(db: Database): Database {
  let next = db
  let changed = false
  for (const sale of db.sales) {
    if (!overdueUnpaidBill(sale)) continue
    const key = `bill-overdue-${sale.id}`
    if (next.notifications.some((item) => item.dedupeKey === key)) continue
    next = notifyAdmins(next, {
      type: 'submission_pending',
      title: `${sale.code} unpaid for three days`,
      message: `${sale.code} for ${sale.customerName || 'a customer'} has been unpaid for three days. Approve it as paid or record it as a loss.`,
      href: '/admin/approvals',
      dedupeKey: key,
    })
    changed = true
  }
  return changed ? next : db
}

export function rejectSale(db: Database, userId: string, transactionId: string, reason: string): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const found = pendingRecord(db.sales, transactionId)
  if (!found.ok) return found
  if (found.record.submittedBy === userId) return fail('You cannot review a submission you created.')
  const clean = reason.trim()
  if (clean.length < 3) return fail('Enter a rejection reason.')
  const stamped = now()
  const sales = db.sales.map((item) =>
    item.id === transactionId ? { ...item, status: 'rejected' as const, reviewedBy: userId, reviewedAt: stamped, rejectionReason: clean } : item,
  )
  const returned = returnSaleStock(db, found.record.id, userId, stamped, `Returned stock for rejected ${found.record.code}`)
  let next = audit({ ...db, sales, movements: [...db.movements, ...returned] }, userId, 'sale.reject', 'sale', transactionId, `Rejected sale ${found.record.code}. Stock reserved or deducted for this bill was put back. ${clean}`)
  next = notify(next, found.record.submittedBy, {
    type: 'submission_rejected',
    title: `${found.record.code} was rejected`,
    message: clean,
    href: '/employee/submissions',
  })
  return finish(next, `${found.record.code} rejected. Reserved stock was released.`)
}

export function approveExpense(db: Database, userId: string, transactionId: string): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const found = pendingRecord(db.expenses, transactionId)
  if (!found.ok) return found
  if (found.record.submittedBy === userId) return fail('You cannot review a submission you created.')
  const stamped = now()
  const expenses = db.expenses.map((item) =>
    item.id === transactionId ? { ...item, status: 'approved' as const, reviewedBy: userId, reviewedAt: stamped, rejectionReason: undefined } : item,
  )
  let next = audit({ ...db, expenses }, userId, 'expense.approve', 'expense', transactionId, `Approved expense ${found.record.code}. Stock was not changed.`)
  next = notify(next, found.record.submittedBy, {
    type: 'submission_approved',
    title: `${found.record.code} approved`,
    message: 'Your expense was approved.',
    href: '/employee/submissions',
  })
  return finish(next, `${found.record.code} approved.`)
}

export function rejectExpense(db: Database, userId: string, transactionId: string, reason: string): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const found = pendingRecord(db.expenses, transactionId)
  if (!found.ok) return found
  if (found.record.submittedBy === userId) return fail('You cannot review a submission you created.')
  const clean = reason.trim()
  if (clean.length < 3) return fail('Enter a rejection reason.')
  const stamped = now()
  const expenses = db.expenses.map((item) =>
    item.id === transactionId ? { ...item, status: 'rejected' as const, reviewedBy: userId, reviewedAt: stamped, rejectionReason: clean } : item,
  )
  let next = audit({ ...db, expenses }, userId, 'expense.reject', 'expense', transactionId, `Rejected expense ${found.record.code}. ${clean}`)
  next = notify(next, found.record.submittedBy, {
    type: 'submission_rejected',
    title: `${found.record.code} was rejected`,
    message: clean,
    href: '/employee/submissions',
  })
  return finish(next, `${found.record.code} rejected.`)
}

export function approveActivity(db: Database, userId: string, transactionId: string): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const found = pendingRecord(db.activities, transactionId)
  if (!found.ok) return found
  if (found.record.submittedBy === userId) return fail('You cannot review a submission you created.')
  const stamped = now()
  const activities = db.activities.map((item) =>
    item.id === transactionId ? { ...item, status: 'approved' as const, reviewedBy: userId, reviewedAt: stamped, rejectionReason: undefined } : item,
  )
  let next = audit({ ...db, activities }, userId, 'activity.approve', 'activity', transactionId, `Approved income ${found.record.code}. Beverage stock was not changed.`)
  next = notify(next, found.record.submittedBy, {
    type: 'submission_approved',
    title: `${found.record.code} approved`,
    message: 'Your income record was approved. Beverage stock was not changed.',
    href: '/employee/submissions',
  })
  return finish(next, `${found.record.code} approved.`)
}

export function rejectActivity(db: Database, userId: string, transactionId: string, reason: string): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const found = pendingRecord(db.activities, transactionId)
  if (!found.ok) return found
  if (found.record.submittedBy === userId) return fail('You cannot review a submission you created.')
  const clean = reason.trim()
  if (clean.length < 3) return fail('Enter a rejection reason.')
  const stamped = now()
  const activities = db.activities.map((item) =>
    item.id === transactionId ? { ...item, status: 'rejected' as const, reviewedBy: userId, reviewedAt: stamped, rejectionReason: clean } : item,
  )
  let next = audit({ ...db, activities }, userId, 'activity.reject', 'activity', transactionId, `Rejected income ${found.record.code}. ${clean}`)
  next = notify(next, found.record.submittedBy, {
    type: 'submission_rejected',
    title: `${found.record.code} was rejected`,
    message: clean,
    href: '/employee/submissions',
  })
  return finish(next, `${found.record.code} rejected.`)
}

export function cancelSubmission(db: Database, userId: string, kind: 'stock_in' | 'sale' | 'activity' | 'expense', id: string, reason: string): OpResult {
  const actor = activeProfile(db, userId)
  if (!actor.ok) return actor
  const note = reason.trim()
  if (note.length < 3 || note.length > 400) return fail('Write why you are cancelling. Use at least 3 characters.')
  const stamped = now()
  const message = `${actor.profile.fullName} cancelled this submission. ${note}`
  if (kind === 'stock_in') {
    const record = db.stockIns.find((item) => item.id === id)
    if (!record || record.submittedBy !== userId) return fail('Submission not found.')
    if (record.status !== 'pending') return fail('Only a pending submission can be cancelled.')
    const stockIns = db.stockIns.map((item) => (item.id === id ? { ...item, status: 'cancelled' as const, reviewedAt: stamped, rejectionReason: note } : item))
    let next = audit({ ...db, stockIns }, userId, 'stock_in.cancel', 'stock_in', id, `Cancelled delivery ${record.code}. ${note}`)
    next = notifyAdmins(next, { type: 'submission_cancelled', title: `${record.code} cancelled`, message, href: '/admin/approvals' })
    return finish(next, `${record.code} cancelled.`)
  }
  if (kind === 'sale') {
    const record = db.sales.find((item) => item.id === id)
    if (!record || record.submittedBy !== userId) return fail('Submission not found.')
    if (record.status !== 'pending') return fail('Only a pending submission can be cancelled.')
    const sales = db.sales.map((item) => (item.id === id ? { ...item, status: 'cancelled' as const, reviewedAt: stamped, rejectionReason: note } : item))
    const returned = returnSaleStock(db, record.id, userId, stamped, `Returned stock for cancelled ${record.code}`)
    let next = audit({ ...db, sales, movements: [...db.movements, ...returned] }, userId, 'sale.cancel', 'sale', id, `Cancelled sale ${record.code} and put the stock back. ${note}`)
    next = notifyAdmins(next, { type: 'submission_cancelled', title: `${record.code} cancelled`, message: `${message} Reserved stock was released.`, href: '/admin/approvals' })
    return finish(next, `${record.code} cancelled. Reserved stock was released.`)
  }
  if (kind === 'expense') {
    const record = db.expenses.find((item) => item.id === id)
    if (!record || record.submittedBy !== userId) return fail('Submission not found.')
    if (record.status !== 'pending') return fail('Only a pending submission can be cancelled.')
    const expenses = db.expenses.map((item) => (item.id === id ? { ...item, status: 'cancelled' as const, reviewedAt: stamped, rejectionReason: note } : item))
    let next = audit({ ...db, expenses }, userId, 'expense.cancel', 'expense', id, `Cancelled expense ${record.code}. ${note}`)
    next = notifyAdmins(next, { type: 'submission_cancelled', title: `${record.code} cancelled`, message, href: '/admin/approvals' })
    return finish(next, `${record.code} cancelled.`)
  }
  const record = db.activities.find((item) => item.id === id)
  if (!record || record.submittedBy !== userId) return fail('Submission not found.')
  if (record.status !== 'pending') return fail('Only a pending submission can be cancelled.')
  const activities = db.activities.map((item) => (item.id === id ? { ...item, status: 'cancelled' as const, reviewedAt: stamped, rejectionReason: note } : item))
  let next = audit({ ...db, activities }, userId, 'activity.cancel', 'activity', id, `Cancelled income record ${record.code}. ${note}`)
  next = notifyAdmins(next, { type: 'submission_cancelled', title: `${record.code} cancelled`, message, href: '/admin/approvals' })
  return finish(next, `${record.code} cancelled.`)
}

export function adjustStock(db: Database, userId: string, draft: AdjustmentDraft): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const product = db.products.find((item) => item.id === draft.productId)
  if (!product) return fail('Product not found.')
  if (!Number.isInteger(draft.quantity) || draft.quantity < 1 || draft.quantity > 100_000) return fail('Enter a whole quantity greater than zero.')
  const reason = draft.reason.trim()
  if (reason.length < 3) return fail('Enter the reason for this adjustment.')
  const delta = draft.direction === 'in' ? draft.quantity : -draft.quantity
  const snap = snapshotFor(db, product.id)
  const nextConfirmed = snap.confirmed + delta
  if (nextConfirmed < 0) return fail('This adjustment would make confirmed stock negative.')
  if (nextConfirmed < snap.reserved) {
    return fail('This adjustment would drop confirmed stock below quantities already reserved for pending sales.')
  }
  const coded = takeCode(db, 'adjustment', 'ADJ')
  const stamped = now()
  const movement: InventoryMovement = {
    id: uid(),
    productId: product.id,
    type: 'adjustment',
    quantity: delta,
    unitCost: product.costPrice,
    referenceType: 'adjustment',
    referenceId: coded.code,
    note: reason,
    createdBy: userId,
    createdAt: stamped,
  }
  const products = db.products.map((item) => (item.id === product.id ? { ...item, updatedAt: stamped } : item))
  let next = audit(
    { ...coded.db, products, movements: [...coded.db.movements, movement] },
    userId,
    'inventory.adjust',
    'adjustment',
    coded.code,
    `Adjusted ${product.name} by ${delta}. ${reason}`,
  )
  next = notifyAdmins(next, {
    type: 'adjustment',
    title: `Stock adjusted: ${product.name}`,
    message: `${coded.code} changed confirmed stock by ${delta}. ${reason}`,
    href: '/admin/inventory',
  })
  return finish(next, `${coded.code} recorded. Confirmed stock for ${product.name} changed by ${delta}.`)
}

export function updateSettings(db: Database, userId: string, input: { businessName: string; currency: string; currencySymbol: string; lowStockAlerts: boolean; allowRemainingCount: boolean }): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const parsed = settingsSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the settings.')
  const settings = { ...parsed.data, updatedAt: now() }
  return finish(audit({ ...db, settings }, userId, 'settings.update', 'settings', 'business', 'Updated business settings.'), 'Settings saved.')
}

export function updateActivityType(
  db: Database,
  userId: string,
  activityTypeId: string,
  input: { pricingMode: 'per_game' | 'per_session' | 'per_play' | 'flat'; unitPrice: number; unitLabel: string; isActive: boolean },
): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const parsed = activityTypeSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the pricing rule.')
  const current = db.activityTypes.find((item) => item.id === activityTypeId)
  if (!current) return fail('Income type not found.')
  const activityTypes = db.activityTypes.map((item) => (item.id === activityTypeId ? { ...item, ...parsed.data, updatedAt: now() } : item))
  return finish(audit({ ...db, activityTypes }, userId, 'activity_type.update', 'activity_type', activityTypeId, `Updated pricing for ${current.name}.`), 'Pricing updated.')
}

export function deleteBusinessRecord(db: Database, userId: string, kind: RecordDeleteKind, id: string): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  if (kind === 'stock_in') {
    const record = db.stockIns.find((item) => item.id === id)
    if (!record) return fail('Delivery not found.')
    const stockIns = db.stockIns.filter((item) => item.id !== id)
    const movements = db.movements.filter((item) => item.referenceId !== record.id && item.referenceId !== record.code)
    return finish(audit({ ...db, stockIns, movements }, userId, 'stock_in.delete', 'stock_in', id, `Deleted stock in ${record.code}.`), `${record.code} deleted. Stock from this delivery was reversed.`)
  }
  if (kind === 'sale') {
    const record = db.sales.find((item) => item.id === id)
    if (!record) return fail('Sale not found.')
    const sales = db.sales.filter((item) => item.id !== id)
    const movements = db.movements.filter((item) => item.referenceId !== record.id && item.referenceId !== record.code)
    const label = record.recordKind === 'bill' ? 'bill' : 'sale'
    return finish(audit({ ...db, sales, movements }, userId, `${label}.delete`, label, id, `Deleted ${label} ${record.code}.`), `${record.code} deleted. Related stock movements were reversed.`)
  }
  const record = db.expenses.find((item) => item.id === id)
  if (!record) return fail('Expense not found.')
  const expenses = db.expenses.filter((item) => item.id !== id)
  return finish(audit({ ...db, expenses }, userId, 'expense.delete', 'expense', id, `Deleted expense ${record.code}.`), `${record.code} deleted.`)
}

function cleanDebts(items: DayDebt[], asAdmin = false) {
  return items
    .map((item) => {
      const amount = Math.max(0, Math.floor(item.amount || 0))
      const paidAmount = Math.min(amount, Math.max(0, Math.floor(item.paidAmount || 0)))
      let paymentStatus = item.paymentStatus
      let paidApprovedAmount = item.paidApprovedAmount
      if (paidAmount <= 0) {
        paymentStatus = 'unpaid'
        paidApprovedAmount = undefined
      } else if (asAdmin && paymentStatus !== 'pending') {
        paymentStatus = 'approved'
        paidApprovedAmount = paidAmount
      } else if (paymentStatus === 'approved' && paidAmount === (item.paidApprovedAmount ?? paidAmount)) {
        paymentStatus = 'approved'
        paidApprovedAmount = paidAmount
      } else {
        paymentStatus = 'pending'
      }
      return {
        id: item.id || uid(),
        customerName: item.customerName.trim(),
        amount,
        products: item.products.trim(),
        paidAmount,
        paymentStatus,
        paidApprovedAmount,
      }
    })
    .filter((item) => item.customerName.length >= 2 && item.amount >= 1)
}

function halfQty(value: number) {
  return Math.max(0, Math.round((value || 0) * 2) / 2)
}

function cleanLines(items: CogsLine[] = []) {
  return items
    .map((item) => ({
      productId: item.productId,
      name: item.name.trim(),
      remaining: halfQty(item.remaining),
      sold: halfQty(item.sold),
      amount: Math.round(item.amount || 0),
      profit: Math.round(item.profit || 0),
      unitCost: item.unitCost == null ? undefined : Math.max(0, Math.round(item.unitCost)),
    }))
    .filter((item) => item.name.length >= 1)
}

function cleanExpenseItems(items: CogsExpenseLine[] = []) {
  return items
    .map((item) => ({
      description: item.description.trim(),
      amount: Math.max(0, Math.floor(item.amount || 0)),
      notes: item.notes.trim(),
    }))
    .filter((item) => item.description.length >= 2 && item.amount >= 1)
}

function cleanMobileItems(items: CogsMobileItem[] = [], fallbackDay: string, fallbackTotal = 0) {
  const cleaned = items
    .map((item) => ({
      id: item.id,
      amount: Math.max(0, Math.floor(item.amount || 0)),
      date: /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : fallbackDay,
    }))
    .filter((item) => item.amount >= 1)
  if (cleaned.length) return cleaned
  if (fallbackTotal >= 1) return [{ amount: Math.floor(fallbackTotal), date: fallbackDay }]
  return []
}

export function saveDayClose(
  db: Database,
  userId: string,
  input: {
    day: string
    remainingSaleId?: string
    debts: DayDebt[]
    mobileReceived: number
    expenseTotal?: number
    lines?: CogsLine[]
    expenseItems?: CogsExpenseLine[]
    mobileItems?: CogsMobileItem[]
    submittedBy?: string
  },
): OpResult {
  const actor = activeProfile(db, userId)
  if (!actor.ok) return actor
  const day = input.day.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return fail('Choose a valid day.')
  const today = dateKey()
  const owner = actor.profile.role === 'admin' && input.submittedBy ? input.submittedBy : userId
  const existing = (db.dayCloses ?? []).find((item) => item.day === day && item.submittedBy === owner)
  if (actor.profile.role === 'admin') {
    if (day > today) return fail('COGS cannot be recorded for a future day.')
  } else if (!existing && !employeeDayOk(db, day)) {
    return fail(RECORD_WINDOW_FAIL)
  }
  if (existing?.status === 'approved' && actor.profile.role !== 'admin') return fail('This COGS report is already approved.')
  const expenseItems = cleanExpenseItems(input.expenseItems)
  const mobileItems = cleanMobileItems(input.mobileItems, day, input.mobileReceived)
  const debts = cleanDebts(input.debts, actor.profile.role === 'admin')
  const record: DayClose = {
    id: existing?.id ?? uid(),
    day,
    submittedBy: owner,
    remainingSaleId: input.remainingSaleId,
    debts,
    lines: cleanLines(input.lines),
    expenseItems,
    mobileItems,
    mobileReceived: Math.max(0, Math.floor(input.mobileReceived || mobileItems.reduce((sum, item) => sum + item.amount, 0))),
    expenseTotal: Math.max(0, Math.floor(input.expenseTotal ?? expenseItems.reduce((sum, item) => sum + item.amount, 0))),
    status: 'pending',
    createdAt: existing?.createdAt ?? now(),
  }
  const dayCloses = [...(db.dayCloses ?? []).filter((item) => item.id !== record.id), record]
  let next = audit({ ...db, dayCloses }, userId, 'day_close.save', 'day_close', record.id, `Saved COGS close for ${day}.`)
  next = notifyAdmins(next, {
    type: 'submission_pending',
    title: `COGS close · ${day}`,
    message: `${actor.profile.fullName} saved a COGS report for ${day}.`,
    href: '/admin/remaining',
  })
  if (debts.some(hasPendingDebtPayment)) {
    next = notifyAdmins(next, {
      type: 'submission_pending',
      title: `Debt payment · ${day}`,
      message: `${actor.profile.fullName} submitted a debt payment for ${day}. Approve it on the COGS calendar.`,
      href: '/admin/remaining',
    })
  }
  return finish(next, 'COGS close saved.', { id: record.id })
}

export function updateDayClose(
  db: Database,
  userId: string,
  id: string,
  input: { debts: DayDebt[]; mobileReceived: number; expenseTotal: number; lines?: CogsLine[]; expenseItems?: CogsExpenseLine[]; mobileItems?: CogsMobileItem[] },
): OpResult {
  const actor = activeProfile(db, userId)
  if (!actor.ok) return actor
  const current = (db.dayCloses ?? []).find((item) => item.id === id)
  if (!current) return fail('COGS report not found.')
  const isAdmin = actor.profile.role === 'admin'
  if (!isAdmin && (current.submittedBy !== userId || current.status === 'approved')) {
    return fail('You can only edit your COGS report before it is approved.')
  }
  const expenseItems = cleanExpenseItems(input.expenseItems ?? current.expenseItems)
  const mobileItems = cleanMobileItems(input.mobileItems ?? current.mobileItems, current.day, input.mobileReceived)
  const dayCloses = (db.dayCloses ?? []).map((item) =>
    item.id === id
      ? {
          ...item,
          debts: cleanDebts(input.debts, isAdmin),
          lines: cleanLines(input.lines ?? item.lines),
          expenseItems,
          mobileItems,
          mobileReceived: Math.max(0, Math.floor(input.mobileReceived || mobileItems.reduce((sum, row) => sum + row.amount, 0))),
          expenseTotal: Math.max(0, Math.floor(input.expenseTotal || expenseItems.reduce((sum, row) => sum + row.amount, 0))),
          status: isAdmin ? ('pending' as const) : item.status,
          reviewedBy: isAdmin ? undefined : item.reviewedBy,
          reviewedAt: isAdmin ? undefined : item.reviewedAt,
        }
      : item,
  )
  return finish(audit({ ...db, dayCloses }, userId, 'day_close.update', 'day_close', id, `Updated COGS report for ${current.day}.`), 'COGS report updated.')
}

export function deleteDayClose(db: Database, userId: string, id: string): OpResult {
  const actor = activeProfile(db, userId)
  if (!actor.ok) return actor
  const current = (db.dayCloses ?? []).find((item) => item.id === id)
  if (!current) return fail('COGS report not found.')
  if (actor.profile.role !== 'admin' && (current.submittedBy !== userId || current.status === 'approved')) {
    return fail('You can only delete your COGS report before it is approved.')
  }
  const dayCloses = (db.dayCloses ?? []).filter((item) => item.id !== id)
  return finish(audit({ ...db, dayCloses }, userId, 'day_close.delete', 'day_close', id, `Deleted COGS report for ${current.day}.`), 'COGS report deleted.')
}

export function approveDayClose(db: Database, userId: string, id: string): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const current = (db.dayCloses ?? []).find((item) => item.id === id)
  if (!current) return fail('COGS report not found.')
  const stamped = now()
  const dayCloses = (db.dayCloses ?? []).map((item) =>
    item.id === id
      ? { ...item, debts: approvePendingDebts(item.debts), status: 'approved' as const, reviewedBy: userId, reviewedAt: stamped }
      : item,
  )
  return finish(audit({ ...db, dayCloses }, userId, 'day_close.approve', 'day_close', id, `Approved COGS report for ${current.day}.`), 'COGS report approved.')
}

export function reviewDebtPayment(db: Database, userId: string, closeId: string, debtId: string, approve: boolean): OpResult {
  const adminCheck = requireAdmin(db, userId)
  if (!adminCheck.ok) return adminCheck
  const current = (db.dayCloses ?? []).find((item) => item.id === closeId)
  if (!current) return fail('COGS report not found.')
  const target = current.debts.find((item) => item.id === debtId)
  if (!target) return fail('Debt not found.')
  if (approve && debtPaid(target) < 1) return fail('This debt has no payment to approve.')
  const debts = current.debts.map((item) => (item.id === debtId ? applyDebtPaymentReview(item, approve) : item))
  const dayCloses = (db.dayCloses ?? []).map((item) => (item.id === closeId ? { ...item, debts } : item))
  const summary = approve
    ? `Approved debt payment from ${target.customerName} for ${current.day}.`
    : `Rejected debt payment from ${target.customerName} for ${current.day}.`
  return finish(audit({ ...db, dayCloses }, userId, approve ? 'debt.approve' : 'debt.reject', 'day_close', closeId, summary), approve ? 'Debt payment approved.' : 'Debt payment rejected.')
}

export function setDayCloseDebtPayment(
  db: Database,
  userId: string,
  closeId: string,
  debtId: string,
  paidAmount: number,
  details?: { customerName?: string; amount?: number; products?: string },
): OpResult {
  const actor = activeProfile(db, userId)
  if (!actor.ok) return actor
  const current = (db.dayCloses ?? []).find((item) => item.id === closeId)
  if (!current) return fail('COGS report not found.')
  const asAdmin = actor.profile.role === 'admin'
  if (!asAdmin && current.submittedBy !== userId) return fail('You can only update your own bills.')
  const name = (details?.customerName ?? '').trim().toLowerCase()
  const existing = current.debts.find((item) => item.id && item.id === debtId)
    ?? current.debts.find((item) => name && item.customerName.trim().toLowerCase() === name)
  const seed = existing ?? {
    id: uid(),
    customerName: details?.customerName?.trim() || '',
    amount: Math.max(0, Math.floor(details?.amount || 0)),
    products: (details?.products ?? '').trim(),
    paidAmount: 0,
    paymentStatus: 'unpaid' as const,
  }
  if (!existing && (seed.customerName.length < 2 || seed.amount < 1)) return fail('Debt not found.')
  const next = setDebtPayment({ ...seed, amount: Math.max(seed.amount, Math.floor(details?.amount || seed.amount)) }, paidAmount, asAdmin)
  const debts = existing
    ? current.debts.map((item) => (item.id === existing.id ? next : item))
    : [...current.debts, next]
  const dayCloses = (db.dayCloses ?? []).map((item) => (item.id === closeId ? { ...item, debts } : item))
  const summary = debtPaid(next) > 0
    ? `Updated debt payment from ${next.customerName} for ${current.day}.`
    : `Marked debt from ${next.customerName} unpaid for ${current.day}.`
  return finish(audit({ ...db, dayCloses }, userId, 'debt.set_payment', 'day_close', closeId, summary), debtPaid(next) > 0 ? 'Debt payment updated.' : 'Debt marked unpaid.')
}

function restockLines(db: Database, draft: RestockOrderDraft, previous: RestockOrderItem[] = []): RestockOrderItem[] | { error: string } {
  const merged = new Map<string, number>()
  for (const line of draft.items) {
    const qty = Number(line.receivedQuantity)
    if (!line.productId || !Number.isFinite(qty) || qty <= 0) continue
    merged.set(line.productId, (merged.get(line.productId) ?? 0) + qty)
  }
  for (const line of previous.filter((item) => item.received)) {
    if (merged.has(line.productId)) continue
    return { error: `${productName(db, line.productId)} is received and cannot be removed.` }
  }
  const prior = new Map(previous.map((item) => [item.productId, item]))
  const items: RestockOrderItem[] = []
  for (const [productId, receivedQuantity] of merged) {
    const product = db.products.find((item) => item.id === productId && item.isActive)
    if (!product) return { error: 'Choose an active product.' }
    if (receivedQuantity > 100_000) return { error: `Enter a valid quantity for ${product.name}.` }
    const conversionFactor = product.conversionFactor
    const stockQuantity = stockQtyFromReceived(receivedQuantity, conversionFactor)
    if (stockQuantity <= 0) return { error: `Enter a valid quantity for ${product.name}.` }
    const existing = prior.get(product.id)
    items.push({
      id: existing?.id ?? uid(),
      productId: product.id,
      receivedQuantity,
      receiveUnitId: product.receiveUnitId,
      conversionFactor,
      stockQuantity,
      received: Boolean(existing?.received),
      receivedAt: existing?.receivedAt,
    })
  }
  if (!items.length) return { error: 'Enter a quantity for at least one product.' }
  return items
}

function takeRestockCode(db: Database) {
  const used = new Set((db.restockOrders ?? []).map((item) => item.code))
  let n = (db.restockOrders ?? []).length + 1
  let code = `RO-${String(n).padStart(4, '0')}`
  while (used.has(code)) {
    n += 1
    code = `RO-${String(n).padStart(4, '0')}`
  }
  return code
}

function applyReceivedQtyDeltas(db: Database, order: RestockOrder, previous: RestockOrderItem[], next: RestockOrderItem[]): OpResult {
  let working = db
  const delivery = order.stockInId ? working.stockIns.find((item) => item.id === order.stockInId) : undefined
  for (const line of next) {
    if (!line.received) continue
    const old = previous.find((item) => item.productId === line.productId)
    if (!old) continue
    const delta = Math.round((line.stockQuantity - old.stockQuantity) * 100) / 100
    if (!delta) continue
    if (!delivery) return fail('Received stock in was not found for this order.')
    if (delta < 0) {
      const confirmed = working.movements.reduce((sum, movement) => (movement.productId === line.productId ? sum + movement.quantity : sum), 0)
      if (confirmed + delta < -0.0001) {
        return fail(`Not enough remaining stock to reduce ${productName(db, line.productId)}. Sell or count first.`)
      }
    }
    let applied = false
    working = {
      ...working,
      stockIns: working.stockIns.map((item) =>
        item.id !== delivery.id
          ? item
          : {
              ...item,
              items: item.items.map((row) =>
                row.productId !== line.productId
                  ? row
                  : {
                      ...row,
                      receivedQuantity: line.receivedQuantity,
                      receiveUnitId: line.receiveUnitId,
                      conversionFactor: line.conversionFactor,
                      stockQuantity: line.stockQuantity,
                      totalCost: Math.round(roundBuyingPrice(row.costPerStockUnit) * line.stockQuantity),
                      costPerStockUnit: roundBuyingPrice(row.costPerStockUnit),
                    },
              ),
            },
      ),
      movements: working.movements.map((movement) => {
        if (applied) return movement
        const match =
          movement.referenceType === 'stock_in' &&
          movement.productId === line.productId &&
          (movement.referenceId === delivery.id || movement.referenceId === delivery.code)
        if (!match) return movement
        applied = true
        return { ...movement, quantity: movement.quantity + delta }
      }),
    }
  }
  return { ok: true, db: working }
}

export function saveRestockOrder(db: Database, userId: string, draft: RestockOrderDraft): OpResult {
  const actor = activeProfile(db, userId)
  if (!actor.ok) return actor
  if ((draft.notes ?? '').trim().length > 400) return fail('Notes are too long.')
  const notes = (draft.notes ?? '').trim()
  const stamped = now()
  if (draft.id) {
    const current = (db.restockOrders ?? []).find((item) => item.id === draft.id)
    if (!current) return fail('Order not found.')
    if (current.submittedBy !== userId && actor.profile.role !== 'admin') return fail('You can only change your own orders.')
    const hadReceived = current.items.some((item) => item.received) || current.status !== 'not_received'
    if (hadReceived && current.receivedEditUsed) return fail('This received order was already edited once.')
    const built = restockLines(db, draft, current.items)
    if ('error' in built) return fail(built.error)
    const adjusted = hadReceived ? applyReceivedQtyDeltas(db, current, current.items, built) : { ok: true as const, db }
    if (!adjusted.ok) return adjusted
    const restockOrders = (adjusted.db.restockOrders ?? []).map((item) =>
      item.id === current.id ? { ...item, notes, items: built, receivedEditUsed: hadReceived ? true : item.receivedEditUsed } : item,
    )
    return finish(
      audit({ ...adjusted.db, restockOrders }, userId, hadReceived ? 'restock.edit_received' : 'restock.update', 'restock_order', current.id, `Updated restock order ${current.code}.`),
      hadReceived ? `${current.code} saved. This received order cannot be edited again.` : `${current.code} saved.`,
    )
  }
  const built = restockLines(db, draft)
  if ('error' in built) return fail(built.error)
  const order: RestockOrder = {
    id: uid(),
    code: takeRestockCode(db),
    notes,
    status: 'not_received',
    submittedBy: userId,
    submittedAt: stamped,
    items: built,
  }
  const restockOrders = [order, ...(db.restockOrders ?? [])]
  return finish(
    audit({ ...db, restockOrders }, userId, 'restock.submit', 'restock_order', order.id, `Saved restock order ${order.code}.`),
    `${order.code} saved. Mark it received when the stock arrives.`,
  )
}

function restockReceiptStatus(items: RestockOrderItem[]): RestockOrderStatus {
  const got = items.filter((item) => item.received).length
  if (!got) return 'not_received'
  if (got === items.length) return 'received'
  return 'partial'
}

function patchRestockOrder(db: Database, order: RestockOrder, items: RestockOrderItem[], extra: Partial<RestockOrder> = {}): Database {
  const status = restockReceiptStatus(items)
  const next: RestockOrder = {
    ...order,
    ...extra,
    items,
    status,
    receivedAt: status === 'not_received' ? undefined : extra.receivedAt ?? order.receivedAt,
    receivedBy: status === 'not_received' ? undefined : extra.receivedBy ?? order.receivedBy,
    stockInId: 'stockInId' in extra ? extra.stockInId : order.stockInId,
  }
  return { ...db, restockOrders: (db.restockOrders ?? []).map((item) => (item.id === order.id ? next : item)) }
}

function receiveRestockItem(db: Database, order: RestockOrder, line: RestockOrderItem, userId: string): OpResult {
  if (line.received) return { ok: true, db }
  const stamped = now()
  const product = db.products.find((item) => item.id === line.productId && item.isActive)
  if (!product) return fail('Choose an active product.')
  const conversionFactor = product.conversionFactor
  const stockQuantity = stockQtyFromReceived(line.receivedQuantity, conversionFactor)
  if (stockQuantity <= 0) return fail(`Enter a valid quantity for ${product.name}.`)
  const priced = pricedStockIn(sizeCost(product, 'one'), stockQuantity)
  const stockInItem: StockInItem = {
    id: uid(),
    productId: product.id,
    sizeName: 'one',
    receivedQuantity: line.receivedQuantity,
    receiveUnitId: product.receiveUnitId,
    conversionFactor,
    stockQuantity,
    costPerStockUnit: priced.costPerStockUnit,
    totalCost: priced.totalCost,
  }
  let working = db
  let stockInId = order.stockInId
  let delivery = stockInId ? working.stockIns.find((item) => item.id === stockInId) : undefined
  if (delivery?.items.some((item) => item.productId === line.productId)) {
    return fail(`${product.name} is already on this restock stock in.`)
  }
  if (!delivery) {
    let suppliers = working.suppliers
    let supplier = suppliers.find((item) => item.name.toLowerCase() === 'restock order')
    if (!supplier) {
      supplier = { id: uid(), name: 'Restock order', phone: '', isActive: true, createdAt: stamped }
      suppliers = [...suppliers, supplier]
    }
    const coded = takeCode({ ...working, suppliers }, 'stockIn', 'SI')
    const invoiceRef = allocateInvoiceRef(coded.db.stockIns.map((item) => item.invoiceRef), '')
    const transaction: StockInTransaction = {
      id: uid(),
      code: coded.code,
      supplierId: supplier.id,
      supplierName: supplier.name,
      deliveryDate: dateKey(),
      invoiceRef,
      notes: `Restock ${order.code}`,
      status: 'approved',
      submittedBy: userId,
      submittedAt: stamped,
      reviewedBy: userId,
      reviewedAt: stamped,
      items: [stockInItem],
    }
    const movement: InventoryMovement = {
      id: uid(),
      productId: product.id,
      type: 'stock_in',
      quantity: stockQuantity,
      unitCost: priced.costPerStockUnit,
      referenceType: 'stock_in',
      referenceId: transaction.id,
      note: `Received restock ${order.code} as ${transaction.code}`,
      createdBy: userId,
      createdAt: stamped,
    }
    working = { ...coded.db, stockIns: [transaction, ...coded.db.stockIns], movements: [...coded.db.movements, movement] }
    stockInId = transaction.id
  } else {
    const movement: InventoryMovement = {
      id: uid(),
      productId: product.id,
      type: 'stock_in',
      quantity: stockQuantity,
      unitCost: priced.costPerStockUnit,
      referenceType: 'stock_in',
      referenceId: delivery.id,
      note: `Received restock ${order.code} as ${delivery.code}`,
      createdBy: userId,
      createdAt: stamped,
    }
    working = {
      ...working,
      stockIns: working.stockIns.map((item) =>
        item.id === delivery.id ? { ...item, items: [...item.items, stockInItem] } : item,
      ),
      movements: [...working.movements, movement],
    }
  }
  const items = order.items.map((item) =>
    item.id === line.id
      ? { ...item, received: true, receivedAt: stamped, receiveUnitId: product.receiveUnitId, conversionFactor, stockQuantity }
      : item,
  )
  const next = patchRestockOrder(working, { ...order, stockInId }, items, {
    stockInId,
    receivedAt: stamped,
    receivedBy: userId,
  })
  return {
    ok: true,
    db: audit(next, userId, 'restock.receive_item', 'restock_order', order.id, `Received ${product.name} on ${order.code}.`),
  }
}

export function setRestockItemStatus(db: Database, userId: string, orderId: string, itemId: string, received: boolean): OpResult {
  const actor = activeProfile(db, userId)
  if (!actor.ok) return actor
  const current = (db.restockOrders ?? []).find((item) => item.id === orderId)
  if (!current) return fail('Order not found.')
  if (current.submittedBy !== userId && actor.profile.role !== 'admin') return fail('You can only change your own orders.')
  const line = current.items.find((item) => item.id === itemId)
  if (!line) return fail('Order item not found.')
  if (Boolean(line.received) === received) {
    return finish(db, received ? 'This product is already received.' : 'This product is not received.')
  }
  if (!received) return fail('Received products cannot be unmarked. Edit the order once if the quantity is wrong.')
  const next = receiveRestockItem(db, current, line, userId)
  if (!next.ok) return next
  return finish(next.db, `${productName(db, line.productId)} marked received. Confirmed stock was updated.`)
}

export function setRestockOrderStatus(db: Database, userId: string, orderId: string, status: RestockOrderStatus): OpResult {
  const actor = activeProfile(db, userId)
  if (!actor.ok) return actor
  const current = (db.restockOrders ?? []).find((item) => item.id === orderId)
  if (!current) return fail('Order not found.')
  if (current.submittedBy !== userId && actor.profile.role !== 'admin') return fail('You can only change your own orders.')
  if (status === 'partial') return fail('Mark products received one by one, or mark all received.')
  if (status !== 'received') return fail('Received orders cannot be unmarked. Edit the order once if the quantity is wrong.')
  const pending = current.items.filter((item) => !item.received)
  if (!pending.length) return finish(db, `${current.code} is already received.`)
  let working: Database = db
  for (const line of pending) {
    const live = (working.restockOrders ?? []).find((item) => item.id === current.id) ?? current
    const next = receiveRestockItem(working, live, line, userId)
    if (!next.ok) return next
    working = next.db
  }
  return finish(working, `${current.code} marked received. Confirmed stock was updated.`)
}

export function markNotificationRead(db: Database, userId: string, notificationId: string): OpResult {
  return setNotificationsRead(db, userId, [notificationId], true)
}

export function markAllNotificationsRead(db: Database, userId: string): OpResult {
  const actor = activeProfile(db, userId)
  if (!actor.ok) return actor
  return setNotificationsRead(
    db,
    userId,
    db.notifications.filter((item) => item.recipientId === userId).map((item) => item.id),
    true,
  )
}

export function setNotificationsRead(db: Database, userId: string, ids: string[], read: boolean): OpResult {
  const actor = activeProfile(db, userId)
  if (!actor.ok) return actor
  if (!ids.length) return { ok: true, db }
  const chosen = new Set(ids)
  const notifications = db.notifications.map((item) =>
    item.recipientId === userId && chosen.has(item.id) ? { ...item, read } : item,
  )
  return { ok: true, db: { ...db, notifications } }
}

export function removeNotifications(db: Database, userId: string, ids: string[]): OpResult {
  const actor = activeProfile(db, userId)
  if (!actor.ok) return actor
  if (!ids.length) return { ok: true, db, message: 'No notifications selected.' }
  const chosen = new Set(ids)
  const notifications = db.notifications.filter((item) => !(item.recipientId === userId && chosen.has(item.id)))
  const removed = db.notifications.length - notifications.length
  return { ok: true, db: { ...db, notifications }, message: removed === 1 ? 'Notification deleted.' : `${removed} notifications deleted.` }
}