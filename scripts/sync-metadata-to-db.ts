/**
 * Sync metadata from frontmatter to database
 *
 * This script extracts source_url and date from document frontmatter
 * and syncs it to the database columns for documents that are missing this data.
 *
 * Run with: pnpm tsx scripts/sync-metadata-to-db.ts
 */

import { createClient } from '@supabase/supabase-js';
import matter from 'gray-matter';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface DocRow {
  id: string;
  title: string;
  source_url: string | null;
  date: string | null;
  raw_content: string;
}

async function syncMetadata() {
  console.log('🔄 Starting metadata sync from frontmatter to database...\n');

  // Get all docs where source_url or date is NULL
  const { data: docs, error } = await supabase
    .from('docs')
    .select('id, title, source_url, date, raw_content')
    .or('source_url.is.null,date.is.null')
    .order('id');

  if (error) {
    console.error('Error fetching docs:', error);
    process.exit(1);
  }

  if (!docs || docs.length === 0) {
    console.log('✅ No documents need syncing');
    return;
  }

  console.log(`📋 Found ${docs.length} documents with missing metadata\n`);

  let syncedSourceUrl = 0;
  let syncedDate = 0;
  let errors = 0;

  for (const doc of docs as DocRow[]) {
    try {
      // Parse frontmatter
      const { data: frontmatter } = matter(doc.raw_content);

      // Extract source_url (with fallback chain)
      const sourceUrl = frontmatter.identifiers?.source_url ||
                       frontmatter.source_url ||
                       null;

      // Extract date (with fallback chain)
      const date = frontmatter.dates?.created ||
                  frontmatter.dates?.published ||
                  frontmatter.dates?.filing ||
                  (frontmatter.date instanceof Date ? frontmatter.date.toISOString().split('T')[0] : frontmatter.date) ||
                  null;

      // Determine what needs to be updated
      const updates: any = {};

      if (!doc.source_url && sourceUrl) {
        updates.source_url = sourceUrl;
        syncedSourceUrl++;
      }

      if (!doc.date && date) {
        updates.date = date;
        syncedDate++;
      }

      // Update if there's something to update
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('docs')
          .update(updates)
          .eq('id', doc.id);

        if (updateError) {
          console.error(`❌ Error updating ${doc.id}:`, updateError.message);
          errors++;
        } else {
          console.log(`✅ ${doc.id}: Updated`, Object.keys(updates).join(', '));
        }
      } else {
        console.log(`⏭️  ${doc.id}: No updates needed`);
      }
    } catch (err) {
      console.error(`❌ Error processing ${doc.id}:`, err);
      errors++;
    }
  }

  console.log('\n📊 Sync Summary:');
  console.log(`   Source URLs synced: ${syncedSourceUrl}`);
  console.log(`   Dates synced: ${syncedDate}`);
  console.log(`   Errors: ${errors}`);
  console.log('\n✅ Metadata sync complete!');
}

syncMetadata().catch(console.error);
