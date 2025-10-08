import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export const updateSession = async (request: NextRequest) => {
  // Create a response that we'll modify if needed
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Set cookies on the request for downstream handlers
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })

          // Create a new response with updated cookies
          supabaseResponse = NextResponse.next({
            request,
          })

          // Set cookies on the response to send back to the browser
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
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
  )

  // Refresh the auth token and ensure session is valid
  // This will automatically refresh expired tokens
  const { data: { user } } = await supabase.auth.getUser()

  // If no user and trying to access protected routes, redirect to login
  // (Optional - uncomment if you want to enforce auth on certain routes)
  // if (!user && !request.nextUrl.pathname.startsWith('/auth')) {
  //   const redirectUrl = request.nextUrl.clone()
  //   redirectUrl.pathname = '/auth/login'
  //   return NextResponse.redirect(redirectUrl)
  // }

  return supabaseResponse
}