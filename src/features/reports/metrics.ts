import { allSnapshots, snapshotFor } from '@/features/inventory/stock'
import type { Database, StockSnapshot } from '@/types'
import {
  asDateKey,
  eachDateKey,
  formatDayLabel,
  inDateRange,
  monthKeyFromValue,
  monthLabel,
  recentDateKeys,
  recentMonthKeys,
  weekStartKey,
} from '@/utils/dates'
import { saleCost, saleTotal, recordedTotal, stockInTotal, stockInUnits } from '@/utils/labels'

export interface DashboardData {
  activeProducts: number
  totalUnits: number
  lowCount: number
  outCount: number
  pendingStockIn: number
  pendingSales: number
  pendingActivities: number
  pendingExpenses: number
  todaySalesRevenue: number
  yesterdaySalesRevenue: number
  todayStockReceivedUnits: number
  todayStockReceivedCost: number
  todayPool: number
  todayKorokoro: number
  todayTotalRevenue: number
  last7Days: Array<{ key: string; label: string; revenue: number; units: number }>
  last6Months: Array<{ key: string; label: string; revenue: number }>
  bestSellers: Array<{ name: string; imageUrl?: string; units: number; revenue: number }>
  movementTrend: Array<{ key: string; label: string; received: number; sold: number }>
  breakdown: Array<{ name: string; value: number }>
  lowProducts: Array<{ id: string; name: string; imageUrl?: string; available: number; minimum: number; level: StockSnapshot['level'] }>
  recent: Array<{ id: string; at: string; summary: string; action: string; actor: string }>
}

function approvedSales(db: Database) {
  return db.sales.filter((sale) => sale.status === 'approved' && sale.reviewedAt && !sale.isLoss && !(sale.recordKind === 'bill' && sale.paymentStatus !== 'paid'))
}

function revenueOn(db: Database, key: string) {
  return approvedSales(db)
    .filter((sale) => asDateKey(sale.reviewedAt ?? '') === key)
    .reduce((sum, sale) => sum + recordedTotal(sale), 0)
}

function activityOn(db: Database, key: string, code?: 'pool_table' | 'korokoro') {
  return db.activities
    .filter((activity) => activity.status === 'approved')
    .filter((activity) => asDateKey(activity.occurredAt) === key)
    .filter((activity) => {
      if (!code) return true
      return db.activityTypes.find((type) => type.id === activity.activityTypeId)?.code === code
    })
    .reduce((sum, activity) => sum + activity.amount, 0)
}

export function buildDashboard(db: Database, now = new Date()): DashboardData {
  const snapshots = allSnapshots(db)
  const active = db.products.filter((product) => product.isActive)
  const today = asDateKey(now.toISOString())
  const yesterday = recentDateKeys(2, now)[0]
  const days = recentDateKeys(7, now)
  const months = recentMonthKeys(6, now)
  const todaySalesRevenue = revenueOn(db, today)
  const todayPool = activityOn(db, today, 'pool_table')
  const todayKorokoro = activityOn(db, today, 'korokoro')
  const receivedToday = db.stockIns.filter(
    (entry) => entry.status === 'approved' && entry.deliveryDate === today,
  )

  const sellerMap = new Map<string, { name: string; units: number; revenue: number; imageUrl?: string }>()
  const since = recentDateKeys(30, now)[0]
  for (const sale of approvedSales(db)) {
    if (asDateKey(sale.reviewedAt ?? '') < since) continue
    for (const item of sale.items) {
      const product = db.products.find((entry) => entry.id === item.productId)
      const current = sellerMap.get(item.productId) ?? {
        name: product?.name ?? 'Product',
        imageUrl: product?.imageUrl,
        units: 0,
        revenue: 0,
      }
      current.units += item.quantity
      current.revenue += item.quantity * item.unitPrice
      sellerMap.set(item.productId, current)
    }
  }

  const monthTotals = new Map<string, number>(months.map((key) => [key, 0]))
  for (const sale of approvedSales(db)) {
    const key = monthKeyFromValue(sale.reviewedAt ?? '')
    if (monthTotals.has(key)) monthTotals.set(key, (monthTotals.get(key) ?? 0) + recordedTotal(sale))
  }
  for (const activity of db.activities.filter((entry) => entry.status === 'approved')) {
    const key = monthKeyFromValue(activity.occurredAt)
    if (monthTotals.has(key)) monthTotals.set(key, (monthTotals.get(key) ?? 0) + activity.amount)
  }

  const thirtyStart = since
  let beverage = 0
  let pool = 0
  let korokoro = 0
  for (const sale of approvedSales(db)) {
    if (asDateKey(sale.reviewedAt ?? '') >= thirtyStart) beverage += recordedTotal(sale)
  }
  for (const activity of db.activities.filter((entry) => entry.status === 'approved')) {
    if (asDateKey(activity.occurredAt) < thirtyStart) continue
    const code = db.activityTypes.find((type) => type.id === activity.activityTypeId)?.code
    if (code === 'pool_table') pool += activity.amount
    if (code === 'korokoro') korokoro += activity.amount
  }

  return {
    activeProducts: active.length,
    totalUnits: snapshots.filter((snap) => active.some((product) => product.id === snap.productId)).reduce((sum, snap) => sum + snap.confirmed, 0),
    lowCount: snapshots.filter((snap) => active.some((product) => product.id === snap.productId) && snap.level === 'low').length,
    outCount: snapshots.filter((snap) => active.some((product) => product.id === snap.productId) && snap.level === 'out').length,
    pendingStockIn: db.stockIns.filter((entry) => entry.status === 'pending').length,
    pendingSales: db.sales.filter((entry) => entry.status === 'pending').length,
    pendingActivities: db.activities.filter((entry) => entry.status === 'pending').length,
    pendingExpenses: db.expenses.filter((entry) => entry.status === 'pending').length,
    todaySalesRevenue,
    yesterdaySalesRevenue: revenueOn(db, yesterday),
    todayStockReceivedUnits: receivedToday.reduce((sum, entry) => sum + stockInUnits(entry.items), 0),
    todayStockReceivedCost: receivedToday.reduce((sum, entry) => sum + stockInTotal(entry.items), 0),
    todayPool,
    todayKorokoro,
    todayTotalRevenue: todaySalesRevenue + todayPool + todayKorokoro,
    last7Days: days.map((key) => ({
      key,
      label: formatDayLabel(key),
      revenue: revenueOn(db, key),
      units: approvedSales(db)
        .filter((sale) => asDateKey(sale.reviewedAt ?? '') === key)
        .reduce((sum, sale) => sum + sale.items.reduce((line, item) => line + item.quantity, 0), 0),
    })),
    last6Months: months.map((key) => ({ key, label: monthLabel(key), revenue: monthTotals.get(key) ?? 0 })),
    bestSellers: [...sellerMap.values()].sort((a, b) => b.units - a.units).slice(0, 5),
    movementTrend: days.map((key) => ({
      key,
      label: formatDayLabel(key),
      received: db.stockIns
        .filter((entry) => entry.status === 'approved' && asDateKey(entry.reviewedAt ?? '') === key)
        .reduce((sum, entry) => sum + stockInUnits(entry.items), 0),
      sold: db.movements
        .filter((movement) => movement.type === 'sale' && asDateKey(movement.createdAt) === key)
        .reduce((sum, movement) => sum + (movement.quantity < 0 ? -movement.quantity : 0), 0),
    })),
    breakdown: [
      { name: 'Beverage sales', value: beverage },
      { name: 'Pool table', value: pool },
      { name: 'Korokoro', value: korokoro },
    ],
    lowProducts: active
      .map((product) => {
        const snap = snapshots.find((item) => item.productId === product.id) ?? snapshotFor(db, product.id)
        return { id: product.id, name: product.name, imageUrl: product.imageUrl, available: snap.available, minimum: snap.minimum, level: snap.level }
      })
      .filter((product) => product.level !== 'normal')
      .sort((a, b) => a.available - b.available),
    recent: [...db.auditLogs]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 8)
      .map((log) => ({
        id: log.id,
        at: log.createdAt,
        summary: log.summary,
        action: log.action,
        actor: db.profiles.find((profile) => profile.id === log.actorId)?.fullName ?? 'System',
      })),
  }
}

export interface ReportFilters {
  from: string
  to: string
  categoryId: string
}

export interface InventoryReportRow {
  id: string
  name: string
  imageUrl?: string
  sku: string
  category: string
  unit: string
  confirmed: number
  reserved: number
  available: number
  minimum: number
  level: StockSnapshot['level']
  costValue: number
  retailValue: number
}

export interface ReportData {
  inventory: InventoryReportRow[]
  low: InventoryReportRow[]
  out: InventoryReportRow[]
  received: Array<Record<string, string | number>>
  sold: Array<Record<string, string | number>>
  adjustments: Array<Record<string, string | number>>
  movements: Array<Record<string, string | number>>
  salesByDay: Array<{ date: string; label: string; revenue: number; units: number }>
  salesByWeek: Array<{ week: string; revenue: number; units: number }>
  salesByMonth: Array<{ month: string; revenue: number; units: number }>
  salesByEmployee: Array<{ name: string; revenue: number; transactions: number }>
  salesByProduct: Array<{ name: string; imageUrl?: string; category: string; units: number; revenue: number; cost: number; profit: number }>
  salesByCategory: Array<{ name: string; units: number; revenue: number }>
  pending: Array<Record<string, string | number>>
  rejected: Array<Record<string, string | number>>
  beverageRevenue: number
  poolRevenue: number
  korokoroRevenue: number
  totalRevenue: number
  cogs: number
  grossProfit: number
  costIncomplete: boolean
}

function categoryName(db: Database, categoryId: string) {
  return db.categories.find((category) => category.id === categoryId)?.name ?? 'Uncategorised'
}

function matchesCategory(db: Database, productId: string, categoryId: string) {
  if (categoryId === 'all') return true
  return db.products.find((product) => product.id === productId)?.categoryId === categoryId
}

export function buildReport(db: Database, filters: ReportFilters): ReportData {
  const rows: InventoryReportRow[] = db.products
    .filter((product) => matchesCategory(db, product.id, filters.categoryId))
    .map((product) => {
      const snap = snapshotFor(db, product.id)
      const unit = db.units.find((item) => item.id === product.stockUnitId)?.abbreviation ?? ''
      return {
        id: product.id,
        name: product.name,
        imageUrl: product.imageUrl,
        sku: product.sku,
        category: categoryName(db, product.categoryId),
        unit,
        confirmed: snap.confirmed,
        reserved: snap.reserved,
        available: snap.available,
        minimum: snap.minimum,
        level: snap.level,
        costValue: snap.confirmed * product.costPrice,
        retailValue: snap.confirmed * product.sellingPrice,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const approved = db.sales.filter(
    (sale) => sale.status === 'approved' && sale.reviewedAt && inDateRange(sale.reviewedAt, filters.from, filters.to),
  )

  const productMap = new Map<string, ReportData['salesByProduct'][number]>()
  const categoryMap = new Map<string, { name: string; units: number; revenue: number }>()
  const employeeMap = new Map<string, { name: string; revenue: number; transactions: number }>()
  const dayMap = new Map<string, { revenue: number; units: number }>()
  let beverageRevenue = 0
  let cogs = 0
  let costIncomplete = false

  for (const key of eachDateKey(filters.from, filters.to)) dayMap.set(key, { revenue: 0, units: 0 })

  for (const sale of approved) {
    if (typeof sale.settledAmount === 'number') {
      if (filters.categoryId !== 'all') continue
      beverageRevenue += sale.settledAmount
      const day = asDateKey(sale.reviewedAt ?? '')
      const bucket = dayMap.get(day) ?? { revenue: 0, units: 0 }
      bucket.revenue += sale.settledAmount
      dayMap.set(day, bucket)
      const employee = employeeMap.get(sale.submittedBy) ?? {
        name: db.profiles.find((profile) => profile.id === sale.submittedBy)?.fullName ?? 'Employee',
        revenue: 0,
        transactions: 0,
      }
      employee.revenue += sale.settledAmount
      employee.transactions += 1
      employeeMap.set(sale.submittedBy, employee)
      continue
    }
    const included = sale.items.filter((item) => matchesCategory(db, item.productId, filters.categoryId))
    if (!included.length) continue
    const revenue = saleTotal(included)
    const cost = saleCost(included)
    beverageRevenue += revenue
    cogs += cost
    if (included.some((item) => item.unitCost <= 0)) costIncomplete = true
    const day = asDateKey(sale.reviewedAt ?? '')
    const bucket = dayMap.get(day) ?? { revenue: 0, units: 0 }
    bucket.revenue += revenue
    bucket.units += included.reduce((sum, item) => sum + item.quantity, 0)
    dayMap.set(day, bucket)

    const employee = employeeMap.get(sale.submittedBy) ?? {
      name: db.profiles.find((profile) => profile.id === sale.submittedBy)?.fullName ?? 'Employee',
      revenue: 0,
      transactions: 0,
    }
    employee.revenue += revenue
    employee.transactions += 1
    employeeMap.set(sale.submittedBy, employee)

    for (const item of included) {
      const product = db.products.find((entry) => entry.id === item.productId)
      const current = productMap.get(item.productId) ?? {
        name: product?.name ?? 'Product',
        imageUrl: product?.imageUrl,
        category: categoryName(db, product?.categoryId ?? ''),
        units: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
      }
      current.units += item.quantity
      current.revenue += item.quantity * item.unitPrice
      current.cost += item.quantity * item.unitCost
      current.profit = current.revenue - current.cost
      productMap.set(item.productId, current)

      const catName = categoryName(db, product?.categoryId ?? '')
      const cat = categoryMap.get(catName) ?? { name: catName, units: 0, revenue: 0 }
      cat.units += item.quantity
      cat.revenue += item.quantity * item.unitPrice
      categoryMap.set(catName, cat)
    }
  }

  const weekMap = new Map<string, { revenue: number; units: number }>()
  const monthMap = new Map<string, { revenue: number; units: number }>()
  for (const [key, value] of dayMap) {
    const week = weekStartKey(key)
    const weekBucket = weekMap.get(week) ?? { revenue: 0, units: 0 }
    weekBucket.revenue += value.revenue
    weekBucket.units += value.units
    weekMap.set(week, weekBucket)
    const month = key.slice(0, 7)
    const monthBucket = monthMap.get(month) ?? { revenue: 0, units: 0 }
    monthBucket.revenue += value.revenue
    monthBucket.units += value.units
    monthMap.set(month, monthBucket)
  }

  let poolRevenue = 0
  let korokoroRevenue = 0
  if (filters.categoryId === 'all') {
    for (const activity of db.activities) {
      if (activity.status !== 'approved' || !inDateRange(activity.occurredAt, filters.from, filters.to)) continue
      const code = db.activityTypes.find((type) => type.id === activity.activityTypeId)?.code
      if (code === 'pool_table') poolRevenue += activity.amount
      if (code === 'korokoro') korokoroRevenue += activity.amount
    }
  }

  const person = (id: string) => db.profiles.find((profile) => profile.id === id)?.fullName ?? 'Unknown'

  return {
    inventory: rows,
    low: rows.filter((row) => row.level === 'low'),
    out: rows.filter((row) => row.level === 'out'),
    received: db.stockIns
      .filter((entry) => entry.status === 'approved' && inDateRange(entry.deliveryDate, filters.from, filters.to))
      .flatMap((entry) =>
        entry.items
          .filter((item) => matchesCategory(db, item.productId, filters.categoryId))
          .map((item) => ({
            code: entry.code,
            date: entry.deliveryDate,
            product: db.products.find((product) => product.id === item.productId)?.name ?? 'Product',
            units: item.stockQuantity,
            cost: item.totalCost,
            supplier: entry.supplierName,
            employee: person(entry.submittedBy),
          })),
      ),
    sold: [...productMap.values()]
      .sort((a, b) => b.units - a.units)
      .map((row) => ({
        product: row.name,
        category: row.category,
        units: row.units,
        revenue: row.revenue,
        cost: row.cost,
        profit: row.profit,
      })),
    adjustments: db.movements
      .filter(
        (movement) =>
          movement.type === 'adjustment' &&
          inDateRange(movement.createdAt, filters.from, filters.to) &&
          matchesCategory(db, movement.productId, filters.categoryId),
      )
      .map((movement) => ({
        date: asDateKey(movement.createdAt),
        product: db.products.find((product) => product.id === movement.productId)?.name ?? 'Product',
        change: movement.quantity,
        note: movement.note,
        by: person(movement.createdBy),
      })),
    movements: db.movements
      .filter(
        (movement) =>
          inDateRange(movement.createdAt, filters.from, filters.to) &&
          matchesCategory(db, movement.productId, filters.categoryId),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((movement) => ({
        date: asDateKey(movement.createdAt),
        product: db.products.find((product) => product.id === movement.productId)?.name ?? 'Product',
        type: movement.type,
        quantity: movement.quantity,
        note: movement.note,
      })),
    salesByDay: [...dayMap.entries()].map(([date, value]) => ({
      date,
      label: formatDayLabel(date),
      revenue: value.revenue,
      units: value.units,
    })),
    salesByWeek: [...weekMap.entries()].map(([week, value]) => ({ week, ...value })),
    salesByMonth: [...monthMap.entries()].map(([month, value]) => ({
      month: monthLabel(month),
      revenue: value.revenue,
      units: value.units,
    })),
    salesByEmployee: [...employeeMap.values()].sort((a, b) => b.revenue - a.revenue),
    salesByProduct: [...productMap.values()].sort((a, b) => b.revenue - a.revenue),
    salesByCategory: [...categoryMap.values()].sort((a, b) => b.revenue - a.revenue),
    pending: db.sales
      .filter((sale) => sale.status === 'pending' && inDateRange(sale.submittedAt, filters.from, filters.to))
      .map((sale) => ({
        code: sale.code,
        employee: person(sale.submittedBy),
        total: saleTotal(sale.items.filter((item) => matchesCategory(db, item.productId, filters.categoryId))),
        status: sale.status,
      })),
    rejected: db.sales
      .filter((sale) => sale.status === 'rejected' && inDateRange(sale.submittedAt, filters.from, filters.to))
      .map((sale) => ({
        code: sale.code,
        employee: person(sale.submittedBy),
        total: saleTotal(sale.items),
        reason: sale.rejectionReason ?? '',
      })),
    beverageRevenue,
    poolRevenue,
    korokoroRevenue,
    totalRevenue: beverageRevenue + poolRevenue + korokoroRevenue,
    cogs,
    grossProfit: beverageRevenue - cogs,
    costIncomplete,
  }
}

export interface DayStatement {
  date: string
  sold: Array<{ name: string; units: number; revenue: number; cost: number; profit: number }>
  bought: Array<{ name: string; units: number; cost: number }>
  expenses: Array<{ description: string; amount: number }>
  otherIncome: Array<{ name: string; amount: number }>
  salesRevenue: number
  goodsCost: number
  goodsProfit: number
  otherIncomeTotal: number
  expensesTotal: number
  net: number
  available: Array<{ name: string; available: number; minimum: number; buy: number }>
  toBuy: Array<{ name: string; available: number; minimum: number; buy: number }>
}

export function buildDayStatement(db: Database, day: string): DayStatement {
  const soldMap = new Map<string, { name: string; units: number; revenue: number; cost: number; profit: number }>()
  let salesRevenue = 0
  let goodsCost = 0
  for (const sale of approvedSales(db)) {
    if (asDateKey(sale.reviewedAt ?? sale.submittedAt) !== day) continue
    if (typeof sale.settledAmount === 'number') {
      salesRevenue += sale.settledAmount
      const label = sale.customerName ? `Bill payment · ${sale.customerName}` : 'Bill payment'
      const current = soldMap.get(label) ?? { name: label, units: 0, revenue: 0, cost: 0, profit: 0 }
      current.revenue += sale.settledAmount
      current.profit += sale.settledAmount
      soldMap.set(label, current)
      continue
    }
    for (const item of sale.items) {
      const product = db.products.find((entry) => entry.id === item.productId)
      const name = product?.name ?? 'Product'
      const current = soldMap.get(item.productId) ?? { name, units: 0, revenue: 0, cost: 0, profit: 0 }
      current.units += item.quantity
      current.revenue += item.quantity * item.unitPrice
      current.cost += item.quantity * item.unitCost
      current.profit = current.revenue - current.cost
      soldMap.set(item.productId, current)
      salesRevenue += item.quantity * item.unitPrice
      goodsCost += item.quantity * item.unitCost
    }
  }

  const boughtMap = new Map<string, { name: string; units: number; cost: number }>()
  for (const entry of db.stockIns) {
    if (entry.status !== 'approved' || entry.deliveryDate !== day) continue
    for (const item of entry.items) {
      const product = db.products.find((row) => row.id === item.productId)
      const name = product?.name ?? 'Product'
      const current = boughtMap.get(item.productId) ?? { name, units: 0, cost: 0 }
      current.units += item.stockQuantity
      current.cost += item.totalCost
      boughtMap.set(item.productId, current)
    }
  }

  const expenses = db.expenses
    .filter((item) => item.status === 'approved' && item.spentOn === day)
    .map((item) => ({ description: item.description, amount: item.amount }))
  const otherIncome = db.activities
    .filter((item) => item.status === 'approved' && asDateKey(item.occurredAt) === day)
    .map((item) => ({
      name: db.activityTypes.find((type) => type.id === item.activityTypeId)?.name ?? 'Activity',
      amount: item.amount,
    }))
  const expensesTotal = expenses.reduce((sum, item) => sum + item.amount, 0)
  const otherIncomeTotal = otherIncome.reduce((sum, item) => sum + item.amount, 0)
  const goodsProfit = salesRevenue - goodsCost
  const available = db.products
    .filter((product) => product.isActive)
    .map((product) => {
      const snap = snapshotFor(db, product.id)
      const buy = Math.max(0, product.minStock - snap.available)
      return { name: product.name, available: snap.available, minimum: product.minStock, buy }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    date: day,
    sold: [...soldMap.values()].sort((a, b) => b.revenue - a.revenue),
    bought: [...boughtMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    expenses,
    otherIncome,
    salesRevenue,
    goodsCost,
    goodsProfit,
    otherIncomeTotal,
    expensesTotal,
    net: goodsProfit + otherIncomeTotal - expensesTotal,
    available,
    toBuy: available.filter((row) => row.buy > 0),
  }
}
