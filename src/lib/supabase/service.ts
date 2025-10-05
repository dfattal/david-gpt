/**
 * Supabase Service Client
 * For use in workers and background jobs (no request context)
 * Uses service role key for admin operations
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Create a Supabase service client for use in workers
 * Bypasses RLS and uses service role key
 */
export function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables for service client');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
