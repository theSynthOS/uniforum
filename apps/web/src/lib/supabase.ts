/**
 * Supabase Client (Server-side only)
 *
 * All Supabase calls go through API routes.
 * No client-side Supabase access - keeps credentials secure.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@uniforum/shared/types/database';

let supabaseInstance: SupabaseClient<Database> | null = null;

/**
 * Create a server-side Supabase client
 * Only use this in API routes, never on the client
 */
export function createServerSupabaseClient(): SupabaseClient<Database> {
  // Return cached instance if available
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing Supabase environment variables. ' +
        'Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.'
    );
  }

  supabaseInstance = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseInstance;
}

/**
 * Helper to check if we're running on the server
 */
export function isServer(): boolean {
  return typeof window === 'undefined';
}
