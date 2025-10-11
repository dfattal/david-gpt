/**
 * Test Flash Migration
 * Verify ArXiv and Generic extractors work with Gemini 2.5 Flash
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { extractArxivFromHtml } from '../src/lib/rag/extraction/arxivHtmlExtractor';
import { extractGenericArticle } from '../src/lib/rag/extraction/genericArticleExtractor';

config({ path: resolve(process.cwd(), '.env.local') });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

async function testArxivExtraction() {
  console.log('\n📄 Testing ArXiv HTML Extraction with Flash');
  console.log('='.repeat(80));

  const arxivId = '2410.01131'; // Recent paper

  try {
    const startTime = Date.now();
    const result = await extractArxivFromHtml(arxivId, GEMINI_API_KEY);
    const duration = Date.now() - startTime;

    console.log(`✅ Success in ${duration}ms`);
    console.log(`   Title: ${result.title}`);
    console.log(`   Authors: ${result.authors.length}`);
    console.log(`   Content: ${result.content.length.toLocaleString()} chars`);
    console.log(`   Abstract: ${result.abstract.length.toLocaleString()} chars`);
    console.log(`   Summary: ${result.metadata.summary}`);
    console.log(`   Key Terms: ${result.metadata.key_terms}`);

    return true;
  } catch (error) {
    console.error(`❌ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
}

async function testGenericArticleExtraction() {
  console.log('\n📰 Testing Generic Article Extraction with Flash');
  console.log('='.repeat(80));

  const url = 'https://www.anthropic.com/news/claude-3-5-sonnet';

  try {
    const startTime = Date.now();
    const result = await extractGenericArticle(url, GEMINI_API_KEY);
    const duration = Date.now() - startTime;

    console.log(`✅ Success in ${duration}ms`);
    console.log(`   Title: ${result.title}`);
    console.log(`   Authors: ${result.authors.length}`);
    console.log(`   Content: ${result.content.length.toLocaleString()} chars`);
    console.log(`   Sections: ${result.sections.length}`);
    console.log(`   Summary: ${result.metadata.summary}`);
    console.log(`   Key Terms: ${result.metadata.key_terms}`);

    return true;
  } catch (error) {
    console.error(`❌ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
}

async function main() {
  console.log('🧪 Testing Flash Migration');
  console.log('='.repeat(80));

  if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not found in environment');
    process.exit(1);
  }

  const results = {
    arxiv: await testArxivExtraction(),
    article: await testGenericArticleExtraction()
  };

  console.log('\n' + '='.repeat(80));
  console.log('MIGRATION TEST RESULTS');
  console.log('='.repeat(80));
  console.log(`ArXiv Extraction: ${results.arxiv ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Article Extraction: ${results.article ? '✅ PASS' : '❌ FAIL'}`);

  const allPassed = results.arxiv && results.article;

  if (allPassed) {
    console.log('\n✅ All tests passed! Migration successful.');
    console.log('   Gemini 2.5 Flash is working correctly for both extractors.');
  } else {
    console.log('\n❌ Some tests failed. Review errors above.');
    process.exit(1);
  }

  console.log('='.repeat(80));
}

main().catch(console.error);
