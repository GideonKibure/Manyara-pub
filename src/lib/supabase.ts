import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseUrl = url ?? ''
export const supabaseAnonKey = anonKey ?? ''
export const isSupabaseConfigured = Boolean(url && anonKey)
export function clearSupabaseAuthStorage() {
  for (const store of [localStorage, sessionStorage]) {
    for (const key of Object.keys(store)) {
      if (key.startsWith('sb-')) store.removeItem(key)
    }
  }
}

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: localStorage,
      },
    })
  : null

export const dataSourceLabel = isSupabaseConfigured
  ? 'Connected to Supabase. Sign-in, stock, sales, and approvals use that database. The anon key in the browser cannot bypass row level security.'
  : 'Supabase is not connected. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to use live accounts and stock.'
