#!/usr/bin/env tsx
/**
 * Migration script to upload existing RAG markdown files to Supabase Storage
 * Usage: pnpm migrate:rag-storage
 */

import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Load .env.local
config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Missing Supabase credentials');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface MigrationStats {
  totalFiles: number;
  uploaded: number;
  skipped: number;
  failed: number;
  errors: Array<{ file: string; error: string }>;
}

/**
 * Calculate SHA-256 hash of file content
 */
function calculateHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Get all personas by scanning the personas directory
 */
async function getPersonas(): Promise<string[]> {
  const personasDir = path.join(process.cwd(), 'personas');
  const entries = await fs.readdir(personasDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name);
}

/**
 * Get all markdown files from a persona's RAG directory
 */
async function getRagFiles(personaSlug: string): Promise<string[]> {
  const ragDir = path.join(process.cwd(), 'personas', personaSlug, 'RAG');

  try {
    await fs.access(ragDir);
  } catch {
    console.log(`  ⚠️  No RAG directory for persona: ${personaSlug}`);
    return [];
  }

  const entries = await fs.readdir(ragDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(ragDir, entry.name));
}

/**
 * Extract document ID from markdown frontmatter
 */
function extractDocId(content: string): string | null {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return null;

  const frontmatter = frontmatterMatch[1];
  const idMatch = frontmatter.match(/^id:\s*(.+)$/m);

  return idMatch ? idMatch[1].trim() : null;
}

/**
 * Upload a single file to Supabase Storage
 */
async function uploadFile(
  filePath: string,
  personaSlug: string,
  stats: MigrationStats
): Promise<void> {
  const fileName = path.basename(filePath);

  try {
    // Read file content
    const content = await fs.readFile(filePath, 'utf-8');
    const fileSize = Buffer.byteLength(content, 'utf-8');
    const contentHash = calculateHash(content);

    // Extract document ID from frontmatter
    const docId = extractDocId(content);
    if (!docId) {
      console.log(`    ⚠️  Skipped ${fileName}: No document ID in frontmatter`);
      stats.skipped++;
      return;
    }

    // Check if document exists in database
    const { data: docExists } = await supabase
      .from('docs')
      .select('id')
      .eq('id', docId)
      .single();

    if (!docExists) {
      console.log(`    ⚠️  Skipped ${fileName}: Document ${docId} not found in database`);
      stats.skipped++;
      return;
    }

    // Upload to Supabase Storage
    const storagePath = `${personaSlug}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('formatted-documents')
      .upload(storagePath, content, {
        contentType: 'text/markdown',
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    // Create document_files record
    const { error: dbError } = await supabase
      .from('document_files')
      .upsert({
        doc_id: docId,
        persona_slug: personaSlug,
        storage_path: storagePath,
        file_size: fileSize,
        content_hash: contentHash,
      }, {
        onConflict: 'storage_path',
      });

    if (dbError) {
      throw dbError;
    }

    console.log(`    ✓ Uploaded ${fileName} (${(fileSize / 1024).toFixed(2)} KB)`);
    stats.uploaded++;

  } catch (error) {
    console.error(`    ✗ Failed to upload ${fileName}:`, error);
    stats.failed++;
    stats.errors.push({
      file: filePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Main migration function
 */
async function main() {
  console.log('\n=== Migrating RAG files to Supabase Storage ===\n');

  const stats: MigrationStats = {
    totalFiles: 0,
    uploaded: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  // Get all personas
  const personas = await getPersonas();
  console.log(`Found ${personas.length} persona(s): ${personas.join(', ')}\n`);

  // Process each persona
  for (const personaSlug of personas) {
    console.log(`Processing persona: ${personaSlug}`);

    const files = await getRagFiles(personaSlug);
    if (files.length === 0) {
      continue;
    }

    console.log(`  Found ${files.length} markdown file(s)`);
    stats.totalFiles += files.length;

    // Upload each file
    for (const file of files) {
      await uploadFile(file, personaSlug, stats);
    }

    console.log('');
  }

  // Print summary
  console.log('=== Migration Summary ===');
  console.log(`Total files: ${stats.totalFiles}`);
  console.log(`✓ Uploaded: ${stats.uploaded}`);
  console.log(`⚠️  Skipped: ${stats.skipped}`);
  console.log(`✗ Failed: ${stats.failed}`);

  if (stats.errors.length > 0) {
    console.log('\n=== Errors ===');
    stats.errors.forEach(({ file, error }) => {
      console.log(`  ${file}: ${error}`);
    });
  }

  process.exit(stats.failed > 0 ? 1 : 0);
}

main();
