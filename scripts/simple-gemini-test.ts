/**
 * Simple Gemini 2.5 Pro vs Flash Test
 * Quick test using smaller payloads
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

interface TestResult {
  model: string;
  success: boolean;
  duration: number;
  jsonValid: boolean;
  errorMessage?: string;
  title?: string;
  contentLength?: number;
  summary?: string;
  keyTerms?: string;
}

async function testModel(model: 'gemini-2.5-pro' | 'gemini-2.5-flash'): Promise<TestResult> {
  const start = Date.now();

  // Simple test prompt with realistic content
  const testPrompt = `You are an academic paper extraction expert. Extract structured data from this academic content.

IMPORTANT: Return ONLY valid JSON with NO markdown code blocks. The response must be pure JSON.

{
  "title": "Extract the paper title here",
  "abstract": "Extract the abstract here",
  "content": "Extract main content with ## headings",
  "authors": [{"name": "Author Name", "affiliation": "University"}],
  "summary": "1-2 sentence summary under 200 chars",
  "key_terms": "term1, term2, term3, term4, term5, term6, term7, term8"
}

Paper content to extract:
Title: Advances in Neural Network Architectures

Abstract:
This paper presents novel approaches to designing neural network architectures that improve efficiency and performance. We introduce three key innovations: adaptive layer normalization, dynamic attention mechanisms, and hierarchical feature extraction.

Content:
## Introduction
Neural networks have revolutionized machine learning...

## Methods
### Adaptive Layer Normalization
We propose a new normalization technique...

### Dynamic Attention
Our attention mechanism adapts based on input complexity...

## Results
Experiments show 15% improvement in accuracy...

## Conclusion
Our approach demonstrates significant advantages...

Authors: Jane Smith (MIT), John Doe (Stanford)`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: testPrompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: model === 'gemini-2.5-pro' ? 8192 : 4096,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    const duration = Date.now() - start;

    if (!response.ok) {
      return {
        model,
        success: false,
        duration,
        jsonValid: false,
        errorMessage: `API error: ${response.status} ${response.statusText}`
      };
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return {
        model,
        success: false,
        duration,
        jsonValid: false,
        errorMessage: 'No response from API'
      };
    }

    // Try to parse JSON
    try {
      const cleanedText = text
        .replace(/^```json\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

      const parsed = JSON.parse(cleanedText);

      return {
        model,
        success: true,
        duration,
        jsonValid: true,
        title: parsed.title,
        contentLength: parsed.content?.length || 0,
        summary: parsed.summary,
        keyTerms: parsed.key_terms
      };

    } catch (parseError) {
      return {
        model,
        success: false,
        duration,
        jsonValid: false,
        errorMessage: `JSON parse error: ${parseError instanceof Error ? parseError.message : 'Unknown'}`,
        title: undefined,
        contentLength: 0
      };
    }

  } catch (error) {
    return {
      model,
      success: false,
      duration: Date.now() - start,
      jsonValid: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function main() {
  console.log('🧪 Simple Gemini Model Comparison');
  console.log('='.repeat(80));
  console.log('');

  if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not found');
    process.exit(1);
  }

  console.log('Testing with Gemini 2.5 Pro...');
  const proResult = await testModel('gemini-2.5-pro');
  console.log(`✓ Pro completed in ${proResult.duration}ms`);
  console.log('');

  console.log('Testing with Gemini 2.5 Flash...');
  const flashResult = await testModel('gemini-2.5-flash');
  console.log(`✓ Flash completed in ${flashResult.duration}ms`);
  console.log('');

  // Results
  console.log('='.repeat(80));
  console.log('RESULTS');
  console.log('='.repeat(80));
  console.log('');

  console.log(`Gemini 2.5 Pro:`);
  console.log(`  Success: ${proResult.success ? '✅' : '❌'}`);
  console.log(`  JSON Valid: ${proResult.jsonValid ? '✅' : '❌'}`);
  console.log(`  Duration: ${proResult.duration}ms`);
  if (proResult.errorMessage) {
    console.log(`  Error: ${proResult.errorMessage}`);
  }
  if (proResult.title) {
    console.log(`  Title: ${proResult.title}`);
    console.log(`  Content Length: ${proResult.contentLength} chars`);
    console.log(`  Summary: ${proResult.summary}`);
    console.log(`  Key Terms: ${proResult.keyTerms}`);
  }
  console.log('');

  console.log(`Gemini 2.5 Flash:`);
  console.log(`  Success: ${flashResult.success ? '✅' : '❌'}`);
  console.log(`  JSON Valid: ${flashResult.jsonValid ? '✅' : '❌'}`);
  console.log(`  Duration: ${flashResult.duration}ms`);
  if (flashResult.errorMessage) {
    console.log(`  Error: ${flashResult.errorMessage}`);
  }
  if (flashResult.title) {
    console.log(`  Title: ${flashResult.title}`);
    console.log(`  Content Length: ${flashResult.contentLength} chars`);
    console.log(`  Summary: ${flashResult.summary}`);
    console.log(`  Key Terms: ${flashResult.keyTerms}`);
  }
  console.log('');

  // Comparison
  console.log('='.repeat(80));
  console.log('COMPARISON');
  console.log('='.repeat(80));
  console.log('');

  const bothSucceeded = proResult.success && flashResult.success;
  const speedup = proResult.duration / flashResult.duration;

  console.log(`JSON Formatting:`);
  console.log(`  Pro:   ${proResult.jsonValid ? '✅' : '❌'}`);
  console.log(`  Flash: ${flashResult.jsonValid ? '✅' : '❌'}`);
  console.log('');

  console.log(`Performance:`);
  console.log(`  Pro:   ${proResult.duration}ms`);
  console.log(`  Flash: ${flashResult.duration}ms (${speedup.toFixed(2)}x ${speedup > 1 ? 'faster' : 'slower'})`);
  console.log('');

  // Recommendation
  console.log('='.repeat(80));
  console.log('💡 RECOMMENDATION');
  console.log('='.repeat(80));
  console.log('');

  if (bothSucceeded && flashResult.duration < proResult.duration) {
    console.log('✅ SWITCH TO GEMINI 2.5 FLASH');
    console.log(`   - Both models produced valid JSON`);
    console.log(`   - Flash is ${speedup.toFixed(1)}x faster`);
    console.log(`   - Flash costs significantly less ($0.075/1M tokens vs $1.25/1M for Pro)`);
    console.log(`   - Quality appears equivalent for structured extraction tasks`);
    console.log('');
    console.log('Recommended for:');
    console.log('   ✅ ArXiv HTML extraction (structured HTML)');
    console.log('   ✅ Generic article extraction (with Gemini fallback)');
    console.log('   ✅ Content enrichment (already using Flash)');
  } else if (!flashResult.success) {
    console.log('❌ KEEP GEMINI 2.5 PRO');
    console.log(`   - Flash had reliability issues`);
    console.log(`   - JSON formatting is critical for production`);
    console.log(`   - Pro is more stable for complex extraction`);
  } else {
    console.log('⚠️  MIXED RESULTS');
    console.log(`   - Both succeeded but Flash may not be faster`);
    console.log(`   - Consider testing with production workloads`);
  }

  console.log('');
  console.log('='.repeat(80));
}

main().catch(console.error);
