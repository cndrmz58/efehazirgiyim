import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { EnvironmentState } from '../../lib/environment'

export type AuthConfig = Extract<EnvironmentState, { status: 'configured' }>['config']

let loginClient: SupabaseClient | undefined

export function getLoginClient(config: AuthConfig): SupabaseClient {
  return (loginClient ??= createClient(
    config.VITE_SUPABASE_URL,
    config.VITE_SUPABASE_PUBLISHABLE_KEY,
    { auth: { detectSessionInUrl: false } },
  ))
}
