import { blankDatabase, loadWorkspace } from '@/services/supabase/gateway'
import { supabase } from '@/lib/supabase'
import { hasLocalBusiness, loadSnapshot, saveSnapshot } from '@/services/localStore'
import { normalizeStored } from '@/services/localDb'
import type { Database, DayClose, ExpenseTransaction } from '@/types'

export type BackupKind = 'cogs' | 'workspace'

export interface CloudBackup {
  id: string
  kind: BackupKind
  createdBy: string
  createdAt: string
  label: string
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

function asKind(value: unknown): BackupKind {
  return value === 'cogs' ? 'cogs' : 'workspace'
}

export function workspacePayload(db: Database) {
  return {
    version: db.version,
    profiles: db.profiles,
    categories: db.categories,
    units: db.units,
    products: db.products,
    priceChanges: db.priceChanges ?? [],
    suppliers: db.suppliers,
    stockIns: db.stockIns,
    sales: db.sales,
    movements: db.movements,
    activityTypes: db.activityTypes,
    activities: db.activities,
    expenses: db.expenses,
    dayCloses: db.dayCloses ?? [],
    settings: db.settings,
    counters: db.counters,
  }
}

export function cogsPayload(db: Database) {
  return {
    version: db.version,
    dayCloses: db.dayCloses ?? [],
    expenses: db.expenses,
  }
}

export function applyWorkspacePayload(base: Database, payload: Record<string, unknown>): Database {
  const next = {
    ...base,
    ...payload,
    accounts: [] as Database['accounts'],
    resetTokens: [] as Database['resetTokens'],
    version: base.version,
  } as Database
  return normalizeStored(next)
}

export function applyCogsPayload(base: Database, payload: Record<string, unknown>): Database {
  const dayCloses = Array.isArray(payload.dayCloses) ? (payload.dayCloses as DayClose[]) : base.dayCloses
  const expenses = Array.isArray(payload.expenses) ? (payload.expenses as ExpenseTransaction[]) : base.expenses
  return normalizeStored({ ...base, dayCloses, expenses })
}

export async function listCloudBackups(): Promise<{ ok: true; items: CloudBackup[] } | { ok: false; error: string }> {
  if (!supabase) return fail('Supabase is not connected.')
  const { data, error } = await supabase
    .from('financial_backups')
    .select('id, kind, created_by, created_at, label')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return fail(error.message)
  return {
    ok: true,
    items: (data ?? []).map((row) => ({
      id: String(row.id),
      kind: asKind(row.kind),
      createdBy: String(row.created_by),
      createdAt: String(row.created_at),
      label: String(row.label ?? ''),
    })),
  }
}

export async function uploadCloudBackup(kind: BackupKind, db: Database, label: string) {
  if (!supabase) return fail('Supabase is not connected.')
  const user = await supabase.auth.getUser()
  const userId = user.data.user?.id
  if (!userId) return fail('You are not signed in.')
  const payload = kind === 'cogs' ? cogsPayload(db) : workspacePayload(db)
  const { error } = await supabase.from('financial_backups').insert({
    kind,
    created_by: userId,
    label: label.trim() || (kind === 'cogs' ? 'COGS backup' : 'Workspace backup'),
    payload,
  })
  if (error) return fail(error.message)
  return { ok: true as const, message: 'Backup saved to your account.' }
}

export async function downloadCloudBackup(id: string) {
  if (!supabase) return fail('Supabase is not connected.')
  const { data, error } = await supabase.from('financial_backups').select('id, kind, payload, label, created_at').eq('id', id).maybeSingle()
  if (error) return fail(error.message)
  if (!data) return fail('Backup not found.')
  const payload = data.payload && typeof data.payload === 'object' ? (data.payload as Record<string, unknown>) : null
  if (!payload) return fail('That backup is empty.')
  return { ok: true as const, kind: asKind(data.kind), payload, label: String(data.label ?? '') }
}

export async function restoreBackupInto(base: Database, id: string) {
  const downloaded = await downloadCloudBackup(id)
  if (!downloaded.ok) return downloaded
  const next = downloaded.kind === 'cogs' ? applyCogsPayload(base, downloaded.payload) : applyWorkspacePayload(base, downloaded.payload)
  return { ok: true as const, db: next, kind: downloaded.kind, message: 'Backup restored on this device.' }
}

export async function hydrateLocalWorkspace(userId: string): Promise<{ ok: true; db: Database; notice?: string } | { ok: false; error: string }> {
  const local = await loadSnapshot(userId)
  if (hasLocalBusiness(local)) return { ok: true, db: local as Database }

  const listed = await listCloudBackups()
  if (listed.ok) {
    const workspace = listed.items.find((item) => item.kind === 'workspace')
    const cogs = listed.items.find((item) => item.kind === 'cogs')
    const pick = workspace ?? cogs
    if (pick) {
      let base = local ?? blankDatabase()
      if (pick.kind === 'cogs') {
        const live = await loadWorkspace()
        if (live.ok) base = live.db
      }
      const restored = await restoreBackupInto(base, pick.id)
      if (restored.ok) {
        await saveSnapshot(userId, restored.db)
        return { ok: true, db: restored.db, notice: 'Signed in. Records from your last backup are on this device.' }
      }
    }
  } else if (!supabase) {
    return { ok: true, db: local ?? blankDatabase() }
  }

  const live = await loadWorkspace()
  if (live.ok) {
    const cleaned = { ...live.db, accounts: [], resetTokens: [] }
    await saveSnapshot(userId, cleaned)
    return { ok: true, db: cleaned, notice: local ? undefined : 'Signed in. Live records were copied onto this device.' }
  }

  if (local) return { ok: true, db: local }
  if (listed.ok === false && live.ok === false) return fail(live.error)
  return { ok: true, db: blankDatabase() }
}
