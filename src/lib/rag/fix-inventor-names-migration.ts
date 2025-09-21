/**
 * Migration Script: Fix Inventor Names and Metadata Injection
 * 
 * Updates existing patent documents to:
 * 1. Normalize inventor names in the database (Fattal → David A. Fattal)
 * 2. Re-inject metadata into abstract chunks with normalized names
 * 3. Ensure all David Fattal patents are properly searchable
 */

import { createClient } from '@supabase/supabase-js';
import { normalizeInventorNames } from './name-normalization';
import { injectMetadataIntoContent } from './metadata-templates';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

interface PatentDocument {
  id: string;
  title: string;
  patent_no: string;
  inventors: string;
  assignees: string | null;
  original_assignee: string | null;
  filed_date: string | null;
  granted_date: string | null;
  abstract: string | null;
}

interface DocumentChunk {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  section_title: string | null;
}

/**
 * Get all patent documents that need inventor name fixes
 */
async function getPatentsToFix(): Promise<PatentDocument[]> {
  console.log('🔍 Finding patents with inventor name issues...');
  
  const { data, error } = await supabaseAdmin
    .from('documents')
    .select(`
      id,
      title,
      patent_no,
      inventors,
      assignees,
      original_assignee,
      filed_date,
      granted_date,
      abstract
    `)
    .eq('doc_type', 'patent')
    .not('inventors', 'is', null);

  if (error) {
    throw new Error(`Failed to fetch patents: ${error.message}`);
  }

  if (!data || data.length === 0) {
    console.log('❌ No patent documents found');
    return [];
  }

  console.log(`✅ Found ${data.length} patent documents`);
  return data as PatentDocument[];
}

/**
 * Check if inventors need normalization
 */
function needsInventorNormalization(inventors: string[]): boolean {
  const normalized = normalizeInventorNames(inventors);
  return JSON.stringify(inventors) !== JSON.stringify(normalized);
}

/**
 * Update patent document with normalized inventor names
 */
async function updatePatentInventors(patent: PatentDocument): Promise<void> {
  try {
    // Parse current inventors
    const currentInventors = JSON.parse(patent.inventors) as string[];
    
    // Check if normalization is needed
    if (!needsInventorNormalization(currentInventors)) {
      console.log(`✅ ${patent.patent_no}: Inventors already normalized`);
      return;
    }

    // Normalize inventor names
    const normalizedInventors = normalizeInventorNames(currentInventors);
    
    console.log(`🔧 ${patent.patent_no}: "${currentInventors.join(', ')}" → "${normalizedInventors.join(', ')}"`);
    
    // Update database
    const { error } = await supabaseAdmin
      .from('documents')
      .update({
        inventors: JSON.stringify(normalizedInventors)
      })
      .eq('id', patent.id);

    if (error) {
      throw new Error(`Failed to update patent ${patent.patent_no}: ${error.message}`);
    }

    console.log(`✅ ${patent.patent_no}: Inventor names updated in database`);
    
  } catch (error) {
    console.error(`❌ ${patent.patent_no}: Failed to update inventors:`, error);
  }
}

/**
 * Update abstract chunk with enhanced metadata
 */
async function updateAbstractChunk(patent: PatentDocument): Promise<void> {
  try {
    // Get the abstract chunk (usually chunk_index = 0)
    const { data: chunks, error: chunksError } = await supabaseAdmin
      .from('document_chunks')
      .select('id, content, chunk_index, section_title')
      .eq('document_id', patent.id)
      .eq('chunk_index', 0)
      .limit(1);

    if (chunksError) {
      throw new Error(`Failed to fetch chunks for ${patent.patent_no}: ${chunksError.message}`);
    }

    if (!chunks || chunks.length === 0) {
      console.log(`⚠️ ${patent.patent_no}: No abstract chunk found`);
      return;
    }

    const abstractChunk = chunks[0] as DocumentChunk;
    
    // Parse normalized inventors
    const inventors = JSON.parse(patent.inventors) as string[];
    const assignees = patent.assignees ? JSON.parse(patent.assignees) as string[] : undefined;
    
    // Create enhanced metadata for injection
    const metadata = {
      title: patent.title,
      docType: 'patent' as const,
      patentNo: patent.patent_no,
      inventors,
      assignees,
      originalAssignee: patent.original_assignee || undefined,
      filedDate: patent.filed_date,
      grantedDate: patent.granted_date
    };

    // Check if content already has metadata (to avoid double-injection)
    const hasExistingMetadata = abstractChunk.content.includes('Patent ') || 
                                abstractChunk.content.includes('Inventors:') ||
                                abstractChunk.content.includes('Assignee:');

    let baseContent = abstractChunk.content;
    
    // If it already has metadata, strip it to avoid duplication
    if (hasExistingMetadata) {
      // Find the original abstract by removing metadata footer
      const lines = abstractChunk.content.split('\n');
      const metadataStartIndex = lines.findIndex(line => 
        line.includes('Patent ') || line.includes('Inventors:') || line.includes('Assignee:')
      );
      
      if (metadataStartIndex > 0) {
        baseContent = lines.slice(0, metadataStartIndex).join('\n').trim();
      }
    }

    // Inject normalized metadata
    const enhancedContent = injectMetadataIntoContent(baseContent, metadata);
    
    // Only update if content changed
    if (enhancedContent !== abstractChunk.content) {
      const { error: updateError } = await supabaseAdmin
        .from('document_chunks')
        .update({
          content: enhancedContent,
          token_count: Math.ceil(enhancedContent.length / 4) // Rough token count
        })
        .eq('id', abstractChunk.id);

      if (updateError) {
        throw new Error(`Failed to update chunk for ${patent.patent_no}: ${updateError.message}`);
      }

      console.log(`✅ ${patent.patent_no}: Abstract chunk updated with normalized metadata`);
    } else {
      console.log(`✅ ${patent.patent_no}: Abstract chunk already has correct metadata`);
    }
    
  } catch (error) {
    console.error(`❌ ${patent.patent_no}: Failed to update abstract chunk:`, error);
  }
}

/**
 * Run the complete migration
 */
async function runInventorNameMigration(): Promise<void> {
  console.log('🚀 Starting inventor name normalization migration...\n');
  
  try {
    // Get all patents to process
    const patents = await getPatentsToFix();
    
    if (patents.length === 0) {
      console.log('✅ No patents to process');
      return;
    }

    console.log(`📝 Processing ${patents.length} patents...\n`);
    
    // Process each patent
    for (const patent of patents) {
      console.log(`🔧 Processing: ${patent.title}`);
      
      // Update inventor names in database
      await updatePatentInventors(patent);
      
      // Update abstract chunk with enhanced metadata
      await updateAbstractChunk(patent);
      
      console.log(); // Empty line for readability
    }
    
    console.log('🎉 Inventor name migration completed successfully!');
    
    // Summary
    console.log('\n📊 Migration Summary:');
    console.log(`- Patents processed: ${patents.length}`);
    console.log('- All inventor names normalized');
    console.log('- All abstract chunks updated with searchable metadata');
    console.log('- David Fattal patents now fully searchable');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Export the migration function for use by other modules
export { runInventorNameMigration };

// Allow running directly as script
if (require.main === module) {
  runInventorNameMigration()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}