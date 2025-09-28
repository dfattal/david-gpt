/**
 * Minimal Test Ingestion Route
 *
 * Bypasses all complex processing to test basic schema operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { createOptimizedAdminClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    console.log('🧪 Starting minimal ingestion test...');

    const supabase = createOptimizedAdminClient();
    const body = await req.json();

    console.log('📋 Request body received:', {
      documentsCount: body.documents?.length,
    });

    // Simple document insertion with new schema
    const testDoc = body.documents[0];

    const identifiers = {
      test_id: 'minimal-test-' + Date.now(),
    };

    const dates = {
      created: new Date().toISOString().split('T')[0],
    };

    console.log('💾 Inserting document with new schema...');

    const { data: document, error } = await supabase
      .from('documents')
      .insert({
        title: testDoc.title,
        doc_type: 'note',
        identifiers,
        dates,
        processing_status: 'completed',
        created_by: 'b349bd11-bd69-4582-9713-3ada0ba58fcf', // Test user ID
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Database insert error:', error);
      throw new Error(`Database insert failed: ${error.message}`);
    }

    console.log('✅ Document inserted successfully:', document.id);

    // Simple chunk insertion
    console.log('📦 Inserting simple chunk...');

    const { error: chunkError } = await supabase
      .from('document_chunks')
      .insert({
        document_id: document.id,
        content: testDoc.content,
        content_hash: 'test-hash-' + Date.now(),
        token_count: Math.floor(testDoc.content.length / 4), // Rough estimate
        chunk_index: 0,
        chunk_type: 'content',
        metadata: testDoc.metadata,
      });

    if (chunkError) {
      console.error('❌ Chunk insert error:', chunkError);
      throw new Error(`Chunk insert failed: ${chunkError.message}`);
    }

    console.log('✅ Chunk inserted successfully');

    return NextResponse.json(
      {
        success: true,
        documentId: document.id,
        message: 'Minimal ingestion test completed successfully',
        schema: {
          identifiers: Object.keys(identifiers),
          dates: Object.keys(dates),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('❌ Minimal ingestion test failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
