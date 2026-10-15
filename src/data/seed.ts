import { snapshotFor } from '@/features/inventory/stock'
import { syncStockAlerts } from '@/features/notifications/alerts'
import type {
  ActivityTransaction,
  ExpenseTransaction,
  AuditLog,
  Database,
  InventoryMovement,
  Product,
  SalesItem,
  SalesTransaction,
  StockInItem,
  StockInTransaction,
} from '@/types'
import { dateKey, dateKeyDaysAgo, isoDaysAgo, minutesAgo, monthsAgoStamp, plusMinutes } from '@/utils/dates'

const admin = '10000000-0000-4000-8000-000000000001'
const amina = '10000000-0000-4000-8000-000000000002'
const joseph = '10000000-0000-4000-8000-000000000003'

const beer = '20000000-0000-4000-8000-000000000001'
const spirits = '20000000-0000-4000-8000-000000000002'
const wines = '20000000-0000-4000-8000-000000000003'
const soft = '20000000-0000-4000-8000-000000000004'
const waterCat = '20000000-0000-4000-8000-000000000005'
const juice = '20000000-0000-4000-8000-000000000006'
const other = '20000000-0000-4000-8000-000000000007'
const misc = '20000000-0000-4000-8000-000000000008'

const bottle = '30000000-0000-4000-8000-000000000001'
const can = '30000000-0000-4000-8000-000000000002'
const crate = '30000000-0000-4000-8000-000000000003'
const carton = '30000000-0000-4000-8000-000000000004'
const tot = '30000000-0000-4000-8000-000000000005'
const glass = '30000000-0000-4000-8000-000000000006'
const piece = '30000000-0000-4000-8000-000000000007'

const tbl = '40000000-0000-4000-8000-000000000001'
const bonite = '40000000-0000-4000-8000-000000000002'
const local = '40000000-0000-4000-8000-000000000003'
const pool = '50000000-0000-4000-8000-000000000001'
const korokoro = '50000000-0000-4000-8000-000000000002'

const safari = '60000000-0000-4000-8000-000000000001'
const kili = '60000000-0000-4000-8000-000000000002'
const sere = '60000000-0000-4000-8000-000000000003'
const coke = '60000000-0000-4000-8000-000000000004'
const fanta = '60000000-0000-4000-8000-000000000005'
const sprite = '60000000-0000-4000-8000-000000000006'
const water = '60000000-0000-4000-8000-000000000007'
const konyagi = '60000000-0000-4000-8000-000000000008'
const whisky = '60000000-0000-4000-8000-000000000009'
const wine = '60000000-0000-4000-8000-000000000010'
const energy = '60000000-0000-4000-8000-000000000011'
const nuts = '60000000-0000-4000-8000-000000000012'

let seq = 1
const nextId = (prefix: string) => {
  const id = `${prefix}-${String(seq).padStart(12, '0')}`
  seq += 1
  return id
}

function product(input: Omit<Product, 'createdAt' | 'updatedAt' | 'isActive' | 'imageUrl' | 'sizeMode' | 'sizes' | 'cupPrice' | 'halfPrice'> & { opening: number }): Product & { opening: number } {
  return {
    ...input,
    sizeMode: 'one',
    sizes: [],
    cupPrice: null,
    halfPrice: null,
    isActive: true,
    createdAt: isoDaysAgo(50, 8),
    updatedAt: isoDaysAgo(2, 8),
  }
}

export function buildSeed(): Database {
  const created = isoDaysAgo(40, 9)
  const products = [
    product({ id: safari, name: 'Safari Lager', categoryId: beer, sku: 'BEER-SAF', stockUnitId: bottle, receiveUnitId: crate, conversionFactor: 24, costPrice: 1800, sellingPrice: 3000, minStock: 24, opening: 71 }),
    product({ id: kili, name: 'Kilimanjaro Lager', categoryId: beer, sku: 'BEER-KILI', stockUnitId: bottle, receiveUnitId: crate, conversionFactor: 24, costPrice: 1800, sellingPrice: 3000, minStock: 24, opening: 42 }),
    product({ id: sere, name: 'Serengeti Lite', categoryId: beer, sku: 'BEER-SERE', stockUnitId: bottle, receiveUnitId: crate, conversionFactor: 24, costPrice: 1700, sellingPrice: 3000, minStock: 24, opening: 18 }),
    product({ id: coke, name: 'Coca-Cola', categoryId: soft, sku: 'SOFT-COKE', stockUnitId: bottle, receiveUnitId: crate, conversionFactor: 24, costPrice: 800, sellingPrice: 1500, minStock: 24, opening: 64 }),
    product({ id: fanta, name: 'Fanta Orange', categoryId: soft, sku: 'SOFT-FANTA', stockUnitId: bottle, receiveUnitId: crate, conversionFactor: 24, costPrice: 800, sellingPrice: 1500, minStock: 18, opening: 26 }),
    product({ id: sprite, name: 'Sprite', categoryId: soft, sku: 'SOFT-SPRITE', stockUnitId: bottle, receiveUnitId: crate, conversionFactor: 24, costPrice: 800, sellingPrice: 1500, minStock: 12, opening: 12 }),
    product({ id: water, name: 'Kilimanjaro Water 500ml', categoryId: waterCat, sku: 'WATER-KILI', stockUnitId: bottle, receiveUnitId: carton, conversionFactor: 12, costPrice: 400, sellingPrice: 1000, minStock: 24, opening: 62 }),
    product({ id: konyagi, name: 'Konyagi', categoryId: spirits, sku: 'SPIRIT-KONYAGI', stockUnitId: tot, receiveUnitId: bottle, conversionFactor: 15, costPrice: 1500, sellingPrice: 3000, minStock: 10, opening: 24 }),
    product({ id: whisky, name: 'Johnnie Walker Red Label', categoryId: spirits, sku: 'SPIRIT-JW', stockUnitId: tot, receiveUnitId: bottle, conversionFactor: 15, costPrice: 2800, sellingPrice: 5000, minStock: 8, opening: 20 }),
    product({ id: wine, name: 'House Red Wine', categoryId: wines, sku: 'WINE-RED', stockUnitId: glass, receiveUnitId: bottle, conversionFactor: 5, costPrice: 3000, sellingPrice: 6000, minStock: 6, opening: 15 }),
    product({ id: energy, name: 'Mo Energy', categoryId: juice, sku: 'JUICE-MO', stockUnitId: can, receiveUnitId: can, conversionFactor: 1, costPrice: 1400, sellingPrice: 2500, minStock: 12, opening: 8 }),
    product({ id: nuts, name: 'Roasted Peanuts', categoryId: misc, sku: 'MISC-NUTS', stockUnitId: piece, receiveUnitId: piece, conversionFactor: 1, costPrice: 800, sellingPrice: 2000, minStock: 8, opening: 25 }),
  ]

  const sales: SalesTransaction[] = []
  const stockIns: StockInTransaction[] = []
  const activities: ActivityTransaction[] = []
  const movements: InventoryMovement[] = []
  const auditLogs: AuditLog[] = []
  let stockInCount = 0
  let saleCount = 0
  let activityCount = 0
  let adjustmentCount = 0

  const priceOf = (productId: string) => products.find((item) => item.id === productId)!

  const log = (actorId: string, action: string, entityType: string, entityId: string, summary: string, at: string) => {
    auditLogs.push({ id: nextId('a0000000-0000-4000-8000'), actorId, action, entityType, entityId, summary, createdAt: at })
  }

  for (const item of products) {
    movements.push({
      id: nextId('90000000-0000-4000-8000'),
      productId: item.id,
      type: 'opening',
      quantity: item.opening,
      unitCost: item.costPrice,
      referenceType: 'opening',
      referenceId: item.id,
      note: 'Opening balance',
      createdBy: admin,
      createdAt: isoDaysAgo(45, 8),
    })
  }

  const addSale = (
    status: SalesTransaction['status'],
    by: string,
    at: string,
    lines: Array<[string, number]>,
    reason?: string,
  ) => {
    saleCount += 1
    const id = nextId('70000000-0000-4000-8000')
    const code = `SL-${String(saleCount).padStart(4, '0')}`
    const items: SalesItem[] = lines.map(([productId, quantity]) => {
      const item = priceOf(productId)
      return { id: nextId('80000000-0000-4000-8000'), productId, quantity, unitPrice: item.sellingPrice, unitCost: item.costPrice, sizeName: 'one', portion: 'full' }
    })
    const reviewedAt = status === 'pending' ? undefined : plusMinutes(at, 12)
    sales.push({
      id,
      code,
      customerName: 'Walk-in',
      paymentStatus: status === 'approved' ? 'paid' : 'unpaid',
      recordKind: status === 'approved' ? 'sale' : 'bill',
      generatedAt: at,
      notes: '',
      status,
      submittedBy: by,
      submittedAt: at,
      reviewedBy: status === 'pending' ? undefined : admin,
      reviewedAt,
      rejectionReason: reason,
      items,
    })
    if (status === 'approved' && reviewedAt) {
      for (const item of items) {
        movements.push({
          id: nextId('90000000-0000-4000-8000'),
          productId: item.productId,
          type: 'sale',
          quantity: -item.quantity,
          unitCost: item.unitCost,
          referenceType: 'sale',
          referenceId: id,
          note: `Approved sale ${code}`,
          createdBy: admin,
          createdAt: reviewedAt,
        })
      }
      log(admin, 'sale.approve', 'sale', id, `Approved sale ${code}.`, reviewedAt)
    } else if (status === 'rejected' && reviewedAt) {
      log(admin, 'sale.reject', 'sale', id, `Rejected sale ${code}. ${reason ?? ''}`, reviewedAt)
    } else {
      log(by, 'sale.submit', 'sale', id, `Submitted sale ${code} for approval.`, at)
    }
    return id
  }

  const addStock = (
    status: StockInTransaction['status'],
    by: string,
    at: string,
    deliveryDate: string,
    supplierId: string,
    supplierName: string,
    invoiceRef: string,
    lines: Array<[string, number, number]>,
    reason?: string,
  ) => {
    stockInCount += 1
    const id = nextId('70000000-0000-4000-8000')
    const code = `SI-${String(stockInCount).padStart(4, '0')}`
    const items: StockInItem[] = lines.map(([productId, receivedQuantity, costPerStockUnit]) => {
      const item = priceOf(productId)
      const stockQuantity = receivedQuantity * item.conversionFactor
      return {
        id: nextId('80000000-0000-4000-8000'),
        productId,
        receivedQuantity,
        receiveUnitId: item.receiveUnitId,
        conversionFactor: item.conversionFactor,
        stockQuantity,
        costPerStockUnit,
        totalCost: costPerStockUnit * stockQuantity,
      }
    })
    const reviewedAt = status === 'pending' ? undefined : plusMinutes(at, 15)
    stockIns.push({
      id,
      code,
      supplierId,
      supplierName,
      deliveryDate,
      invoiceRef,
      notes: '',
      status,
      submittedBy: by,
      submittedAt: at,
      reviewedBy: status === 'pending' ? undefined : admin,
      reviewedAt,
      rejectionReason: reason,
      items,
    })
    if (status === 'approved' && reviewedAt) {
      for (const item of items) {
        movements.push({
          id: nextId('90000000-0000-4000-8000'),
          productId: item.productId,
          type: 'stock_in',
          quantity: item.stockQuantity,
          unitCost: item.costPerStockUnit,
          referenceType: 'stock_in',
          referenceId: id,
          note: `Approved delivery ${code}`,
          createdBy: admin,
          createdAt: reviewedAt,
        })
      }
      log(admin, 'stock_in.approve', 'stock_in', id, `Approved delivery ${code}.`, reviewedAt)
    } else if (status === 'rejected' && reviewedAt) {
      log(admin, 'stock_in.reject', 'stock_in', id, `Rejected delivery ${code}. ${reason ?? ''}`, reviewedAt)
    } else {
      log(by, 'stock_in.submit', 'stock_in', id, `Submitted delivery ${code} for approval.`, at)
    }
  }

  const addActivity = (
    status: ActivityTransaction['status'],
    typeId: string,
    by: string,
    at: string,
    quantity: number,
    unitPrice: number,
    amount: number,
    reason?: string,
  ) => {
    activityCount += 1
    const id = nextId('70000000-0000-4000-8000')
    const code = `AC-${String(activityCount).padStart(4, '0')}`
    const reviewedAt = status === 'pending' ? undefined : plusMinutes(at, 8)
    activities.push({
      id,
      code,
      activityTypeId: typeId,
      quantity,
      unitPrice,
      amount,
      paymentMethod: 'cash',
      notes: '',
      occurredAt: at,
      status,
      submittedBy: by,
      submittedAt: at,
      reviewedBy: status === 'pending' ? undefined : admin,
      reviewedAt,
      rejectionReason: reason,
    })
    const label = typeId === pool ? 'pool table' : 'korokoro'
    if (status === 'approved' && reviewedAt) log(admin, 'activity.approve', 'activity', id, `Approved ${label} collection ${code}.`, reviewedAt)
    else if (status === 'rejected' && reviewedAt) log(admin, 'activity.reject', 'activity', id, `Rejected ${label} collection ${code}. ${reason ?? ''}`, reviewedAt)
    else log(by, 'activity.submit', 'activity', id, `Submitted ${label} collection ${code} for approval.`, at)
  }

  addSale('approved', amina, monthsAgoStamp(3, 18, 18), [[safari, 5], [water, 6], [fanta, 4]])
  addSale('approved', joseph, monthsAgoStamp(2, 12, 20), [[safari, 8], [kili, 6], [coke, 6]])
  addSale('approved', amina, monthsAgoStamp(1, 15, 19), [[safari, 10], [coke, 10], [water, 8]])
  addActivity('approved', pool, amina, monthsAgoStamp(3, 18, 21), 4, 2000, 8000)
  addActivity('approved', korokoro, amina, monthsAgoStamp(3, 18, 21), 4, 1000, 4000)
  addActivity('approved', pool, amina, monthsAgoStamp(2, 12, 21), 6, 2000, 12000)
  addActivity('approved', korokoro, amina, monthsAgoStamp(2, 12, 21), 6, 1000, 6000)
  addActivity('approved', pool, amina, monthsAgoStamp(1, 15, 21), 8, 2000, 16000)
  addActivity('approved', korokoro, amina, monthsAgoStamp(1, 15, 21), 8, 1000, 8000)

  addSale('approved', amina, isoDaysAgo(6, 17), [[fanta, 4], [water, 6], [whisky, 8], [nuts, 3], [energy, 2]])
  addSale('approved', joseph, isoDaysAgo(5, 22), [[sere, 4], [coke, 8], [sprite, 6], [konyagi, 6], [wine, 4]])
  addSale('approved', amina, isoDaysAgo(4, 18), [[kili, 4], [fanta, 6], [water, 6], [whisky, 6]])
  addSale('approved', joseph, isoDaysAgo(3, 21), [[kili, 6], [coke, 8], [sprite, 6], [energy, 4]])
  addSale('approved', amina, isoDaysAgo(2, 19), [[safari, 4], [sere, 4], [wine, 3], [nuts, 2]])
  addSale('approved', joseph, isoDaysAgo(1, 20), [[safari, 8], [fanta, 4], [water, 6], [konyagi, 4]])
  addSale('approved', amina, minutesAgo(120), [[safari, 6], [coke, 4]])
  addSale('pending', joseph, minutesAgo(40), [[safari, 6], [coke, 12]])
  addSale('rejected', joseph, isoDaysAgo(1, 16), [[whisky, 10]], 'Quantity does not match the evening count. Please resubmit the correct number of tots.')

  addStock('approved', amina, isoDaysAgo(3, 10), dateKeyDaysAgo(3), tbl, 'Tanzania Breweries Distributor', 'INV-2401', [[safari, 1, 1800]])
  addStock('approved', joseph, isoDaysAgo(4, 11), dateKeyDaysAgo(4), bonite, 'Bonite Bottlers', 'INV-1884', [[coke, 1, 800]])
  addStock('approved', amina, minutesAgo(200), dateKey(), local, 'Arusha Wholesale Drinks', 'INV-3102', [[water, 1, 400]])
  addStock('pending', joseph, minutesAgo(160), dateKey(), tbl, 'Tanzania Breweries Distributor', '', [[safari, 2, 1800]])
  addStock('rejected', amina, isoDaysAgo(2, 9), dateKeyDaysAgo(2), local, 'Arusha Wholesale Drinks', '', [[nuts, 10, 800]], 'Invoice reference is missing.')

  adjustmentCount += 1
  const adjustmentAt = isoDaysAgo(8, 15)
  movements.push({
    id: nextId('90000000-0000-4000-8000'),
    productId: fanta,
    type: 'adjustment',
    quantity: -2,
    unitCost: 800,
    referenceType: 'adjustment',
    referenceId: 'ADJ-0001',
    note: 'Breakages found during the shelf count.',
    createdBy: admin,
    createdAt: adjustmentAt,
  })
  log(admin, 'inventory.adjust', 'adjustment', 'ADJ-0001', 'Adjusted Fanta Orange by -2. Breakages found during the shelf count.', adjustmentAt)

  addActivity('approved', pool, amina, isoDaysAgo(2, 22), 6, 2000, 12000)
  addActivity('approved', korokoro, amina, isoDaysAgo(3, 22), 7, 1000, 7000)
  addActivity('approved', pool, amina, isoDaysAgo(1, 21), 8, 2000, 16000)
  addActivity('approved', korokoro, amina, isoDaysAgo(1, 21), 9, 1000, 9000)
  addActivity('approved', pool, amina, minutesAgo(90), 10, 2000, 20000)
  addActivity('approved', korokoro, amina, minutesAgo(70), 12, 1000, 12000)
  addActivity('pending', pool, amina, minutesAgo(25), 4, 2000, 8000)
  addActivity('pending', korokoro, amina, minutesAgo(12), 3, 1000, 3000)
  addActivity('rejected', pool, amina, isoDaysAgo(2, 15), 4, 2000, 50000, 'Amount is far above the game count. Please correct it.')

  const catalog = products.map(({ opening: _opening, ...item }) => item)
  const expected: Record<string, number> = {
    [safari]: 48,
    [kili]: 26,
    [sere]: 10,
    [coke]: 40,
    [fanta]: 6,
    [sprite]: 0,
    [water]: 42,
    [konyagi]: 14,
    [whisky]: 6,
    [wine]: 8,
    [energy]: 2,
    [nuts]: 20,
  }
  const draft: Database = {
    version: 1,
    accounts: [],
    resetTokens: [],
    profiles: [
      { id: admin, fullName: 'Neema Lyimo', username: 'neema', email: 'admin@manyarapub.co.tz', phone: '+255700000001', role: 'admin', isActive: true, canSubmitActivities: true, canViewStock: true, createdAt: created, updatedAt: created },
      { id: amina, fullName: 'Amina Hassan', username: 'amina', email: 'amina@manyarapub.co.tz', phone: '+255700000002', role: 'employee', isActive: true, canSubmitActivities: true, canViewStock: true, createdAt: created, updatedAt: created },
      { id: joseph, fullName: 'Joseph Mwangi', username: 'joseph', email: 'joseph@manyarapub.co.tz', phone: '+255700000003', role: 'employee', isActive: true, canSubmitActivities: false, canViewStock: true, createdAt: created, updatedAt: created },
    ],
    categories: [
      [beer, 'Beers', 'Bottled and draught beers'],
      [spirits, 'Spirits and liquor', 'Spirits sold by the tot or bottle'],
      [wines, 'Wines', 'Wine by the glass or bottle'],
      [soft, 'Soft drinks', 'Fizzy drinks'],
      [waterCat, 'Water', 'Still and sparkling water'],
      [juice, 'Juices and energy drinks', 'Juices and energy drinks'],
      [other, 'Other beverages', 'Anything that does not fit the main drink groups'],
      [misc, 'Miscellaneous stock', 'Snacks and other bar stock'],
    ].map(([id, name, description]) => ({ id, name, description, isActive: true, createdAt: created, updatedAt: created })),
    units: [
      { id: bottle, name: 'Bottle', abbreviation: 'btl' },
      { id: can, name: 'Can', abbreviation: 'can' },
      { id: crate, name: 'Crate', abbreviation: 'crate' },
      { id: carton, name: 'Carton', abbreviation: 'ctn' },
      { id: tot, name: 'Tot', abbreviation: 'tot' },
      { id: glass, name: 'Glass', abbreviation: 'glass' },
      { id: piece, name: 'Piece', abbreviation: 'pc' },
    ],
    products: catalog,
    suppliers: [
      { id: tbl, name: 'Tanzania Breweries Distributor', phone: '+255700100001', isActive: true, createdAt: created },
      { id: bonite, name: 'Bonite Bottlers', phone: '+255700100002', isActive: true, createdAt: created },
      { id: local, name: 'Arusha Wholesale Drinks', phone: '+255700100003', isActive: true, createdAt: created },
    ],
    stockIns,
    sales,
    movements,
    activityTypes: [
      { id: pool, name: 'Pool table', code: 'pool_table', pricingMode: 'per_game', unitPrice: 2000, unitLabel: 'game', isActive: true, updatedAt: created },
      { id: korokoro, name: 'Korokoro machine', code: 'korokoro', pricingMode: 'per_play', unitPrice: 1000, unitLabel: 'play', isActive: true, updatedAt: created },
    ],
    activities,
    expenses: [
      {
        id: '10000000-0000-4000-8000-0000000000e1',
        code: 'EX-0001',
        description: 'Charcoal for the grill',
        amount: 15000,
        spentOn: dateKeyDaysAgo(1),
        notes: '',
        status: 'pending',
        submittedBy: amina,
        submittedAt: isoDaysAgo(1, 18),
      },
    ] satisfies ExpenseTransaction[],
    notifications: [],
    auditLogs: auditLogs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    settings: {
      businessName: 'Manyara Pub',
      currency: 'TZS',
      currencySymbol: 'TSh',
      lowStockAlerts: true,
      updatedAt: created,
    },
    counters: { stockIn: stockInCount, sale: saleCount, activity: activityCount, expense: 1, adjustment: adjustmentCount },
  }

  for (const item of catalog) {
    const snap = snapshotFor(draft, item.id)
    if (snap.confirmed !== expected[item.id]) {
      throw new Error(`Seed stock mismatch for ${item.name}: expected ${expected[item.id]}, got ${snap.confirmed}`)
    }
  }
  const safariSnap = snapshotFor(draft, safari)
  const cokeSnap = snapshotFor(draft, coke)
  if (safariSnap.available !== 48 || cokeSnap.available !== 40) {
    throw new Error('Seed reservations do not match the expected available stock.')
  }

  const withAlerts = syncStockAlerts(draft, minutesAgo(5))
  const pendingNotes = [
    ['Delivery SI-0004 has no invoice reference and is waiting for approval.', '/admin/approvals'],
    ['Sale SL-0008 is waiting for approval.', '/admin/approvals'],
    ['A pool table collection is waiting for approval.', '/admin/approvals'],
    ['A korokoro collection is waiting for approval.', '/admin/approvals'],
    ['Expense EX-0001 is waiting for approval.', '/admin/approvals'],
  ] as const
  const notifications = [...withAlerts.notifications]
  pendingNotes.forEach(([message, href], index) => {
    notifications.unshift({
      id: nextId('b0000000-0000-4000-8000'),
      recipientId: admin,
      type: 'submission_pending',
      title: 'Submission waiting for review',
      message,
      href,
      read: false,
      createdAt: minutesAgo(10 + index),
      channels: ['in_app'],
    })
  })
  notifications.unshift(
    {
      id: nextId('b0000000-0000-4000-8000'),
      recipientId: joseph,
      type: 'submission_rejected',
      title: 'Sale needs a correction',
      message: 'Sale was rejected: Quantity does not match the evening count. Please resubmit the correct number of tots.',
      href: '/employee/submissions',
      read: false,
      createdAt: isoDaysAgo(1, 16),
      channels: ['in_app'],
    },
    {
      id: nextId('b0000000-0000-4000-8000'),
      recipientId: amina,
      type: 'submission_rejected',
      title: 'Delivery needs a correction',
      message: 'Delivery was rejected: Invoice reference is missing.',
      href: '/employee/submissions',
      read: false,
      createdAt: isoDaysAgo(2, 9),
      channels: ['in_app'],
    },
  )

  return { ...withAlerts, notifications }
}
