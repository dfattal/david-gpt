/**
 * Instrumentation hook for API pre-warming
 * This runs during application startup to eliminate cold start penalties
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Only run on server-side
    console.log('🔥 Starting API pre-warming...');

    // Pre-warm critical API routes by importing their handlers
    // This forces Next.js to compile them during startup
    try {
      // Pre-warm chat API (most critical route)
      await import('./app/api/chat/route');
      console.log('✅ Chat API pre-warmed');

      // Pre-warm conversations API
      await import('./app/api/conversations/route');
      console.log('✅ Conversations API pre-warmed');

      // Pre-warm auth routes
      await import('./app/api/auth/user/route');
      console.log('✅ Auth API pre-warmed');

      // Pre-warm critical RAG modules
      await import('./lib/rag/sequential-rag');
      console.log('✅ RAG modules pre-warmed');

      // Pre-warm database client
      await import('./lib/supabase/server');
      console.log('✅ Database client pre-warmed');

      console.log('🚀 API pre-warming completed');
    } catch (error) {
      console.warn('⚠️ API pre-warming encountered issues:', error);
      // Don't fail the startup if pre-warming fails
    }
  }
}
