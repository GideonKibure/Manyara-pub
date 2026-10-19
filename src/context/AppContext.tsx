import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { buildDashboard } from '@/features/reports/metrics'
import { allSnapshots } from '@/features/inventory/stock'
import { dataSourceLabel, isSupabaseConfigured, supabase } from '@/lib/supabase'
import { IDLE_GRACE_MS, IDLE_MS, markLockReason, type LockReason } from '@/lib/sessionLock'
import { DB_KEY, loadDatabase, loadSession, resetDatabase, saveDatabase, saveSession } from '@/services/localDb'
import {
  acceptActivityRemote,
  acceptExpenseRemote,
  acceptSaleRemote,
  recordBillLossRemote,
  acceptStockInRemote,
  adjustRemote,
  blankDatabase,
  changePasswordRemote,
  declineActivityRemote,
  declineExpenseRemote,
  declineSaleRemote,
  declineStockInRemote,
  loadWorkspace,
  readAllNotificationsRemote,
  readNotificationRemote,
  requestResetRemote,
  saveActivityTypeRemote,
  saveCategoryRemote,
  saveEmployeeRemote,
  saveProductRemote,
  deleteProductRemote,
  deleteCategoryRemote,
  deleteUnitRemote,
  clearBusinessDataRemote,
  saveProfileRemote,
  saveSettingsRemote,
  removeSupplierRemote,
  saveSupplierRemote,
  saveUnitRemote,
  editSaleRemote,
  editStockInRemote,
  sendActivityRemote,
  sendExpenseRemote,
  sendSaleRemote,
  sendStockInRemote,
  setBillPaymentRemote,
  recordBillPaymentRemote,
  appendBillItemRemote,
  sendRemainingCountRemote,
  signInRemote,
  signOutRemote,
  updateEmployeeRemote,
  deleteEmployeeRemote,
  deleteRecordRemote,
  saveDayCloseRemote,
  updateDayCloseRemote,
  deleteDayCloseRemote,
  approveDayCloseRemote,
  updatePasswordRemote,
  withdrawRemote,
} from '@/services/supabase/gateway'
import {
  adjustStock,
  approveActivity,
  approveExpense,
  approveSale,
  approveStockIn,
  authenticate,
  cancelSubmission,
  changePassword,
  createCategory,
  createEmployee,
  createProduct,
  deleteProduct,
  deleteCategory,
  deleteUnit,
  clearBusinessData,
  createSupplier,
  deleteSupplier,
  createUnit,
  markAllNotificationsRead,
  markNotificationRead,
  rejectActivity,
  rejectExpense,
  rejectSale,
  rejectStockIn,
  requestPasswordReset,
  resetPassword,
  editSale,
  editStockIn,
  escalateOverdueBills,
  recordBillLoss,
  setBillPayment,
  recordBillPayment,
  appendBillItem,
  submitActivity,
  submitExpense,
  submitSale,
  submitRemainingCount,
  submitStockIn,
  updateActivityType,
  updateCategory,
  updateEmployee,
  deleteEmployee,
  deleteBusinessRecord,
  saveDayClose,
  updateDayClose,
  deleteDayClose,
  approveDayClose,
  updateOwnProfile,
  updateProduct,
  updateSettings,
  type OpResult,
} from '@/services/operations'
import type {
  ActionResult,
  ActivityDraft,
  ExpenseDraft,
  AdjustmentDraft,
  AppNotification,
  Database,
  EmployeeDraft,
  EmployeePatch,
  DayDebt,
  CogsExpenseLine,
  CogsLine,
  ProductDraft,
  RecordDeleteKind,
  Profile,
  SaleDraft,
  Session,
  StockInDraft,
} from '@/types'
import { formatMoney } from '@/utils/money'
import { BootScreen, LoadErrorScreen } from '@/components/ui/BootScreen'

interface Toast {
  id: string
  tone: 'success' | 'error'
  message: string
}

interface AppContextValue {
  user: Profile | null
  settings: Database['settings']
  profiles: Profile[]
  categories: Database['categories']
  units: Database['units']
  products: Database['products']
  suppliers: Database['suppliers']
  stockIns: Database['stockIns']
  sales: Database['sales']
  movements: Database['movements']
  activityTypes: Database['activityTypes']
  activities: Database['activities']
  expenses: Database['expenses']
  dayCloses: Database['dayCloses']
  notifications: AppNotification[]
  auditLogs: Database['auditLogs']
  snapshots: ReturnType<typeof allSnapshots>
  dashboard: ReturnType<typeof buildDashboard>
  unreadCount: number
  toasts: Toast[]
  dismissToast: (id: string) => void
  dataSourceLabel: string
  supabaseConfigured: boolean
  money: (amount: number) => string
  nameOf: (id?: string) => string
  login: (identifier: string, password: string) => Promise<ActionResult>
  logout: () => void
  idlePrompt: boolean
  idleLeft: number
  staySignedIn: () => void
  requestReset: (email: string) => Promise<ActionResult>
  resetWithToken: (token: string, password: string) => Promise<ActionResult>
  changeOwnPassword: (current: string, password: string) => Promise<ActionResult>
  saveProfile: (input: { fullName: string; phone: string; imageUrl?: string }) => Promise<ActionResult>
  addCategory: (input: { name: string; description: string; isActive: boolean }) => Promise<ActionResult>
  editCategory: (id: string, input: { name: string; description: string; isActive: boolean }) => Promise<ActionResult>
  removeCategory: (id: string) => Promise<ActionResult>
  addUnit: (input: { name: string; abbreviation: string }) => Promise<ActionResult>
  removeUnit: (id: string) => Promise<ActionResult>
  addSupplier: (input: { name: string; phone: string }) => Promise<ActionResult>
  removeSupplier: (id: string) => Promise<ActionResult>
  addProduct: (input: ProductDraft) => Promise<ActionResult>
  editProduct: (id: string, input: ProductDraft) => Promise<ActionResult>
  removeProduct: (id: string) => Promise<ActionResult>
  clearBusiness: () => Promise<ActionResult>
  addEmployee: (input: EmployeeDraft) => Promise<ActionResult>
  editEmployee: (id: string, patch: EmployeePatch) => Promise<ActionResult>
  removeEmployee: (id: string) => Promise<ActionResult>
  sendStockIn: (draft: StockInDraft) => Promise<ActionResult>
  sendSale: (draft: SaleDraft) => Promise<ActionResult>
  sendRemainingCount: (lines: Array<{ productId: string; remaining: number; unitCost?: number | null }>) => Promise<ActionResult>
  approveAllPending: (kind: 'stock_in' | 'sale' | 'bill') => Promise<ActionResult>
  editStockIn: (id: string, draft: StockInDraft) => Promise<ActionResult>
  editSale: (id: string, draft: SaleDraft) => Promise<ActionResult>
  setBillPayment: (id: string, paymentStatus: 'paid' | 'unpaid') => Promise<ActionResult>
  recordBillPayment: (id: string, amount: number) => Promise<ActionResult>
  appendBillItem: (id: string, item: SaleDraft['items'][number]) => Promise<ActionResult>
  sendActivity: (draft: ActivityDraft) => Promise<ActionResult>
  sendExpense: (draft: ExpenseDraft) => Promise<ActionResult>
  deleteRecord: (kind: RecordDeleteKind, id: string) => Promise<ActionResult>
  saveDayClose: (input: {
    day: string
    remainingSaleId?: string
    debts: DayDebt[]
    mobileReceived: number
    expenseTotal?: number
    lines?: CogsLine[]
    expenseItems?: CogsExpenseLine[]
    submittedBy?: string
  }) => Promise<ActionResult>
  updateDayClose: (id: string, input: {
    debts: DayDebt[]
    mobileReceived: number
    expenseTotal: number
    lines?: CogsLine[]
    expenseItems?: CogsExpenseLine[]
  }) => Promise<ActionResult>
  deleteDayClose: (id: string) => Promise<ActionResult>
  approveDayClose: (id: string) => Promise<ActionResult>
  acceptStockIn: (id: string) => Promise<ActionResult>
  declineStockIn: (id: string, reason: string) => Promise<ActionResult>
  acceptSale: (id: string) => Promise<ActionResult>
  recordBillLoss: (id: string) => Promise<ActionResult>
  declineSale: (id: string, reason: string) => Promise<ActionResult>
  acceptActivity: (id: string) => Promise<ActionResult>
  declineActivity: (id: string, reason: string) => Promise<ActionResult>
  acceptExpense: (id: string) => Promise<ActionResult>
  declineExpense: (id: string, reason: string) => Promise<ActionResult>
  withdraw: (kind: 'stock_in' | 'sale' | 'activity' | 'expense', id: string, reason: string) => Promise<ActionResult>
  adjust: (draft: AdjustmentDraft) => Promise<ActionResult>
  saveSettings: (input: { businessName: string; currency: string; currencySymbol: string; lowStockAlerts: boolean; allowRemainingCount: boolean }) => Promise<ActionResult>
  saveActivityType: (
    id: string,
    input: { pricingMode: 'per_game' | 'per_session' | 'per_play' | 'flat'; unitPrice: number; unitLabel: string; isActive: boolean },
  ) => Promise<ActionResult>
  readNotification: (id: string) => Promise<ActionResult>
  readAllNotifications: () => Promise<ActionResult>
  restoreDemo: () => ActionResult
}

const AppContext = createContext<AppContextValue | null>(null)

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function clientSession() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

function watchAuth(apply: (userId: string | null) => void) {
  if (!supabase) return () => undefined
  const { data } = supabase.auth.onAuthStateChange((_event, next) => {
    window.setTimeout(() => apply(next?.user.id ?? null), 0)
  })
  return () => data.subscription.unsubscribe()
}

export function AppProvider({ children }: { children: ReactNode }) {
  const remote = isSupabaseConfigured
  const [db, setDb] = useState<Database>(() => (remote ? blankDatabase() : loadDatabase()))
  const [session, setSession] = useState<Session | null>(() => (remote ? null : loadSession()))
  const [authReady, setAuthReady] = useState(!remote)
  const [loadError, setLoadError] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [idlePrompt, setIdlePrompt] = useState(false)
  const [idleLeft, setIdleLeft] = useState(Math.ceil(IDLE_GRACE_MS / 1000))
  const idleRef = useRef({ last: Date.now(), warnedAt: 0 })
  const idlePromptRef = useRef(false)
  const dbRef = useRef(db)
  const sessionRef = useRef(session)
  dbRef.current = db
  sessionRef.current = session

  const endSession = useCallback(() => {
    if (remote) void signOutRemote()
    sessionRef.current = null
    setSession(null)
    saveSession(null)
    if (remote) {
      const empty = blankDatabase()
      dbRef.current = empty
      setDb(empty)
    }
  }, [remote])

  const dismissToast = (id: string) => setToasts((current) => current.filter((toast) => toast.id !== id))

  const pushToast = (tone: Toast['tone'], message: string) => {
    const id = crypto.randomUUID()
    setToasts((current) => [...current, { id, tone, message }])
    window.setTimeout(() => dismissToast(id), 4500)
  }

  const applyRemoteSession = async (userId: string | null) => {
    if (!userId) {
      sessionRef.current = null
      setSession(null)
      const empty = blankDatabase()
      dbRef.current = empty
      setDb(empty)
      setLoadError('')
      setAuthReady(true)
      return
    }
    const loaded = await loadWorkspace()
    if (!loaded.ok) {
      setLoadError(loaded.error)
      setAuthReady(true)
      return
    }
    dbRef.current = loaded.db
    setDb(loaded.db)
    const nextSession = { userId, remember: true }
    sessionRef.current = nextSession
    setSession(nextSession)
    setLoadError('')
    setAuthReady(true)
  }

  useEffect(() => {
    if (!remote) return
    let active = true
    const apply = (userId: string | null) => {
      if (!active) return
      void applyRemoteSession(userId)
    }
    void clientSession().then(apply)
    const subscription = watchAuth(apply)
    return () => {
      active = false
      subscription()
    }
  }, [remote])

  const staySignedIn = useCallback(() => {
    idleRef.current.last = Date.now()
    idleRef.current.warnedAt = 0
    idlePromptRef.current = false
    setIdlePrompt(false)
    setIdleLeft(Math.ceil(IDLE_GRACE_MS / 1000))
  }, [])

  useEffect(() => {
    if (!session) {
      idleRef.current = { last: Date.now(), warnedAt: 0 }
      idlePromptRef.current = false
      setIdlePrompt(false)
      return
    }
    idleRef.current = { last: Date.now(), warnedAt: 0 }
    idlePromptRef.current = false
    setIdlePrompt(false)
    let stopped = false
    const bump = () => {
      if (stopped || idleRef.current.warnedAt) return
      idleRef.current.last = Date.now()
    }
    const finish = (reason: LockReason) => {
      if (stopped || !sessionRef.current || !idlePromptRef.current) return
      stopped = true
      markLockReason(reason)
      endSession()
    }
    const openIdlePrompt = () => {
      idleRef.current.warnedAt = Date.now()
      idlePromptRef.current = true
      setIdleLeft(Math.ceil(IDLE_GRACE_MS / 1000))
      setIdlePrompt(true)
    }
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'input'] as const
    for (const name of events) window.addEventListener(name, bump, { capture: true, passive: true })
    window.addEventListener('pointermove', bump, { capture: true, passive: true })
    document.addEventListener('scroll', bump, { capture: true, passive: true })
    const onVisible = () => {
      if (stopped || document.visibilityState !== 'visible' || !sessionRef.current) return
      if (Date.now() - idleRef.current.last >= IDLE_MS) openIdlePrompt()
    }
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(() => {
      if (stopped || !sessionRef.current) return
      const now = Date.now()
      const { last, warnedAt } = idleRef.current
      if (!warnedAt) {
        if (now - last >= IDLE_MS) openIdlePrompt()
        return
      }
      if (document.visibilityState !== 'visible') return
      const left = Math.max(0, Math.ceil((IDLE_GRACE_MS - (now - warnedAt)) / 1000))
      setIdleLeft(left)
      if (left <= 0 && idlePromptRef.current) finish('idle')
    }, 1000)
    return () => {
      stopped = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      for (const name of events) window.removeEventListener(name, bump, { capture: true })
      window.removeEventListener('pointermove', bump, { capture: true })
      document.removeEventListener('scroll', bump, { capture: true })
    }
  }, [session, endSession])

  useEffect(() => {
    if (remote || !session?.userId) return
    const next = escalateOverdueBills(dbRef.current)
    if (next === dbRef.current) return
    dbRef.current = next
    saveDatabase(next)
    setDb(next)
  }, [db, remote, session?.userId])

  useEffect(() => {
    const client = supabase
    if (!remote || !session || !client) return
    let timer = 0
    let stopped = false
    const refresh = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (stopped || !sessionRef.current) return
        void loadWorkspace().then((loaded) => {
          if (stopped || !loaded.ok || !sessionRef.current) return
          dbRef.current = loaded.db
          setDb(loaded.db)
        })
      }, 400)
    }
    const channel = client
      .channel(`manyara-live-${session.userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_transactions' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_items' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_in_transactions' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_in_items' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, refresh)
      .subscribe()
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, 8000)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      window.clearInterval(poll)
      void client.removeChannel(channel)
    }
  }, [remote, session])

  useEffect(() => {
    if (!remote) return
    const onFocus = () => {
      if (!sessionRef.current) return
      void loadWorkspace().then((loaded) => {
        if (!loaded.ok) return
        dbRef.current = loaded.db
        setDb(loaded.db)
      })
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [remote])

  useEffect(() => {
    if (remote) return
    const onStorage = (event: StorageEvent) => {
      if (event.key !== DB_KEY || !event.newValue) return
      try {
        const parsed = JSON.parse(event.newValue) as Database
        dbRef.current = parsed
        setDb(parsed)
      } catch {
        // Ignore unreadable updates from another tab.
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [remote])

  const user = session ? db.profiles.find((profile) => profile.id === session.userId && profile.isActive) ?? null : null

  useEffect(() => {
    if (session && !user && authReady && !loadError) {
      if (remote) void signOutRemote()
      saveSession(null)
      sessionRef.current = null
      setSession(null)
    }
  }, [session, user, authReady, loadError, remote])

  const runRemote = async (action: () => Promise<ActionResult>): Promise<ActionResult> => {
    try {
      const result = await action()
      if (!result.ok) {
        pushToast('error', result.error)
        return result
      }
      const loaded = await loadWorkspace()
      if (!loaded.ok) {
        pushToast('error', loaded.error)
        return loaded
      }
      dbRef.current = loaded.db
      setDb(loaded.db)
      if (result.message) pushToast('success', result.message)
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.'
      pushToast('error', message)
      return { ok: false, error: message }
    }
  }

  const commit = (result: OpResult, announce = true): ActionResult => {
    if (!result.ok) {
      if (announce) pushToast('error', result.error)
      return result
    }
    dbRef.current = result.db
    saveDatabase(result.db)
    setDb(result.db)
    if (announce && result.message) pushToast('success', result.message)
    return { ok: true, message: result.message, meta: result.meta }
  }

  const run = (op: (database: Database, userId: string) => OpResult): ActionResult => {
    if (!sessionRef.current?.userId) {
      pushToast('error', 'You are not signed in.')
      return { ok: false, error: 'You are not signed in.' }
    }
    return commit(op(dbRef.current, sessionRef.current.userId))
  }

  const snapshots = useMemo(() => allSnapshots(db), [db])
  const dashboard = useMemo(() => buildDashboard(db), [db])
  const notifications = useMemo(
    () => db.notifications.filter((item) => item.recipientId === user?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [db.notifications, user?.id],
  )

  const value: AppContextValue = {
    user,
    settings: db.settings,
    profiles: db.profiles,
    categories: db.categories,
    units: db.units,
    products: db.products,
    suppliers: db.suppliers,
    stockIns: db.stockIns,
    sales: db.sales,
    movements: db.movements,
    activityTypes: db.activityTypes,
    activities: db.activities,
    expenses: db.expenses,
    dayCloses: db.dayCloses ?? [],
    notifications,
    auditLogs: db.auditLogs,
    snapshots,
    dashboard,
    unreadCount: notifications.filter((item) => !item.read).length,
    toasts,
    dismissToast,
    dataSourceLabel,
    supabaseConfigured: isSupabaseConfigured,
    money: (amount: number) => formatMoney(amount, db.settings.currencySymbol),
    nameOf: (id?: string) => db.profiles.find((profile) => profile.id === id)?.fullName ?? 'Unknown',
    login: async (identifier, password) => {
      if (remote) {
        const result = await signInRemote(identifier, password)
        if (!result.ok) {
          pushToast('error', result.error)
          return result
        }
        const loaded = await loadWorkspace()
        if (!loaded.ok) {
          pushToast('error', loaded.error)
          return loaded
        }
        const userId = result.meta?.userId
        if (!userId) return { ok: false, error: 'Sign-in failed.' }
        dbRef.current = loaded.db
        setDb(loaded.db)
        const nextSession = { userId, remember: true }
        sessionRef.current = nextSession
        setSession(nextSession)
        saveSession(nextSession)
        setLoadError('')
        setAuthReady(true)
        pushToast('success', 'Signed in.')
        return result
      }
      await wait(280)
      const result = authenticate(dbRef.current, identifier, password)
      if (!result.ok) return commit(result)
      const userId = result.meta?.userId
      if (!userId) return { ok: false, error: 'Sign-in failed.' }
      const saved = commit(result, false)
      const nextSession = { userId, remember: true }
      sessionRef.current = nextSession
      setSession(nextSession)
      saveSession(nextSession)
      pushToast('success', 'Signed in.')
      return saved
    },
    logout: () => endSession(),
    idlePrompt,
    idleLeft,
    staySignedIn,
    requestReset: async (email) => {
      if (remote) return requestResetRemote(email)
      await wait(200)
      return commit(requestPasswordReset(dbRef.current, email), false)
    },
    resetWithToken: async (token, password) => {
      if (!remote) return commit(resetPassword(dbRef.current, token, password))
      const result = await updatePasswordRemote(password)
      if (!result.ok) pushToast('error', result.error)
      else if (result.message) pushToast('success', result.message)
      return result
    },
    changeOwnPassword: async (current, password) => {
      if (!remote) return run((database, userId) => changePassword(database, userId, current, password))
      const email = dbRef.current.profiles.find((profile) => profile.id === sessionRef.current?.userId)?.email ?? ''
      return runRemote(() => changePasswordRemote(email, current, password))
    },
    saveProfile: async (input) => (remote ? runRemote(() => saveProfileRemote(input)) : run((database, userId) => updateOwnProfile(database, userId, input))),
    addCategory: async (input) => (remote ? runRemote(() => saveCategoryRemote(null, input)) : run((database, userId) => createCategory(database, userId, input))),
    editCategory: async (id, input) => (remote ? runRemote(() => saveCategoryRemote(id, input)) : run((database, userId) => updateCategory(database, userId, id, input))),
    removeCategory: async (id) => (remote ? runRemote(() => deleteCategoryRemote(id)) : run((database, userId) => deleteCategory(database, userId, id))),
    addUnit: async (input) => (remote ? runRemote(() => saveUnitRemote(input)) : run((database, userId) => createUnit(database, userId, input))),
    removeUnit: async (id) => (remote ? runRemote(() => deleteUnitRemote(id)) : run((database, userId) => deleteUnit(database, userId, id))),
    addSupplier: async (input) => (remote ? runRemote(() => saveSupplierRemote(input)) : run((database, userId) => createSupplier(database, userId, input))),
    removeSupplier: async (id) => (remote ? runRemote(() => removeSupplierRemote(id)) : run((database, userId) => deleteSupplier(database, userId, id))),
    addProduct: async (input) => (remote ? runRemote(() => saveProductRemote(null, input)) : run((database, userId) => createProduct(database, userId, input))),
    editProduct: async (id, input) => (remote ? runRemote(() => saveProductRemote(id, input)) : run((database, userId) => updateProduct(database, userId, id, input))),
    removeProduct: async (id) => (remote ? runRemote(() => deleteProductRemote(id)) : run((database, userId) => deleteProduct(database, userId, id))),
    clearBusiness: async () => (remote ? runRemote(() => clearBusinessDataRemote()) : run((database, userId) => clearBusinessData(database, userId))),
    addEmployee: async (input) => (remote ? runRemote(() => saveEmployeeRemote(input)) : run((database, userId) => createEmployee(database, userId, input))),
    editEmployee: async (id, patch) => (remote ? runRemote(() => updateEmployeeRemote(id, patch)) : run((database, userId) => updateEmployee(database, userId, id, patch))),
    removeEmployee: async (id) => (remote ? runRemote(() => deleteEmployeeRemote(id)) : run((database, userId) => deleteEmployee(database, userId, id))),
    sendStockIn: async (draft) => (remote ? runRemote(() => sendStockInRemote(draft)) : run((database, userId) => submitStockIn(database, userId, draft))),
    sendSale: async (draft) => (remote ? runRemote(() => sendSaleRemote(draft)) : run((database, userId) => submitSale(database, userId, draft))),
    sendRemainingCount: async (lines) => (remote ? runRemote(() => sendRemainingCountRemote(lines)) : run((database, userId) => submitRemainingCount(database, userId, lines))),
    approveAllPending: async (kind) => {
      const userId = sessionRef.current?.userId
      if (!userId) {
        pushToast('error', 'You are not signed in.')
        return { ok: false, error: 'You are not signed in.' }
      }
      const ids =
        kind === 'stock_in'
          ? dbRef.current.stockIns.filter((item) => item.status === 'pending').map((item) => item.id)
          : dbRef.current.sales
              .filter((item) => item.status === 'pending' && (kind === 'bill' ? item.recordKind === 'bill' : (item.recordKind ?? 'sale') === 'sale'))
              .map((item) => item.id)
      if (!ids.length) {
        pushToast('success', 'Nothing is waiting for approval.')
        return { ok: true, message: 'Nothing is waiting for approval.' }
      }
      let approved = 0
      let error = ''
      for (const id of ids) {
        let result: ActionResult
        if (remote) {
          result = kind === 'stock_in' ? await acceptStockInRemote(id) : await acceptSaleRemote(id)
        } else {
          const op = kind === 'stock_in' ? approveStockIn(dbRef.current, userId, id) : approveSale(dbRef.current, userId, id)
          if (!op.ok) result = { ok: false, error: op.error }
          else {
            dbRef.current = op.db
            saveDatabase(op.db)
            result = { ok: true, message: op.message }
          }
        }
        if (result.ok) approved += 1
        else {
          error = result.error
          break
        }
      }
      if (remote) {
        const loaded = await loadWorkspace()
        if (loaded.ok) {
          dbRef.current = loaded.db
          setDb(loaded.db)
        }
      } else {
        setDb(dbRef.current)
      }
      if (!approved && error) {
        pushToast('error', error)
        return { ok: false, error }
      }
      const message = `${approved} record${approved === 1 ? '' : 's'} approved.`
      pushToast(error ? 'error' : 'success', error ? `${message} ${error}` : message)
      return error ? { ok: false, error } : { ok: true, message }
    },
    editStockIn: async (id, draft) => (remote ? runRemote(() => editStockInRemote(id, draft)) : run((database, userId) => editStockIn(database, userId, id, draft))),
    editSale: async (id, draft) => (remote ? runRemote(() => editSaleRemote(id, draft)) : run((database, userId) => editSale(database, userId, id, draft))),
    setBillPayment: async (id, paymentStatus) => (remote ? runRemote(() => setBillPaymentRemote(id, paymentStatus)) : run((database, userId) => setBillPayment(database, userId, id, paymentStatus))),
    recordBillPayment: async (id, amount) => (remote ? runRemote(() => recordBillPaymentRemote(id, amount)) : run((database, userId) => recordBillPayment(database, userId, id, amount))),
    appendBillItem: async (id, item) => (remote ? runRemote(() => appendBillItemRemote(id, item.productId, item.quantity, item.sizeName ?? 'one', item.portion ?? 'full')) : run((database, userId) => appendBillItem(database, userId, id, item))),
    sendActivity: async (draft) => (remote ? runRemote(() => sendActivityRemote(draft)) : run((database, userId) => submitActivity(database, userId, draft))),
    sendExpense: async (draft) => (remote ? runRemote(() => sendExpenseRemote(draft)) : run((database, userId) => submitExpense(database, userId, draft))),
    deleteRecord: async (kind, id) => (remote ? runRemote(() => deleteRecordRemote(kind, id)) : run((database, userId) => deleteBusinessRecord(database, userId, kind, id))),
    saveDayClose: async (input) => (remote ? runRemote(() => saveDayCloseRemote(input)) : run((database, userId) => saveDayClose(database, userId, input))),
    updateDayClose: async (id, input) => (remote ? runRemote(() => updateDayCloseRemote(id, input)) : run((database, userId) => updateDayClose(database, userId, id, input))),
    deleteDayClose: async (id) => (remote ? runRemote(() => deleteDayCloseRemote(id)) : run((database, userId) => deleteDayClose(database, userId, id))),
    approveDayClose: async (id) => (remote ? runRemote(() => approveDayCloseRemote(id)) : run((database, userId) => approveDayClose(database, userId, id))),
    acceptStockIn: async (id) => (remote ? runRemote(() => acceptStockInRemote(id)) : run((database, userId) => approveStockIn(database, userId, id))),
    declineStockIn: async (id, reason) => (remote ? runRemote(() => declineStockInRemote(id, reason)) : run((database, userId) => rejectStockIn(database, userId, id, reason))),
    acceptSale: async (id) => (remote ? runRemote(() => acceptSaleRemote(id)) : run((database, userId) => approveSale(database, userId, id))),
    recordBillLoss: async (id) => (remote ? runRemote(() => recordBillLossRemote(id)) : run((database, userId) => recordBillLoss(database, userId, id))),
    declineSale: async (id, reason) => (remote ? runRemote(() => declineSaleRemote(id, reason)) : run((database, userId) => rejectSale(database, userId, id, reason))),
    acceptActivity: async (id) => (remote ? runRemote(() => acceptActivityRemote(id)) : run((database, userId) => approveActivity(database, userId, id))),
    declineActivity: async (id, reason) => (remote ? runRemote(() => declineActivityRemote(id, reason)) : run((database, userId) => rejectActivity(database, userId, id, reason))),
    acceptExpense: async (id) => (remote ? runRemote(() => acceptExpenseRemote(id)) : run((database, userId) => approveExpense(database, userId, id))),
    declineExpense: async (id, reason) => (remote ? runRemote(() => declineExpenseRemote(id, reason)) : run((database, userId) => rejectExpense(database, userId, id, reason))),
    withdraw: async (kind, id, reason) => (remote ? runRemote(() => withdrawRemote(kind, id, reason)) : run((database, userId) => cancelSubmission(database, userId, kind, id, reason))),
    adjust: async (draft) => (remote ? runRemote(() => adjustRemote(draft)) : run((database, userId) => adjustStock(database, userId, draft))),
    saveSettings: async (input) => (remote ? runRemote(() => saveSettingsRemote(input)) : run((database, userId) => updateSettings(database, userId, input))),
    saveActivityType: async (id, input) => (remote ? runRemote(() => saveActivityTypeRemote(id, input)) : run((database, userId) => updateActivityType(database, userId, id, input))),
    readNotification: async (id) => (remote ? runRemote(() => readNotificationRemote(id)) : run((database, userId) => markNotificationRead(database, userId, id))),
    readAllNotifications: async () => (remote ? runRemote(() => readAllNotificationsRemote()) : run((database, userId) => markAllNotificationsRead(database, userId))),
    restoreDemo: () => {
      if (remote) return { ok: false, error: 'Demo data stays in this browser. Live records are in Supabase.' }
      if (user?.role !== 'admin') return { ok: false, error: 'Only an administrator can restore demo data.' }
      const next = resetDatabase()
      dbRef.current = next
      setDb(next)
      pushToast('success', 'Demo data restored.')
      return { ok: true, message: 'Demo data restored.' }
    },
  }

  if (!authReady) {
    return <BootScreen />
  }

  if (loadError) {
    return (
      <LoadErrorScreen
        error={loadError}
        onBack={() => {
          void signOutRemote()
          setLoadError('')
          sessionRef.current = null
          setSession(null)
        }}
      />
    )
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used inside AppProvider')
  return context
}
