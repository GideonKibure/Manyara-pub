export type Role = 'admin' | 'employee'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type BillPayment = 'paid' | 'unpaid'
export type StockLevel = 'normal' | 'low' | 'out'
export type MovementType = 'opening' | 'stock_in' | 'sale' | 'adjustment'
export type PaymentMethod = 'cash' | 'mobile_money' | 'card' | 'other'
export type PricingMode = 'per_game' | 'per_session' | 'per_play' | 'flat'
export type NotificationType =
  | 'low_stock'
  | 'out_of_stock'
  | 'submission_pending'
  | 'submission_approved'
  | 'submission_rejected'
  | 'submission_cancelled'
  | 'adjustment'
export type NotifyChannel = 'in_app' | 'email' | 'whatsapp'

export interface Profile {
  id: string
  fullName: string
  username: string
  email: string
  phone: string
  role: Role
  isActive: boolean
  canSubmitActivities: boolean
  canViewStock: boolean
  createdAt: string
  updatedAt: string
  lastLoginAt?: string
  imageUrl?: string
}

export interface AuthAccount {
  profileId: string
  password: string
}

export interface ResetToken {
  token: string
  profileId: string
  expiresAt: string
}

export interface Category {
  id: string
  name: string
  description: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Unit {
  id: string
  name: string
  abbreviation: string
}

export type RecordKind = 'sale' | 'bill'
export type ProductSizeName = 'small' | 'medium' | 'big'
export type SaleSize = 'one' | ProductSizeName
export type SalePortion = 'full' | 'cup' | 'half'

export interface SizeOffer {
  name: ProductSizeName
  cost: number
  price: number
  cupPrice: number | null
  halfPrice: number | null
}

export interface Product {
  id: string
  name: string
  categoryId: string
  imageUrl?: string
  sku: string
  stockUnitId: string
  receiveUnitId: string
  conversionFactor: number
  costPrice: number
  sellingPrice: number
  sizeMode: 'one' | 'many'
  sizes: SizeOffer[]
  cupPrice: number | null
  halfPrice: number | null
  minStock: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Supplier {
  id: string
  name: string
  phone: string
  isActive: boolean
  createdAt: string
}

export interface StockInItem {
  id: string
  productId: string
  sizeName?: SaleSize
  receivedQuantity: number
  receiveUnitId: string
  conversionFactor: number
  stockQuantity: number
  costPerStockUnit: number
  totalCost: number
}

export interface StockInTransaction {
  id: string
  code: string
  supplierId: string
  supplierName: string
  deliveryDate: string
  invoiceRef: string
  notes: string
  status: ApprovalStatus
  submittedBy: string
  submittedAt: string
  reviewedBy?: string
  reviewedAt?: string
  rejectionReason?: string
  correctsId?: string
  items: StockInItem[]
}

export interface SalesItem {
  id: string
  productId: string
  quantity: number
  unitPrice: number
  unitCost: number
  sizeName: SaleSize
  portion: SalePortion
}

export interface SalesTransaction {
  id: string
  code: string
  customerName: string
  paymentStatus: BillPayment
  recordKind: RecordKind
  generatedAt: string
  notes: string
  status: ApprovalStatus
  submittedBy: string
  submittedAt: string
  reviewedBy?: string
  reviewedAt?: string
  rejectionReason?: string
  correctsId?: string
  isLoss?: boolean
  amountPaid?: number
  settledAmount?: number
  sourceBillId?: string
  items: SalesItem[]
}

export interface InventoryMovement {
  id: string
  productId: string
  type: MovementType
  quantity: number
  unitCost: number
  referenceType: MovementType
  referenceId: string
  note: string
  createdBy: string
  createdAt: string
}

export interface ActivityType {
  id: string
  name: string
  code: 'pool_table' | 'korokoro'
  pricingMode: PricingMode
  unitPrice: number
  unitLabel: string
  isActive: boolean
  updatedAt: string
}

export interface ActivityTransaction {
  id: string
  code: string
  activityTypeId: string
  quantity: number
  unitPrice: number
  amount: number
  paymentMethod: PaymentMethod
  notes: string
  occurredAt: string
  status: ApprovalStatus
  submittedBy: string
  submittedAt: string
  reviewedBy?: string
  reviewedAt?: string
  rejectionReason?: string
  correctsId?: string
}

export interface AppNotification {
  id: string
  recipientId: string
  type: NotificationType
  title: string
  message: string
  href: string
  read: boolean
  createdAt: string
  dedupeKey?: string
  resolvedAt?: string
  channels: NotifyChannel[]
}

export interface AuditLog {
  id: string
  actorId: string
  action: string
  entityType: string
  entityId: string
  summary: string
  createdAt: string
}

export interface BusinessSettings {
  businessName: string
  currency: string
  currencySymbol: string
  lowStockAlerts: boolean
  allowRemainingCount: boolean
  updatedAt: string
}

export type RecordDeleteKind = 'stock_in' | 'sale' | 'expense'

export interface DayDebt {
  customerName: string
  amount: number
  products: string
}

export interface DayClose {
  id: string
  day: string
  submittedBy: string
  remainingSaleId?: string
  debts: DayDebt[]
  mobileReceived: number
  createdAt: string
}

export interface ExpenseTransaction {
  id: string
  code: string
  description: string
  amount: number
  spentOn: string
  notes: string
  status: ApprovalStatus
  submittedBy: string
  submittedAt: string
  reviewedBy?: string
  reviewedAt?: string
  rejectionReason?: string
  correctsId?: string
}

export interface Counters {
  stockIn: number
  sale: number
  activity: number
  expense: number
  adjustment: number
}

export interface StockAvailability {
  productId: string
  confirmed: number
  reserved: number
  available: number
}

export interface Database {
  version: number
  accounts: AuthAccount[]
  resetTokens: ResetToken[]
  profiles: Profile[]
  categories: Category[]
  units: Unit[]
  products: Product[]
  suppliers: Supplier[]
  stockIns: StockInTransaction[]
  sales: SalesTransaction[]
  movements: InventoryMovement[]
  availability?: StockAvailability[]
  activityTypes: ActivityType[]
  activities: ActivityTransaction[]
  expenses: ExpenseTransaction[]
  dayCloses: DayClose[]
  notifications: AppNotification[]
  auditLogs: AuditLog[]
  settings: BusinessSettings
  counters: Counters
}

export interface Session {
  userId: string
  remember: boolean
}

export interface StockSnapshot {
  productId: string
  confirmed: number
  reserved: number
  available: number
  minimum: number
  level: StockLevel
}

export type ActionResult =
  | { ok: true; message?: string; meta?: Record<string, string> }
  | { ok: false; error: string }

export interface StockInDraftItem {
  productId: string
  sizeName?: SaleSize
  receivedQuantity: number
  costPerStockUnit: number
}

export interface StockInDraft {
  items: StockInDraftItem[]
  supplierName: string
  deliveryDate: string
  invoiceRef?: string
  notes?: string
  correctsId?: string
}

export interface SaleDraftItem {
  productId: string
  quantity: number
  sizeName?: SaleSize
  portion?: SalePortion
}

export interface SaleDraft {
  items: SaleDraftItem[]
  customerName: string
  paymentStatus: BillPayment
  recordKind?: RecordKind
  generatedAt?: string
  notes?: string
  correctsId?: string
}

export interface ExpenseDraft {
  description: string
  amount: number
  spentOn: string
  notes?: string
  correctsId?: string
}

export interface ActivityDraft {
  activityTypeId: string
  quantity: number
  amount: number
  paymentMethod: PaymentMethod
  occurredAt: string
  notes?: string
  correctsId?: string
}

export interface ProductDraft {
  name: string
  categoryId: string
  imageUrl?: string
  sku?: string
  stockUnitId: string
  receiveUnitId: string
  conversionFactor: number
  costPrice: number
  sellingPrice: number
  sizeMode: 'one' | 'many'
  sizes: SizeOffer[]
  cupPrice: number | null
  halfPrice: number | null
  minStock: number
  isActive: boolean
}

export interface EmployeeDraft {
  fullName: string
  username: string
  email: string
  phone?: string
  password: string
  canSubmitActivities: boolean
  canViewStock: boolean
}

export interface EmployeePatch {
  fullName?: string
  phone?: string
  username?: string
  password?: string
  isActive?: boolean
  canSubmitActivities?: boolean
  canViewStock?: boolean
  imageUrl?: string
}

export interface AdjustmentDraft {
  productId: string
  direction: 'in' | 'out'
  quantity: number
  reason: string
}
