#!/usr/bin/env tsx

/**
 * CLI Script for Running KG-RAG Quality Tests
 *
 * Usage:
 *   npm run test:kg-quality                    # Run all tests
 *   npm run test:kg-quality -- --smoke        # Run smoke test only
 *   npm run test:kg-quality -- --persona=financial  # Test specific persona
 *   npm run test:kg-quality -- --help         # Show help
 */

import { createClient } from '@supabase/supabase-js';
import { runAllQualityTests, runQuickSmokeTest, createTestRunner } from '../lib/rag/tests/comprehensive-test-runner';
import type { TestConfiguration } from '../lib/rag/tests/comprehensive-test-runner';

// =======================
// CLI Configuration
// =======================

interface CLIOptions {
  smoke: boolean;
  persona: string;
  verbose: boolean;
  help: boolean;
  output?: string;
  include?: string[];
  exclude?: string[];
}

// =======================
// Main CLI Function
// =======================

async function main() {
  try {
    const options = parseArgs();

    if (options.help) {
      printHelp();
      process.exit(0);
    }

    console.log('🧪 KG-RAG Quality Testing CLI');
    console.log('==============================');

    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing Supabase configuration. Please check your environment variables.');
      console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
      process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify database connection
    console.log('🔌 Verifying database connection...');
    const { data, error } = await supabase.from('documents').select('id').limit(1);
    if (error) {
      console.error('❌ Database connection failed:', error.message);
      process.exit(1);
    }
    console.log('✅ Database connection successful');

    // Run tests based on options
    if (options.smoke) {
      console.log('\n💨 Running smoke test...');
      const result = await runQuickSmokeTest(supabase, options.persona);
      console.log('\n✅ Smoke test completed successfully!');

      if (options.output) {
        await saveResults(result, options.output);
      }
    } else {
      console.log('\n🚀 Running comprehensive quality tests...');

      if (options.include || options.exclude) {
        // Run with custom configuration
        const config = buildCustomConfiguration(options);
        const runner = createTestRunner(supabase);
        const result = await runner.runTestsWithConfiguration(config);

        console.log('\n✅ Custom test suite completed successfully!');

        if (options.output) {
          await saveResults(result, options.output);
        }
      } else {
        // Run all tests
        const result = await runAllQualityTests(supabase, options.persona);
        console.log('\n✅ Comprehensive testing completed successfully!');

        if (options.output) {
          await saveResults(result, options.output);
        }
      }
    }

  } catch (error) {
    console.error('\n❌ Test execution failed:', error);
    process.exit(1);
  }
}

// =======================
// Helper Functions
// =======================

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    smoke: false,
    persona: 'david',
    verbose: true,
    help: false
  };

  for (const arg of args) {
    if (arg === '--smoke') {
      options.smoke = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--quiet' || arg === '-q') {
      options.verbose = false;
    } else if (arg.startsWith('--persona=')) {
      options.persona = arg.split('=')[1];
    } else if (arg.startsWith('--output=')) {
      options.output = arg.split('=')[1];
    } else if (arg.startsWith('--include=')) {
      options.include = arg.split('=')[1].split(',');
    } else if (arg.startsWith('--exclude=')) {
      options.exclude = arg.split('=')[1].split(',');
    }
  }

  return options;
}

function buildCustomConfiguration(options: CLIOptions): TestConfiguration {
  const config: TestConfiguration = {
    testName: 'Custom CLI Test Suite',
    personaId: options.persona,
    includeConversationTests: true,
    includeKGQualityTests: true,
    includeCitationTests: true,
    includeABTests: true,
    includePerformanceTests: true,
    includeLoadTests: false,
    testQueries: [
      'Who invented lightfield displays?',
      'How do 3D displays work?',
      'Patents by David Fattal',
      'Leia Inc technology'
    ],
    abTestSampleSize: 4,
    loadTestDuration: 60,
    verbose: options.verbose
  };

  // Apply include/exclude filters
  if (options.include) {
    config.includeConversationTests = options.include.includes('conversations');
    config.includeKGQualityTests = options.include.includes('kg-quality');
    config.includeCitationTests = options.include.includes('citations');
    config.includeABTests = options.include.includes('ab-tests');
    config.includePerformanceTests = options.include.includes('performance');
    config.includeLoadTests = options.include.includes('load-tests');
  }

  if (options.exclude) {
    if (options.exclude.includes('conversations')) config.includeConversationTests = false;
    if (options.exclude.includes('kg-quality')) config.includeKGQualityTests = false;
    if (options.exclude.includes('citations')) config.includeCitationTests = false;
    if (options.exclude.includes('ab-tests')) config.includeABTests = false;
    if (options.exclude.includes('performance')) config.includePerformanceTests = false;
    if (options.exclude.includes('load-tests')) config.includeLoadTests = false;
  }

  return config;
}

async function saveResults(result: any, outputPath: string): Promise<void> {
  try {
    const fs = await import('fs');
    const path = await import('path');

    const fullPath = path.resolve(outputPath);
    const content = JSON.stringify(result, null, 2);

    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`💾 Results saved to: ${fullPath}`);
  } catch (error) {
    console.warn(`⚠️ Failed to save results to ${outputPath}:`, error);
  }
}

function printHelp(): void {
  console.log(`
🧪 KG-RAG Quality Testing CLI

USAGE:
  npm run test:kg-quality [OPTIONS]

OPTIONS:
  --smoke                     Run quick smoke test only
  --persona=PERSONA_ID        Test specific persona (default: david)
  --output=FILE               Save results to JSON file
  --include=TESTS             Include only specific test types (comma-separated)
  --exclude=TESTS             Exclude specific test types (comma-separated)
  --quiet, -q                 Reduce output verbosity
  --help, -h                  Show this help message

TEST TYPES:
  conversations               Conversation-based tests
  kg-quality                  Knowledge graph quality evaluation
  citations                   Citation accuracy validation
  ab-tests                    A/B testing (KG enabled vs disabled)
  performance                 Performance benchmarking
  load-tests                  Load testing

EXAMPLES:
  npm run test:kg-quality
    Run all tests with default settings

  npm run test:kg-quality -- --smoke
    Run quick smoke test

  npm run test:kg-quality -- --persona=financial --output=results.json
    Test financial persona and save results

  npm run test:kg-quality -- --include=kg-quality,citations
    Run only KG quality and citation tests

  npm run test:kg-quality -- --exclude=load-tests,performance
    Run all tests except load and performance tests

ENVIRONMENT VARIABLES:
  NEXT_PUBLIC_SUPABASE_URL      Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY     Supabase service role key
`);
}

// =======================
// Execute CLI
// =======================

if (require.main === module) {
  main().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}

export { main as runKGQualityTestsCLI };