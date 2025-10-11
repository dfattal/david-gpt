/**
 * Test Script: Gemini 2.5 Pro vs Flash Comparison
 * Tests extraction quality, JSON formatting, and performance
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') });

interface TestResult {
  model: string;
  testCase: string;
  success: boolean;
  duration: number;
  outputTokens?: number;
  jsonValid: boolean;
  jsonParseError?: string;
  contentQuality: {
    hasTitle: boolean;
    hasAbstract: boolean;
    hasContent: boolean;
    contentLength: number;
    hasSummary: boolean;
    hasKeyTerms: boolean;
    hasMetadata: boolean;
  };
  rawResponse?: string;
}

interface TestCase {
  name: string;
  type: 'arxiv' | 'article';
  input: string;
  description: string;
}

const testCases: TestCase[] = [
  {
    name: 'ArXiv HTML - Simple Paper',
    type: 'arxiv',
    input: '2501.00123', // Replace with real ArXiv ID
    description: 'Test ArXiv HTML extraction with structured academic content'
  },
  {
    name: 'Generic Article - Tech News',
    type: 'article',
    input: 'https://techcrunch.com/2025/01/15/some-tech-article/', // Replace with real URL
    description: 'Test generic article extraction from tech news site'
  }
];

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

/**
 * Test ArXiv extraction with a specific model
 */
async function testArxivExtraction(arxivId: string, model: 'gemini-2.5-pro' | 'gemini-2.5-flash'): Promise<TestResult> {
  const startTime = Date.now();
  const url = `https://arxiv.org/html/${arxivId}`;

  try {
    // Fetch HTML
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ArXiv HTML: ${response.status}`);
    }

    const html = await response.text();
    const htmlChunk = html.substring(0, 200000); // Limit for testing

    // Prompt (same as production)
    const prompt = `You are an academic paper extraction expert. Analyze this ArXiv HTML paper.

IMPORTANT INSTRUCTIONS:
1. Extract complete paper content with all sections and subsections
2. Preserve hierarchical structure (use ## for sections, ### for subsections)
3. Keep all citations in [1], [2] format intact
4. Preserve figure captions (e.g., "Figure 1: Description")
5. Remove navigation elements, headers, footers, and other page artifacts
6. Clean up the content but preserve academic formatting
7. Extract metadata: title, authors with affiliations, abstract, dates
8. Generate 8-12 key technical terms (focus on the paper's main contributions/topics)
9. Generate a concise 1-2 sentence summary (under 200 chars, no line breaks)

CRITICAL JSON REQUIREMENTS:
- Escape all special characters in strings (use \\" for quotes, \\n for newlines)
- Do NOT include any text outside the JSON object
- Ensure all JSON strings are properly closed with quotes
- Verify all commas and braces are balanced
- Test that the JSON is valid before returning

Return ONLY valid JSON in this exact format:
{
  "title": "Paper title",
  "abstract": "Full abstract text",
  "content": "Complete paper content with ## Section headers and ### Subsection headers. Preserve citations [1] and figure captions.",
  "authors": [{"name": "John Doe", "affiliation": "University Name"}],
  "arxivId": "${arxivId}",
  "doi": "10.xxxx/xxxxx (if available)",
  "published": "2024-05-15 (if available)",
  "updated": "2024-06-01 (if available)",
  "summary": "Brief intelligent summary here",
  "key_terms": "term1, term2, term3, term4, term5, term6, term7, term8"
}

HTML to analyze:
${htmlChunk}`;

    // Call Gemini API
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: model === 'gemini-2.5-pro' ? 65536 : 32768,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    const duration = Date.now() - startTime;

    if (!geminiResponse.ok) {
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();
    const extractedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    const outputTokens = geminiData.usageMetadata?.candidatesTokenCount;

    if (!extractedText) {
      throw new Error('No response from Gemini API');
    }

    // Try to parse JSON
    let jsonValid = false;
    let jsonParseError: string | undefined;
    let paperData: any;

    try {
      // Clean potential markdown wrapping
      const cleanedText = extractedText
        .replace(/^```json\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

      paperData = JSON.parse(cleanedText);
      jsonValid = true;
    } catch (error) {
      jsonParseError = error instanceof Error ? error.message : 'Unknown error';
      jsonValid = false;
    }

    // Evaluate content quality
    const contentQuality = {
      hasTitle: !!(paperData?.title && paperData.title.length > 0),
      hasAbstract: !!(paperData?.abstract && paperData.abstract.length > 0),
      hasContent: !!(paperData?.content && paperData.content.length > 0),
      contentLength: paperData?.content?.length || 0,
      hasSummary: !!(paperData?.summary && paperData.summary.length > 0),
      hasKeyTerms: !!(paperData?.key_terms && paperData.key_terms.length > 0),
      hasMetadata: !!(paperData?.authors && Array.isArray(paperData.authors) && paperData.authors.length > 0)
    };

    return {
      model,
      testCase: 'ArXiv HTML',
      success: jsonValid,
      duration,
      outputTokens,
      jsonValid,
      jsonParseError,
      contentQuality,
      rawResponse: extractedText.substring(0, 500) // First 500 chars for debugging
    };

  } catch (error) {
    return {
      model,
      testCase: 'ArXiv HTML',
      success: false,
      duration: Date.now() - startTime,
      jsonValid: false,
      jsonParseError: error instanceof Error ? error.message : 'Unknown error',
      contentQuality: {
        hasTitle: false,
        hasAbstract: false,
        hasContent: false,
        contentLength: 0,
        hasSummary: false,
        hasKeyTerms: false,
        hasMetadata: false
      }
    };
  }
}

/**
 * Test generic article extraction with a specific model
 */
async function testArticleExtraction(url: string, model: 'gemini-2.5-pro' | 'gemini-2.5-flash'): Promise<TestResult> {
  const startTime = Date.now();

  try {
    const prompt = `You are an article extraction expert. Analyze this web URL and extract the complete article content.

IMPORTANT INSTRUCTIONS:
1. Extract the article title, author(s), publication date, and main content
2. Preserve article structure with sections and subsections
3. Use ## for main sections and ### for subsections
4. Remove navigation elements, ads, cookie notices, and other page artifacts
5. Clean the content but preserve article formatting and links
6. Generate 8-12 key technical terms related to the article's main topics
7. Generate a concise 1-2 sentence summary (under 200 chars, no line breaks)

Return ONLY valid JSON in this exact format:
{
  "title": "Article title",
  "abstract": "Article summary/lead paragraph (if available)",
  "content": "Complete article content with ## Section headers and ### Subsection headers",
  "authors": [{"name": "Author Name", "affiliation": "Publication or org"}],
  "published": "2024-05-15 (if available)",
  "updated": "2024-06-01 (if available)",
  "summary": "Brief intelligent summary here",
  "key_terms": "term1, term2, term3, term4, term5, term6, term7, term8"
}

URL to analyze: ${url}`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: model === 'gemini-2.5-pro' ? 65536 : 32768,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    const duration = Date.now() - startTime;

    if (!geminiResponse.ok) {
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();
    const extractedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    const outputTokens = geminiData.usageMetadata?.candidatesTokenCount;

    if (!extractedText) {
      throw new Error('No response from Gemini API');
    }

    // Try to parse JSON
    let jsonValid = false;
    let jsonParseError: string | undefined;
    let articleData: any;

    try {
      articleData = JSON.parse(extractedText);
      jsonValid = true;
    } catch (error) {
      jsonParseError = error instanceof Error ? error.message : 'Unknown error';
      jsonValid = false;
    }

    // Evaluate content quality
    const contentQuality = {
      hasTitle: !!(articleData?.title && articleData.title.length > 0),
      hasAbstract: !!(articleData?.abstract && articleData.abstract.length > 0),
      hasContent: !!(articleData?.content && articleData.content.length > 0),
      contentLength: articleData?.content?.length || 0,
      hasSummary: !!(articleData?.summary && articleData.summary.length > 0),
      hasKeyTerms: !!(articleData?.key_terms && articleData.key_terms.length > 0),
      hasMetadata: !!(articleData?.authors && Array.isArray(articleData.authors))
    };

    return {
      model,
      testCase: 'Generic Article',
      success: jsonValid,
      duration,
      outputTokens,
      jsonValid,
      jsonParseError,
      contentQuality,
      rawResponse: extractedText.substring(0, 500)
    };

  } catch (error) {
    return {
      model,
      testCase: 'Generic Article',
      success: false,
      duration: Date.now() - startTime,
      jsonValid: false,
      jsonParseError: error instanceof Error ? error.message : 'Unknown error',
      contentQuality: {
        hasTitle: false,
        hasAbstract: false,
        hasContent: false,
        contentLength: 0,
        hasSummary: false,
        hasKeyTerms: false,
        hasMetadata: false
      }
    };
  }
}

/**
 * Print comparison table
 */
function printComparison(results: TestResult[]) {
  console.log('\n' + '='.repeat(120));
  console.log('GEMINI 2.5 PRO vs FLASH - COMPARISON RESULTS');
  console.log('='.repeat(120));

  // Group by test case
  const testCases = [...new Set(results.map(r => r.testCase))];

  for (const testCase of testCases) {
    console.log(`\n📋 ${testCase}`);
    console.log('-'.repeat(120));

    const caseResults = results.filter(r => r.testCase === testCase);

    for (const result of caseResults) {
      console.log(`\n🤖 Model: ${result.model}`);
      console.log(`   Success: ${result.success ? '✅' : '❌'}`);
      console.log(`   Duration: ${result.duration}ms`);
      console.log(`   Output Tokens: ${result.outputTokens || 'N/A'}`);
      console.log(`   JSON Valid: ${result.jsonValid ? '✅' : '❌'}`);

      if (result.jsonParseError) {
        console.log(`   JSON Error: ${result.jsonParseError}`);
      }

      console.log(`   Content Quality:`);
      console.log(`      - Title: ${result.contentQuality.hasTitle ? '✅' : '❌'}`);
      console.log(`      - Abstract: ${result.contentQuality.hasAbstract ? '✅' : '❌'}`);
      console.log(`      - Content: ${result.contentQuality.hasContent ? '✅' : '❌'} (${result.contentQuality.contentLength.toLocaleString()} chars)`);
      console.log(`      - Summary: ${result.contentQuality.hasSummary ? '✅' : '❌'}`);
      console.log(`      - Key Terms: ${result.contentQuality.hasKeyTerms ? '✅' : '❌'}`);
      console.log(`      - Metadata: ${result.contentQuality.hasMetadata ? '✅' : '❌'}`);

      if (result.rawResponse) {
        console.log(`   Raw Response (first 500 chars):`);
        console.log(`      ${result.rawResponse.substring(0, 200)}...`);
      }
    }
  }

  console.log('\n' + '='.repeat(120));
  console.log('SUMMARY');
  console.log('='.repeat(120));

  const proResults = results.filter(r => r.model === 'gemini-2.5-pro');
  const flashResults = results.filter(r => r.model === 'gemini-2.5-flash');

  const proSuccess = proResults.filter(r => r.success).length;
  const flashSuccess = flashResults.filter(r => r.success).length;

  const proAvgDuration = proResults.reduce((sum, r) => sum + r.duration, 0) / proResults.length;
  const flashAvgDuration = flashResults.reduce((sum, r) => sum + r.duration, 0) / flashResults.length;

  const proAvgTokens = proResults.reduce((sum, r) => sum + (r.outputTokens || 0), 0) / proResults.length;
  const flashAvgTokens = flashResults.reduce((sum, r) => sum + (r.outputTokens || 0), 0) / flashResults.length;

  console.log(`\nGemini 2.5 Pro:`);
  console.log(`   Success Rate: ${proSuccess}/${proResults.length} (${((proSuccess / proResults.length) * 100).toFixed(1)}%)`);
  console.log(`   Avg Duration: ${proAvgDuration.toFixed(0)}ms`);
  console.log(`   Avg Tokens: ${proAvgTokens.toFixed(0)}`);

  console.log(`\nGemini 2.5 Flash:`);
  console.log(`   Success Rate: ${flashSuccess}/${flashResults.length} (${((flashSuccess / flashResults.length) * 100).toFixed(1)}%)`);
  console.log(`   Avg Duration: ${flashAvgDuration.toFixed(0)}ms (${((flashAvgDuration / proAvgDuration) * 100).toFixed(0)}% of Pro)`);
  console.log(`   Avg Tokens: ${flashAvgTokens.toFixed(0)} (${((flashAvgTokens / proAvgTokens) * 100).toFixed(0)}% of Pro)`);

  console.log('\n' + '='.repeat(120));
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('🧪 Starting Gemini Model Comparison Tests...\n');

  if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not found in environment');
    process.exit(1);
  }

  const results: TestResult[] = [];

  // Test 1: ArXiv HTML extraction
  console.log('📄 Test 1: ArXiv HTML Extraction');
  console.log('   Testing with ArXiv ID: 2410.01131 (recent paper)');

  const arxivId = '2410.01131';
  console.log('\n   Testing with Gemini 2.5 Pro...');
  const arxivProResult = await testArxivExtraction(arxivId, 'gemini-2.5-pro');
  results.push(arxivProResult);

  console.log('   Testing with Gemini 2.5 Flash...');
  const arxivFlashResult = await testArxivExtraction(arxivId, 'gemini-2.5-flash');
  results.push(arxivFlashResult);

  // Test 2: Generic article extraction (using a stable tech article)
  console.log('\n📰 Test 2: Generic Article Extraction');
  console.log('   Testing with URL: https://www.anthropic.com/news/claude-3-5-sonnet');

  const articleUrl = 'https://www.anthropic.com/news/claude-3-5-sonnet';
  console.log('\n   Testing with Gemini 2.5 Pro...');
  const articleProResult = await testArticleExtraction(articleUrl, 'gemini-2.5-pro');
  results.push(articleProResult);

  console.log('   Testing with Gemini 2.5 Flash...');
  const articleFlashResult = await testArticleExtraction(articleUrl, 'gemini-2.5-flash');
  results.push(articleFlashResult);

  // Print comparison
  printComparison(results);

  // Recommendations
  console.log('\n💡 RECOMMENDATIONS');
  console.log('='.repeat(120));

  const allFlashSucceeded = flashResults.every(r => r.success && r.jsonValid);
  const flashFasterThanPro = flashAvgDuration < proAvgDuration;

  if (allFlashSucceeded && flashFasterThanPro) {
    console.log('✅ RECOMMENDED: Switch to Gemini 2.5 Flash for these extraction tasks');
    console.log('   - Flash produced valid JSON in all tests');
    console.log(`   - Flash is ${((proAvgDuration / flashAvgDuration).toFixed(1))}x faster than Pro`);
    console.log('   - Cost savings: Flash is significantly cheaper than Pro');
  } else if (!allFlashSucceeded) {
    console.log('⚠️  CAUTION: Keep using Gemini 2.5 Pro for now');
    console.log('   - Flash had JSON formatting issues in some tests');
    console.log('   - Reliability is more important than speed for production');
  } else {
    console.log('🤔 MIXED RESULTS: Evaluate based on your priorities');
    console.log('   - Flash produces valid output but may have quality differences');
    console.log('   - Consider A/B testing in production with monitoring');
  }

  console.log('='.repeat(120));
}

// Run tests
runTests().catch(console.error);
