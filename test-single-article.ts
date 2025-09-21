/**
 * Test Single Article Ingestion
 *
 * Quick test to validate the new schema works with a minimal payload
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

async function testSingleArticle(): Promise<void> {
  console.log('🧪 Testing single article ingestion with new schema...\n');

  try {
    const testDocument = {
      title: "Test Article for New Schema",
      content: "This is a test article to validate the new three-tier RAG architecture. It uses the cleaned up database schema with generic JSONB fields for identifiers and dates.",
      detectedType: "press-article",
      confidence: 0.95,
      metadata: {
        sourceUrl: "https://test.example.com/article",
        description: "Test article for schema validation",
        batch: true,
        fileName: "test-article.md",
        fileSize: 200,
        domain: "example.com",
        author: "Test Author"
      }
    };

    const batchRequest = {
      documents: [testDocument],
      batchDescription: "Single test article for new schema validation"
    };

    console.log('📋 Test payload:', JSON.stringify(batchRequest, null, 2));

    const serverUrl = 'http://localhost:3000';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY not found in environment');
    }

    console.log('\n🚀 Making API request...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log('⏰ Request timed out after 30 seconds');
      controller.abort();
    }, 30000); // 30 second timeout

    const response = await fetch(`${serverUrl}/api/documents/batch-ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify(batchRequest),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    console.log(`📡 Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Success! Result:', result);

  } catch (error) {
    console.error('❌ Test failed:', error);

    if (error.name === 'AbortError') {
      console.log('💡 Request was aborted due to timeout. The API endpoint may be hanging.');
    }

    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testSingleArticle().catch(console.error);
}

export { testSingleArticle };