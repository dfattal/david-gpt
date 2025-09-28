import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getActiveConnections } from '@/lib/sse-manager';

export async function GET(req: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const activeConnections = getActiveConnections();

    console.log(`\n🔍 === DEBUG CONNECTIONS CHECK ===`);
    console.log(`🔍 Checking for user: ${user.id}`);
    console.log(`📊 Active connections: [${activeConnections.join(', ')}]`);
    console.log(`📊 Total connections: ${activeConnections.length}`);
    console.log(
      `📊 User has connection: ${activeConnections.includes(user.id)}`
    );
    console.log(`🕐 Timestamp: ${new Date().toISOString()}`);
    console.log(`🔍 === END DEBUG CHECK ===\n`);

    return NextResponse.json({
      userId: user.id,
      activeConnections,
      totalConnections: activeConnections.length,
      userHasConnection: activeConnections.includes(user.id),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Debug connections error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
