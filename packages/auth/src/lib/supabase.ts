// filepath: packages/auth/src/lib/supabase.ts

/**
 * HEYS EAP 3.0 - Supabase Client Configuration
 * 
 * Purpose: Configure Supabase client for authentication and database operations
 * Features: Type-safe client, real-time subscriptions, automatic token refresh
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

// Environment variables with fallbacks for development
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY'
  )
}

// Create typed Supabase client
export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      // Enable automatic token refresh
      autoRefreshToken: true,
      // Persist session in localStorage
      persistSession: true,
      // Detect session from URL on login callbacks
      detectSessionInUrl: true,
      // Custom storage for SSR compatibility
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
    db: {
      // Enable realtime for specific tables
      schema: 'public',
    },
    global: {
      headers: {
        'X-Client-Info': 'heys-eap-3.0',
      },
    },
    realtime: {
      // Configure realtime options
      params: {
        eventsPerSecond: 10,
      },
    },
  }
)

// Helper function for server-side client (for API routes)
export function createServerSupabaseClient(
  supabaseAccessToken?: string
): SupabaseClient<Database> {
  const serverClient = createClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          'X-Client-Info': 'heys-eap-3.0-server',
          ...(supabaseAccessToken && {
            Authorization: `Bearer ${supabaseAccessToken}`,
          }),
        },
      },
    }
  )

  return serverClient
}

// Admin client for privileged operations (use with service role key)
export function createAdminSupabaseClient(): SupabaseClient<Database> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY environment variable for admin operations'
    )
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        'X-Client-Info': 'heys-eap-3.0-admin',
      },
    },
  })
}

// Type-safe table references
export const tables = {
  userProfiles: 'user_profiles',
  roles: 'roles',
  permissions: 'permissions',
  rolePermissions: 'role_permissions',
  userRoles: 'user_roles',
  userPermissions: 'user_permissions',
  userSessions: 'user_sessions',
} as const

// Subscription helpers for real-time features
export function subscribeToUserProfile(
  userId: string,
  callback: (payload: any) => void
) {
  return supabase
    .channel(`user_profile_${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_profiles',
        filter: `id=eq.${userId}`,
      },
      callback
    )
    .subscribe()
}

export function subscribeToUserSessions(
  userId: string,
  callback: (payload: any) => void
) {
  return supabase
    .channel(`user_sessions_${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_sessions',
        filter: `user_id=eq.${userId}`,
      },
      callback
    )
    .subscribe()
}

// Error handling helpers
export class SupabaseError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: any
  ) {
    super(message)
    this.name = 'SupabaseError'
  }
}

export function handleSupabaseError(error: any): SupabaseError {
  if (error?.code) {
    return new SupabaseError(
      error.message || 'Database operation failed',
      error.code,
      error
    )
  }
  
  return new SupabaseError(
    error?.message || 'Unknown database error',
    undefined,
    error
  )
}

// Connection health check
export async function checkSupabaseConnection(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('count')
      .limit(1)
      .single()

    return !error
  } catch {
    return false
  }
}

// Export default client
export default supabase
