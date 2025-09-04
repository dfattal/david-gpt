import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AppError, handleApiError } from '@/lib/utils';
import { readFileSync } from 'fs';
import { join } from 'path';

const SAMPLES_DIR = '/Users/david.fattal/Documents/GitHub/david-gpt/RAG-SAMPLES';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      throw new AppError('Authentication required', 401);
    }

    // Check user role - only admin can ingest sample documents
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      throw new AppError('Admin access required', 403);
    }

    // Sample documents to process
    const sampleDocuments = [
      {
        title: 'Immersity (former LeiaSR) Platform FAQ',
        content: readFileSync(join(SAMPLES_DIR, 'Immersity (LeiaSR) FAQ.md'), 'utf-8'),
        docType: 'note',
        metadata: {
          category: 'faq',
          topic: 'spatial-ai',
          source: 'internal-documentation'
        }
      },
      {
        title: 'Phase Engineering in 3D Displays',
        content: readFileSync(join(SAMPLES_DIR, 'phase_eng.md'), 'utf-8'),
        docType: 'note',
        metadata: {
          category: 'technical-document',
          topic: 'display-technology',
          source: 'internal-documentation'
        }
      },
      {
        title: 'Leia Image Format (LIF) and Leia Video Format (LVF)',
        content: readFileSync(join(SAMPLES_DIR, 'LIF.md'), 'utf-8'),
        docType: 'note',
        metadata: {
          category: 'specification',
          topic: 'file-formats',
          source: 'internal-documentation'
        }
      },
      // Patents from the patent-url-list.md
      {
        title: 'Patent US11281020B2 - Switchable LC Lens Technology',
        docType: 'patent',
        patentUrl: 'https://patents.google.com/patent/US11281020B2/en?oq=WO2012038876A1',
        metadata: {
          category: 'patent',
          topic: 'display-technology',
          source: 'google-patents'
        }
      },
      {
        title: 'Patent WO2024145265A1 - Latest Patent Filing',
        docType: 'patent', 
        patentUrl: 'https://patents.google.com/patent/WO2024145265A1/en?oq=WO2024145265A1',
        metadata: {
          category: 'patent',
          topic: 'spatial-ai',
          source: 'google-patents'
        }
      }
    ];

    console.log('🚀 Starting RAG sample document ingestion...');
    
    const results = [];
    
    for (const doc of sampleDocuments) {
      try {
        console.log(`📄 Processing: ${doc.title}`);
        
        // Use the internal ingestion logic
        const ingestResponse = await fetch(`${req.nextUrl.origin}/api/documents/ingest`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': req.headers.get('cookie') || '',
          },
          body: JSON.stringify(doc)
        });
        
        if (!ingestResponse.ok) {
          const error = await ingestResponse.text();
          throw new Error(`HTTP ${ingestResponse.status}: ${error}`);
        }
        
        const result = await ingestResponse.json();
        results.push({
          title: doc.title,
          documentId: result.document.id,
          jobId: result.jobId,
          status: 'queued'
        });
        
        console.log(`✅ ${doc.title} - Job ID: ${result.jobId}`);
        
      } catch (error) {
        console.error(`❌ Failed to process ${doc.title}:`, error);
        results.push({
          title: doc.title,
          error: error instanceof Error ? error.message : 'Unknown error',
          status: 'failed'
        });
      }
    }
    
    const successCount = results.filter(r => r.status === 'queued').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    
    console.log(`\n📊 Ingestion Summary:`);
    console.log(`• Total documents: ${sampleDocuments.length}`);
    console.log(`• Successfully queued: ${successCount}`);
    console.log(`• Failed: ${failedCount}`);
    
    return NextResponse.json({
      message: 'Sample document ingestion completed',
      summary: {
        total: sampleDocuments.length,
        queued: successCount,
        failed: failedCount
      },
      results
    });

  } catch (error) {
    return handleApiError(error);
  }
}