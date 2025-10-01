#!/usr/bin/env tsx
/**
 * Test script for admin document API routes
 * Tests authentication and basic CRUD operations
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const baseUrl = 'http://localhost:3000';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  data?: any;
}

const results: TestResult[] = [];

async function testGetDocuments() {
  console.log('\n📝 Testing GET /api/admin/documents...');

  try {
    // Get admin user session
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const adminUser = users.find(u => u.email === 'dfattal@gmail.com');

    if (!adminUser) {
      throw new Error('No admin user found');
    }

    console.log(`   Using admin user: ${adminUser.email}`);

    // Create session token
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.createSession(adminUser.id);

    if (sessionError) {
      throw sessionError;
    }

    // Make authenticated request
    const response = await fetch(`${baseUrl}/api/admin/documents`, {
      headers: {
        'Cookie': `sb-access-token=${sessionData.session.access_token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
    }

    console.log(`   ✓ Status: ${response.status}`);
    console.log(`   ✓ Documents found: ${data.documents?.length || 0}`);

    if (data.documents && data.documents.length > 0) {
      const doc = data.documents[0];
      console.log(`   ✓ First document: ${doc.title} (${doc.persona_slug})`);
      console.log(`   ✓ Chunks: ${doc.chunk_count}, Size: ${doc.file_size} bytes`);
    }

    results.push({
      name: 'GET /api/admin/documents',
      passed: true,
      data: { count: data.documents?.length, total: data.total },
    });

    return data.documents;
  } catch (error) {
    console.error(`   ✗ Error:`, error);
    results.push({
      name: 'GET /api/admin/documents',
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

async function testGetDocumentById(documents: any[]) {
  console.log('\n📝 Testing GET /api/admin/documents/[id]...');

  if (documents.length === 0) {
    console.log('   ⚠️  Skipped: No documents available');
    results.push({
      name: 'GET /api/admin/documents/[id]',
      passed: false,
      error: 'No documents to test with',
    });
    return;
  }

  try {
    const testDoc = documents[0];
    console.log(`   Testing with document: ${testDoc.id}`);

    // Get admin user session
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const adminUser = users.find(u => u.email === 'dfattal@gmail.com');

    if (!adminUser) {
      throw new Error('No admin user found');
    }

    const { data: sessionData } = await supabase.auth.admin.createSession(adminUser.id);

    const response = await fetch(`${baseUrl}/api/admin/documents/${testDoc.id}`, {
      headers: {
        'Cookie': `sb-access-token=${sessionData!.session.access_token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
    }

    console.log(`   ✓ Status: ${response.status}`);
    console.log(`   ✓ Document: ${data.document.title}`);
    console.log(`   ✓ Type: ${data.document.type}`);
    console.log(`   ✓ Personas: ${data.document.personas.join(', ')}`);
    console.log(`   ✓ Tags: ${data.document.tags.join(', ')}`);
    console.log(`   ✓ Chunk count: ${data.document.chunk_count}`);
    console.log(`   ✓ Storage path: ${data.document.storage_path}`);
    console.log(`   ✓ Content length: ${data.document.raw_content.length} chars`);

    results.push({
      name: 'GET /api/admin/documents/[id]',
      passed: true,
      data: { id: data.document.id, title: data.document.title },
    });
  } catch (error) {
    console.error(`   ✗ Error:`, error);
    results.push({
      name: 'GET /api/admin/documents/[id]',
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function testFilteringAndSearch() {
  console.log('\n📝 Testing filtering and search...');

  try {
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const adminUser = users.find(u => u.email?.includes('david'));
    const { data: sessionData } = await supabase.auth.admin.createSession(adminUser!.id);

    const cookie = `sb-access-token=${sessionData!.session.access_token}`;

    // Test persona filter
    const personaResp = await fetch(`${baseUrl}/api/admin/documents?personaSlug=david`, {
      headers: { 'Cookie': cookie },
    });
    const personaData = await personaResp.json();
    console.log(`   ✓ Persona filter (david): ${personaData.documents.length} documents`);

    // Test search
    const searchResp = await fetch(`${baseUrl}/api/admin/documents?search=leia`, {
      headers: { 'Cookie': cookie },
    });
    const searchData = await searchResp.json();
    console.log(`   ✓ Search (leia): ${searchData.documents.length} documents`);

    results.push({
      name: 'Filtering and search',
      passed: true,
      data: { personaFilter: personaData.total, search: searchData.total },
    });
  } catch (error) {
    console.error(`   ✗ Error:`, error);
    results.push({
      name: 'Filtering and search',
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  results.forEach(result => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  console.log('\n' + '-'.repeat(60));
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('='.repeat(60) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

async function main() {
  console.log('🚀 Starting admin API routes tests...');
  console.log(`Base URL: ${baseUrl}`);

  const documents = await testGetDocuments();
  await testGetDocumentById(documents);
  await testFilteringAndSearch();

  await printSummary();
}

main();
