#!/usr/bin/env tsx
/**
 * Test script for Phase 4 Hybrid Search Implementation
 * Tests vector search, BM25 search, and RRF fusion
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { performSearch } from '../src/lib/rag/search';

// Load environment variables
config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.error('❌ Missing OpenAI API key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Test queries that should match the ingested documents
const TEST_QUERIES = [
  {
    query: 'lightfield displays',
    persona: 'david',
    expectedDocs: ['evolution-leia-inc', 'lif'],
    description: 'General query about lightfield technology',
  },
  {
    query: 'diffractive backlighting patents',
    persona: 'david',
    expectedDocs: ['us11281020'],
    description: 'Specific keyword query for patent',
  },
  {
    query: 'LeiaSR release notes version 1.34',
    persona: 'david',
    expectedDocs: ['leiasr-release-notes-1-34-6'],
    description: 'Specific version query',
  },
  {
    query: 'DLB and 3D cell technology',
    persona: 'david',
    expectedDocs: ['evolution-leia-inc', 'us11281020'],
    description: 'Query using persona tag aliases',
  },
];

async function runTest(
  testCase: typeof TEST_QUERIES[0],
  testNum: number
) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`TEST ${testNum}: ${testCase.description}`);
  console.log(`Query: "${testCase.query}"`);
  console.log(`Persona: ${testCase.persona}`);
  console.log(`Expected docs: ${testCase.expectedDocs.join(', ')}`);
  console.log('='.repeat(80));

  try {
    const results = await performSearch(
      testCase.query,
      {
        personaSlug: testCase.persona,
        limit: 12,
      },
      supabase
    );

    console.log(`\n📊 Results: ${results.length} chunks returned`);

    if (results.length === 0) {
      console.log('⚠️  No results found');
      return { passed: false, reason: 'No results' };
    }

    // Group results by document
    const docGroups = new Map<string, typeof results>();
    results.forEach((result) => {
      const existing = docGroups.get(result.docId) || [];
      existing.push(result);
      docGroups.set(result.docId, existing);
    });

    console.log(`\n📄 Documents in results (${docGroups.size}):`);
    docGroups.forEach((chunks, docId) => {
      const firstChunk = chunks[0];
      console.log(`  - ${docId} (${chunks.length} chunks)`);
      console.log(`    Title: ${firstChunk.docTitle || 'N/A'}`);
      console.log(`    Scores: RRF=${firstChunk.score.toFixed(4)}, Vector=${firstChunk.vectorScore?.toFixed(4) || 'N/A'}, BM25=${firstChunk.bm25Score?.toFixed(4) || 'N/A'}`);
      console.log(`    Tag Boost: ${firstChunk.tagBoostApplied ? 'Yes ✓' : 'No'}`);
    });

    // Check if expected docs are present
    const foundDocs = Array.from(docGroups.keys());
    const missingDocs = testCase.expectedDocs.filter(
      (expected) => !foundDocs.includes(expected)
    );

    if (missingDocs.length === 0) {
      console.log(`\n✅ Test PASSED: All expected documents found`);
      return { passed: true };
    } else {
      console.log(`\n⚠️  Test PARTIAL: Missing expected documents: ${missingDocs.join(', ')}`);
      return { passed: false, reason: `Missing docs: ${missingDocs.join(', ')}` };
    }
  } catch (error) {
    console.error(`\n❌ Test FAILED with error:`, error);
    return { passed: false, reason: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function main() {
  console.log('\n🧪 HYBRID SEARCH TEST SUITE - Phase 4 Implementation');
  console.log('Testing: Vector Search + BM25 + RRF Fusion + Tag Boosting\n');

  const results = [];

  for (let i = 0; i < TEST_QUERIES.length; i++) {
    const result = await runTest(TEST_QUERIES[i], i + 1);
    results.push(result);
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;

  console.log(`Total tests: ${results.length}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ❌`);

  results.forEach((result, index) => {
    const icon = result.passed ? '✅' : '❌';
    const reason = result.reason ? ` (${result.reason})` : '';
    console.log(`  ${icon} Test ${index + 1}${reason}`);
  });

  console.log('\n' + '='.repeat(80));

  if (failed === 0) {
    console.log('🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Review results above.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});