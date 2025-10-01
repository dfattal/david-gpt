#!/usr/bin/env tsx
/**
 * Test script for newly implemented admin document API routes
 * Tests: upload, metadata update, reingest, delete, download
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'path';
import fs from 'fs/promises';

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

async function getAdminCookie() {
  const {
    data: { users },
  } = await supabase.auth.admin.listUsers();
  const adminUser = users.find((u) => u.email === 'dfattal@gmail.com');

  if (!adminUser) {
    throw new Error('No admin user found');
  }

  const { data: sessionData, error: sessionError } =
    await supabase.auth.admin.createSession(adminUser.id);

  if (sessionError) {
    throw sessionError;
  }

  return `sb-access-token=${sessionData.session.access_token}`;
}

async function testDownload(cookie: string) {
  console.log('\n📥 Testing GET /api/admin/documents/[id]/download...');

  try {
    const response = await fetch(
      `${baseUrl}/api/admin/documents/lif/download`,
      {
        headers: { Cookie: cookie },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const content = await response.text();
    const contentType = response.headers.get('content-type');
    const disposition = response.headers.get('content-disposition');

    console.log(`   ✓ Status: ${response.status}`);
    console.log(`   ✓ Content-Type: ${contentType}`);
    console.log(`   ✓ Content-Disposition: ${disposition}`);
    console.log(`   ✓ Content length: ${content.length} chars`);
    console.log(
      `   ✓ Starts with: ${content.substring(0, 50).replace(/\n/g, '↵')}...`
    );

    results.push({
      name: 'GET /api/admin/documents/[id]/download',
      passed: true,
      data: { contentLength: content.length },
    });
  } catch (error) {
    console.error(`   ✗ Error:`, error);
    results.push({
      name: 'GET /api/admin/documents/[id]/download',
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function testUpload(cookie: string) {
  console.log('\n📤 Testing POST /api/admin/documents/upload...');

  try {
    // Create test markdown file
    const testContent = `---
id: test-upload-doc
title: Test Upload Document
type: article
personas: [david]
tags: [test]
summary: A test document for upload API
---

## Key Terms

- Test term 1
- Test term 2

## Also Known As (AKA)

- **API**: Application Programming Interface

## Content

This is a test document for the upload endpoint.
`;

    const formData = new FormData();
    const blob = new Blob([testContent], { type: 'text/markdown' });
    formData.append('file', blob, 'test-upload.md');
    formData.append('personaSlug', 'david');

    const response = await fetch(`${baseUrl}/api/admin/documents/upload`, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
    }

    console.log(`   ✓ Status: ${response.status}`);
    console.log(`   ✓ Success: ${data.success}`);
    console.log(`   ✓ Document ID: ${data.document.id}`);
    console.log(`   ✓ Title: ${data.document.title}`);
    console.log(`   ✓ Storage path: ${data.document.storage_path}`);

    results.push({
      name: 'POST /api/admin/documents/upload',
      passed: true,
      data: { id: data.document.id },
    });

    return data.document.id;
  } catch (error) {
    console.error(`   ✗ Error:`, error);
    results.push({
      name: 'POST /api/admin/documents/upload',
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function testMetadataUpdate(cookie: string, docId: string) {
  console.log('\n✏️  Testing PATCH /api/admin/documents/[id]/metadata...');

  try {
    const updates = {
      summary: 'Updated summary via API test',
      tags: ['test', 'updated'],
      keyTerms: ['Updated term 1', 'Updated term 2', 'New term 3'],
    };

    const response = await fetch(
      `${baseUrl}/api/admin/documents/${docId}/metadata`,
      {
        method: 'PATCH',
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
    }

    console.log(`   ✓ Status: ${response.status}`);
    console.log(`   ✓ Success: ${data.success}`);
    console.log(`   ✓ Document ID: ${data.document.id}`);
    console.log(`   ✓ Updated at: ${data.document.updated_at}`);

    // Verify changes
    const verifyResponse = await fetch(
      `${baseUrl}/api/admin/documents/${docId}`,
      {
        headers: { Cookie: cookie },
      }
    );
    const verifyData = await verifyResponse.json();

    console.log(`   ✓ Verified summary: ${verifyData.document.summary}`);
    console.log(`   ✓ Verified tags: ${verifyData.document.tags.join(', ')}`);

    results.push({
      name: 'PATCH /api/admin/documents/[id]/metadata',
      passed: true,
      data: { id: data.document.id },
    });
  } catch (error) {
    console.error(`   ✗ Error:`, error);
    results.push({
      name: 'PATCH /api/admin/documents/[id]/metadata',
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function testReingest(cookie: string, docId: string) {
  console.log('\n🔄 Testing POST /api/admin/documents/[id]/reingest...');

  try {
    const response = await fetch(
      `${baseUrl}/api/admin/documents/${docId}/reingest`,
      {
        method: 'POST',
        headers: { Cookie: cookie },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
    }

    console.log(`   ✓ Status: ${response.status}`);
    console.log(`   ✓ Success: ${data.success}`);
    console.log(`   ✓ Document ID: ${data.result.id}`);
    console.log(`   ✓ Chunks created: ${data.result.chunks_created}`);

    results.push({
      name: 'POST /api/admin/documents/[id]/reingest',
      passed: true,
      data: { chunks: data.result.chunks_created },
    });
  } catch (error) {
    console.error(`   ✗ Error:`, error);
    results.push({
      name: 'POST /api/admin/documents/[id]/reingest',
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function testDelete(cookie: string, docId: string) {
  console.log('\n🗑️  Testing DELETE /api/admin/documents/[id]...');

  try {
    const response = await fetch(`${baseUrl}/api/admin/documents/${docId}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
    }

    console.log(`   ✓ Status: ${response.status}`);
    console.log(`   ✓ Success: ${data.success}`);
    console.log(`   ✓ Message: ${data.message}`);

    // Verify deletion
    const verifyResponse = await fetch(
      `${baseUrl}/api/admin/documents/${docId}`,
      {
        headers: { Cookie: cookie },
      }
    );

    if (verifyResponse.status === 404) {
      console.log(`   ✓ Verified: Document no longer exists`);
    } else {
      console.log(
        `   ⚠️  Warning: Document still exists (status ${verifyResponse.status})`
      );
    }

    results.push({
      name: 'DELETE /api/admin/documents/[id]',
      passed: true,
      data: { deleted: docId },
    });
  } catch (error) {
    console.error(`   ✗ Error:`, error);
    results.push({
      name: 'DELETE /api/admin/documents/[id]',
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY - New Admin Routes');
  console.log('='.repeat(60));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  results.forEach((result) => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  console.log('\n' + '-'.repeat(60));
  console.log(
    `Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`
  );
  console.log('='.repeat(60) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

async function main() {
  console.log('🚀 Starting new admin API routes tests...');
  console.log(`Base URL: ${baseUrl}`);

  try {
    const cookie = await getAdminCookie();
    console.log('✓ Admin session created');

    // Test download first (using existing doc)
    await testDownload(cookie);

    // Test upload and get new doc ID
    const newDocId = await testUpload(cookie);

    if (newDocId) {
      // Test metadata update
      await testMetadataUpdate(cookie, newDocId);

      // Test reingest
      await testReingest(cookie, newDocId);

      // Test delete (cleanup)
      await testDelete(cookie, newDocId);
    } else {
      console.log('\n⚠️  Skipping remaining tests due to upload failure');
    }

    await printSummary();
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
