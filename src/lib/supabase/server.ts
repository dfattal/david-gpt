import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Global client cache for connection reuse
let cachedClient: any = null;
let lastCacheTime = 0;
const CACHE_TTL = 60000; // 1 minute cache TTL

export async function createClient(options?: { skipCache?: boolean }) {
  // Check if we have a cached client that's still valid (skip caching if requested)
  const now = Date.now();
  if (!options?.skipCache && cachedClient && (now - lastCacheTime) < CACHE_TTL) {
    return cachedClient;
  }

  const cookieStore = await cookies()

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch (error) {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
      cookieOptions: {
        name: 'sb',
        lifetime: 60 * 60 * 24 * 7, // 7 days
        domain: undefined,
        path: '/',
        sameSite: 'lax',
      },
    }
  );

  // Cache the client for reuse (only if caching is enabled)
  if (!options?.skipCache) {
    cachedClient = client;
    lastCacheTime = now;
  }

  return client;
}

// Create a dedicated admin client with connection pooling for high-performance operations
export function createOptimizedAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    }
  );
}