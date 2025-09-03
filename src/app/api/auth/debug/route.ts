import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    // Get all cookies for debugging
    const cookies = req.cookies.getAll()
    
    return NextResponse.json({ 
      user: user ? { id: user.id, email: user.email } : null,
      authError: authError?.message || null,
      cookies: cookies.map(c => ({ name: c.name, hasValue: !!c.value }))
    })
  } catch (error) {
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      user: null,
      cookies: []
    })
  }
}