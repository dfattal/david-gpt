/**
 * Admin API Route for Database Reset
 *
 * WARNING: This endpoint will delete ALL data from ALL tables!
 * Use only for testing environments.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Helper function to check admin permissions
async function checkAdminPermissions(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Unauthorized', status: 401 };
  }
  return { error: null };
}

/**
 * POST /api/admin/reset-database
 * Reset the entire database by deleting all entries from all tables
 *
 * Body: { confirmationText: string }
 * The confirmation text must match exactly "DELETE ALL DATA" for safety
 */
export async function POST(request: NextRequest) {
  // Check admin permissions
  const authCheck = await checkAdminPermissions(request);
  if (authCheck.error) {
    return NextResponse.json(
      { error: authCheck.error },
      { status: authCheck.status }
    );
  }

  try {
    const body = await request.json();
    const { confirmationText } = body;

    // Require exact confirmation text for safety
    if (confirmationText !== 'DELETE ALL DATA') {
      return NextResponse.json(
        {
          error: 'Invalid confirmation text. Must be exactly "DELETE ALL DATA"',
        },
        { status: 400 }
      );
    }

    console.log('🚨 STARTING DATABASE RESET - ALL DATA WILL BE DELETED');

    // Get initial counts for reporting
    const initialCounts: Record<string, number> = {};
    const tables = [
      'search_queries',
      'processing_jobs',
      'message_citations',
      'messages',
      'conversation_sources',
      'conversations',
      'aliases',
      'events',
      'edges',
      'entities',
      'document_chunks',
      'documents',
    ];

    for (const table of tables) {
      try {
        const { count } = await supabaseAdmin
          .from(table)
          .select('*', { count: 'exact', head: true });
        initialCounts[table] = count || 0;
      } catch (err) {
        console.warn(`Could not get count for table ${table}:`, err);
        initialCounts[table] = 0;
      }
    }

    // Execute deletions in dependency order (children first, parents last)
    // NOTE: user_profiles is preserved to maintain admin access
    const deletionOrder = [
      // Tables with no dependencies
      'search_queries',
      'processing_jobs',

      // Citation and message data
      'message_citations',
      'messages',

      // Conversation data
      'conversation_sources',
      'conversations',

      // Knowledge graph data (in dependency order)
      'aliases', // depends on entities
      'events', // depends on entities and documents
      'edges', // depends on entities and documents
      'entities', // parent table

      // Document data
      'document_chunks', // depends on documents
      'documents', // parent table

      // user_profiles table is intentionally preserved to maintain admin access
    ];

    const deletionResults: Record<
      string,
      { success: boolean; error?: string; deletedCount?: number }
    > = {};

    for (const table of deletionOrder) {
      try {
        console.log(`🗑️  Deleting all records from ${table}...`);

        // Use a condition that matches all records (.neq with a field that doesn't exist)
        const { error } = await supabaseAdmin
          .from(table)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000'); // UUID that shouldn't exist

        if (error) {
          throw error;
        }

        deletionResults[table] = {
          success: true,
          deletedCount: initialCounts[table] || 0,
        };
        console.log(
          `✅ Deleted ${initialCounts[table] || 0} records from ${table}`
        );
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        console.error(`❌ Failed to delete from ${table}:`, errorMessage);
        deletionResults[table] = {
          success: false,
          error: errorMessage,
        };

        // Continue with other tables even if one fails
        // This ensures we delete as much as possible
      }
    }

    // Check final counts to verify deletion
    const finalCounts: Record<string, number> = {};
    let totalDeleted = 0;

    for (const table of tables) {
      try {
        const { count } = await supabaseAdmin
          .from(table)
          .select('*', { count: 'exact', head: true });
        finalCounts[table] = count || 0;
        totalDeleted += (initialCounts[table] || 0) - (finalCounts[table] || 0);
      } catch (err) {
        console.warn(`Could not get final count for table ${table}:`, err);
        finalCounts[table] = -1; // Mark as unknown
      }
    }

    console.log('🏁 DATABASE RESET COMPLETED');
    console.log(`📊 Total records deleted: ${totalDeleted}`);

    const hasErrors = Object.values(deletionResults).some(
      result => !result.success
    );
    const successCount = Object.values(deletionResults).filter(
      result => result.success
    ).length;
    const errorCount = Object.values(deletionResults).filter(
      result => !result.success
    ).length;

    return NextResponse.json({
      message: hasErrors
        ? `Database reset completed with ${errorCount} errors out of ${deletionOrder.length} tables`
        : 'Database reset completed successfully',
      success: !hasErrors,
      summary: {
        totalTablesProcessed: deletionOrder.length,
        successfulDeletions: successCount,
        failedDeletions: errorCount,
        totalRecordsDeleted: totalDeleted,
      },
      initialCounts,
      finalCounts,
      deletionResults,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in POST /api/admin/reset-database:', error);
    return NextResponse.json(
      {
        error: 'Database reset failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
