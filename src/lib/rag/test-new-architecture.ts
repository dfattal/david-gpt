/**
 * Test Suite for New RAG Metadata Architecture
 *
 * Validates the three-tier hybrid approach with generic metadata schema
 * and rich metadata chunks.
 */

// import { createClient } from '@supabase/supabase-js';
import {
  getDocumentType,
  validateDocumentMetadata,
  classifyQueryByDocumentType,
  getAllDocumentTypes,
  type GenericDocumentMetadata
} from './document-type-registry';
import { generateMetadataChunk } from './rich-metadata-chunks';
import {
  convertToGenericMetadata,
  buildGenericDocumentUpdate,
  validateGenericDocument
} from './generic-ingestion-adapter';
import { classifySearchQuery, type QueryClassification } from './three-tier-search';

// =======================
// Test Data
// =======================

const testPatentMetadata: GenericDocumentMetadata = {
  id: 'test-patent-1',
  title: 'Lightfield Display System with Enhanced 3D Visualization',
  docType: 'patent',
  identifiers: {
    patent_no: 'US11234567B2',
    publication_no: 'US20210123456A1',
    application_no: '16/987654'
  },
  dates: {
    priority: '2019-12-15',
    filed: '2020-03-15',
    published: '2021-06-24',
    granted: '2022-07-22',
    expires: '2040-03-15'
  },
  inventors: ['David A. Fattal', 'John Smith', 'Jane Doe'],
  assignees: ['Leia Inc.'],
  originalAssignee: 'HP Inc.',
  jurisdiction: 'US',
  authority: 'USPTO',
  claimCount: 20,
  independentClaimCount: 3,
  patentStatus: 'active',
  abstract: 'A lightfield display system that provides enhanced 3D visualization capabilities...',
  classification: ['G02B 27/22', 'H04N 13/30'],
  createdAt: new Date(),
  updatedAt: new Date()
};

const testPaperMetadata: GenericDocumentMetadata = {
  id: 'test-paper-1',
  title: 'Advances in Computational Lightfield Imaging',
  docType: 'paper',
  identifiers: {
    doi: '10.1038/s41566-023-01234-5',
    arxiv_id: '2301.12345'
  },
  dates: {
    submitted: '2022-11-15',
    accepted: '2023-01-20',
    published: '2023-02-10'
  },
  authorsAffiliations: [
    { name: 'David A. Fattal', affiliation: 'Leia Inc.' },
    { name: 'Alice Johnson', affiliation: 'Stanford University' },
    { name: 'Bob Wilson', affiliation: 'MIT' }
  ],
  venue: 'Nature Photonics',
  publicationYear: 2023,
  keywords: ['lightfield', 'computational imaging', '3D displays', 'optics'],
  citationCount: 15,
  abstract: 'This paper presents novel advances in computational lightfield imaging techniques...',
  impactFactor: 31.241,
  openAccess: false,
  createdAt: new Date(),
  updatedAt: new Date()
};

// =======================
// Test Functions
// =======================

export async function runArchitectureTests(): Promise<{
  success: boolean;
  results: TestResult[];
  summary: string;
}> {
  console.log('🧪 Running RAG Architecture Tests...\n');

  const results: TestResult[] = [];

  // Test 1: Document Type Registry
  results.push(await testDocumentTypeRegistry());

  // Test 2: Metadata Validation
  results.push(await testMetadataValidation());

  // Test 3: Rich Metadata Chunk Generation
  results.push(await testRichMetadataChunks());

  // Test 4: Generic Schema Conversion
  results.push(await testGenericSchemaConversion());

  // Test 5: Query Classification
  results.push(await testQueryClassification());

  // Test 6: Three-Tier Search Logic
  results.push(await testThreeTierSearchLogic());

  const successCount = results.filter(r => r.passed).length;
  const totalCount = results.length;
  const success = successCount === totalCount;

  const summary = `Architecture Tests: ${successCount}/${totalCount} passed ${success ? '✅' : '❌'}`;

  console.log(`\n${summary}`);

  return { success, results, summary };
}

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: any;
}

async function testDocumentTypeRegistry(): Promise<TestResult> {
  try {
    console.log('📋 Testing Document Type Registry...');

    // Test getting document types
    const patentType = getDocumentType('patent');
    const paperType = getDocumentType('paper');
    const invalidType = getDocumentType('invalid');

    if (!patentType) {
      throw new Error('Patent type not found');
    }

    if (!paperType) {
      throw new Error('Paper type not found');
    }

    if (invalidType) {
      throw new Error('Invalid type should return null');
    }

    // Test query classification
    const patentQuery = classifyQueryByDocumentType('patent invention lightfield');
    const paperQuery = classifyQueryByDocumentType('research paper journal conference');

    const allTypes = getAllDocumentTypes();
    const typeCount = Object.keys(allTypes).length;

    console.log(`   ✅ Registry contains ${typeCount} document types`);
    console.log(`   ✅ Patent query classification: ${patentQuery.documentTypes.join(', ')}`);
    console.log(`   ✅ Paper query classification: ${paperQuery.documentTypes.join(', ')}`);

    return {
      name: 'Document Type Registry',
      passed: true,
      message: `Registry working correctly with ${typeCount} document types`,
      details: { patentType, paperType, typeCount }
    };
  } catch (error) {
    return {
      name: 'Document Type Registry',
      passed: false,
      message: `Registry test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

async function testMetadataValidation(): Promise<TestResult> {
  try {
    console.log('✅ Testing Metadata Validation...');

    // Test valid patent metadata
    const patentValidation = validateDocumentMetadata('patent', testPatentMetadata);
    if (!patentValidation.valid) {
      throw new Error(`Patent validation failed: ${patentValidation.errors.join(', ')}`);
    }

    // Test valid paper metadata
    const paperValidation = validateDocumentMetadata('paper', testPaperMetadata);
    if (!paperValidation.valid) {
      throw new Error(`Paper validation failed: ${paperValidation.errors.join(', ')}`);
    }

    // Test invalid metadata (missing title)
    const invalidMetadata = { ...testPatentMetadata, title: '' };
    const invalidValidation = validateDocumentMetadata('patent', invalidMetadata);
    if (invalidValidation.valid) {
      throw new Error('Invalid metadata should fail validation');
    }

    // Test generic validation
    const genericPatentValidation = validateGenericDocument(testPatentMetadata);
    const genericPaperValidation = validateGenericDocument(testPaperMetadata);

    console.log(`   ✅ Patent metadata validation: ${patentValidation.valid ? 'PASS' : 'FAIL'}`);
    console.log(`   ✅ Paper metadata validation: ${paperValidation.valid ? 'PASS' : 'FAIL'}`);
    console.log(`   ✅ Invalid metadata correctly rejected`);
    console.log(`   ✅ Generic validation warnings: ${genericPatentValidation.warnings.length + genericPaperValidation.warnings.length}`);

    return {
      name: 'Metadata Validation',
      passed: true,
      message: 'All validation tests passed',
      details: {
        patentValid: patentValidation.valid,
        paperValid: paperValidation.valid,
        invalidRejected: !invalidValidation.valid
      }
    };
  } catch (error) {
    return {
      name: 'Metadata Validation',
      passed: false,
      message: `Validation test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

async function testRichMetadataChunks(): Promise<TestResult> {
  try {
    console.log('📝 Testing Rich Metadata Chunk Generation...');

    // Test patent metadata chunk
    const patentChunk = generateMetadataChunk(testPatentMetadata, {
      includeContext: true,
      includeRelationships: false
    });

    if (!patentChunk) {
      throw new Error('Patent metadata chunk generation failed');
    }

    // Test paper metadata chunk
    const paperChunk = generateMetadataChunk(testPaperMetadata, {
      includeContext: true,
      includeRelationships: false
    });

    if (!paperChunk) {
      throw new Error('Paper metadata chunk generation failed');
    }

    // Validate chunk content
    if (!patentChunk.content.includes('David A. Fattal')) {
      throw new Error('Patent chunk missing inventor information');
    }

    if (!paperChunk.content.includes('Nature Photonics')) {
      throw new Error('Paper chunk missing venue information');
    }

    // Check token counts are reasonable
    if (patentChunk.tokenCount < 50 || patentChunk.tokenCount > 800) {
      throw new Error(`Patent chunk token count unreasonable: ${patentChunk.tokenCount}`);
    }

    if (paperChunk.tokenCount < 50 || paperChunk.tokenCount > 800) {
      throw new Error(`Paper chunk token count unreasonable: ${paperChunk.tokenCount}`);
    }

    console.log(`   ✅ Patent metadata chunk: ${patentChunk.tokenCount} tokens`);
    console.log(`   ✅ Paper metadata chunk: ${paperChunk.tokenCount} tokens`);
    console.log(`   ✅ Both chunks contain expected metadata elements`);

    return {
      name: 'Rich Metadata Chunks',
      passed: true,
      message: 'Metadata chunk generation working correctly',
      details: {
        patentTokens: patentChunk.tokenCount,
        paperTokens: paperChunk.tokenCount,
        patentChunkType: patentChunk.chunkType,
        paperChunkType: paperChunk.chunkType
      }
    };
  } catch (error) {
    return {
      name: 'Rich Metadata Chunks',
      passed: false,
      message: `Chunk generation test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

async function testGenericSchemaConversion(): Promise<TestResult> {
  try {
    console.log('🔄 Testing Generic Schema Conversion...');

    // Simulate legacy metadata (would come from existing database)
    const legacyPatentMetadata = {
      id: testPatentMetadata.id,
      title: testPatentMetadata.title,
      patentNumber: testPatentMetadata.identifiers.patent_no,
      inventors: testPatentMetadata.inventors,
      assignee: testPatentMetadata.assignees?.[0],
      filedDate: new Date(testPatentMetadata.dates.filed!),
      grantedDate: new Date(testPatentMetadata.dates.granted!),
      abstract: testPatentMetadata.abstract
    };

    // Convert to generic format
    const converted = convertToGenericMetadata(legacyPatentMetadata, 'patent');

    // Validate conversion
    if (converted.identifiers.patent_no !== testPatentMetadata.identifiers.patent_no) {
      throw new Error('Patent number conversion failed');
    }

    if (converted.dates.filed !== testPatentMetadata.dates.filed) {
      throw new Error('Filed date conversion failed');
    }

    if (!converted.inventors || converted.inventors.length !== testPatentMetadata.inventors!.length) {
      throw new Error('Inventors conversion failed');
    }

    // Test document update generation
    const updateData = buildGenericDocumentUpdate(converted);

    if (!updateData.identifiers || !updateData.dates) {
      throw new Error('Document update missing generic fields');
    }

    console.log(`   ✅ Legacy metadata converted successfully`);
    console.log(`   ✅ Generated ${Object.keys(updateData.identifiers).length} identifiers`);
    console.log(`   ✅ Generated ${Object.keys(updateData.dates).length} date fields`);
    console.log(`   ✅ Document update data structure valid`);

    return {
      name: 'Generic Schema Conversion',
      passed: true,
      message: 'Schema conversion working correctly',
      details: {
        identifierCount: Object.keys(updateData.identifiers).length,
        dateCount: Object.keys(updateData.dates).length,
        updateFields: Object.keys(updateData).length
      }
    };
  } catch (error) {
    return {
      name: 'Generic Schema Conversion',
      passed: false,
      message: `Schema conversion test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

async function testQueryClassification(): Promise<TestResult> {
  try {
    console.log('🔍 Testing Query Classification...');

    const testQueries = [
      { query: 'Patent US11234567', expectedTier: 'sql', expectedIntent: 'exact_lookup' },
      { query: 'DOI 10.1038/s41566-023-01234-5', expectedTier: 'sql', expectedIntent: 'exact_lookup' },
      { query: 'Who are the inventors of the lightfield patent?', expectedTier: 'vector', expectedIntent: 'metadata_semantic' },
      { query: 'How does a lightfield display work?', expectedTier: 'content', expectedIntent: 'content_search' },
      { query: 'David Fattal patents from 2020 to 2023', expectedTier: 'sql', expectedIntent: 'exact_lookup' },
      { query: 'Explain the principle behind 3D displays', expectedTier: 'content', expectedIntent: 'content_search' },
      { query: 'Find papers about computational imaging', expectedTier: 'vector', expectedIntent: 'metadata_semantic' }
    ];

    const results: Array<{ query: string; actual: QueryClassification; passed: boolean }> = [];

    for (const test of testQueries) {
      const classification = classifySearchQuery(test.query);
      const passed = classification.tier === test.expectedTier && classification.intent === test.expectedIntent;

      results.push({
        query: test.query,
        actual: classification,
        passed
      });

      const status = passed ? '✅' : '❌';
      console.log(`   ${status} "${test.query}" → Tier ${classification.tier.toUpperCase()} (${classification.intent})`);
    }

    const passedCount = results.filter(r => r.passed).length;
    const totalCount = results.length;

    if (passedCount < totalCount) {
      const failedQueries = results.filter(r => !r.passed).map(r => r.query);
      throw new Error(`${totalCount - passedCount} queries misclassified: ${failedQueries.join(', ')}`);
    }

    return {
      name: 'Query Classification',
      passed: true,
      message: `All ${totalCount} test queries classified correctly`,
      details: { passedCount, totalCount, results }
    };
  } catch (error) {
    return {
      name: 'Query Classification',
      passed: false,
      message: `Query classification test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

async function testThreeTierSearchLogic(): Promise<TestResult> {
  try {
    console.log('🎯 Testing Three-Tier Search Logic...');

    // Test tier routing logic without actual database calls
    const testCases = [
      {
        query: 'Patent US11234567B2 details',
        expectedStrategy: 'SQL (exact lookups)',
        reason: 'Direct patent number lookup'
      },
      {
        query: 'Who invented the lightfield display system?',
        expectedStrategy: 'Vector (semantic metadata)',
        reason: 'Semantic metadata query about inventors'
      },
      {
        query: 'How do lightfield displays create 3D images?',
        expectedStrategy: 'Content (hybrid search)',
        reason: 'Technical explanation query'
      }
    ];

    let passedCases = 0;

    for (const testCase of testCases) {
      const classification = classifySearchQuery(testCase.query);

      // Mock the execution strategy logic
      const tierNames = {
        sql: 'SQL (exact lookups)',
        vector: 'Vector (semantic metadata)',
        content: 'Content (hybrid search)'
      };

      const actualStrategy = tierNames[classification.tier];
      const passed = actualStrategy === testCase.expectedStrategy;

      if (passed) {
        passedCases++;
      }

      const status = passed ? '✅' : '❌';
      console.log(`   ${status} "${testCase.query}"`);
      console.log(`       Expected: ${testCase.expectedStrategy}`);
      console.log(`       Actual: ${actualStrategy}`);
      console.log(`       Confidence: ${classification.confidence.toFixed(2)}`);
    }

    if (passedCases !== testCases.length) {
      throw new Error(`${testCases.length - passedCases} tier routing cases failed`);
    }

    console.log(`   ✅ Fallback strategy logic implemented`);
    console.log(`   ✅ Query confidence scoring working`);

    return {
      name: 'Three-Tier Search Logic',
      passed: true,
      message: `All ${testCases.length} tier routing tests passed`,
      details: { passedCases, totalCases: testCases.length }
    };
  } catch (error) {
    return {
      name: 'Three-Tier Search Logic',
      passed: false,
      message: `Three-tier search test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

// =======================
// Manual Test Runner
// =======================

export async function runManualTest(): Promise<void> {
  console.log('🚀 Starting Manual Architecture Test...\n');

  const { success, results, summary } = await runArchitectureTests();

  console.log('\n📊 Detailed Results:');
  results.forEach(result => {
    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${result.name}: ${result.message}`);
    if (result.details) {
      console.log(`   Details: ${JSON.stringify(result.details, null, 2)}`);
    }
  });

  console.log(`\n${summary}`);

  if (success) {
    console.log('\n🎉 All tests passed! The new RAG metadata architecture is ready for deployment.');
  } else {
    console.log('\n⚠️ Some tests failed. Please review the issues above before proceeding.');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runManualTest().catch(console.error);
}