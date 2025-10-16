import { createBrowserClient } from '@supabase/ssr'

// Lazy-initialize to avoid errors during build/prerendering
let supabaseInstance: ReturnType<typeof createBrowserClient> | null = null

function getSupabaseClient() {
  if (supabaseInstance) {
    return supabaseInstance
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables')
  }

  supabaseInstance = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: {
      name: 'sb',
      lifetime: 60 * 60 * 24 * 7, // 7 days
      domain: undefined,
      path: '/',
      sameSite: 'lax',
    },
  })

  return supabaseInstance
}

// Export as a getter to maintain backwards compatibility
export const supabase = new Proxy({} as ReturnType<typeof createBrowserClient>, {
  get(_target, prop) {
    return getSupabaseClient()[prop as keyof ReturnType<typeof createBrowserClient>]
  },
})