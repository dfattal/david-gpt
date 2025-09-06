/**
 * E2E Knowledge Graph Enhancement Test Suite
 * 
 * Tests relationship-aware search, entity detection, query expansion,
 * and multi-hop traversal in the David-GPT system.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// Load environment variables from .env.local
try {
  const envFile = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
  const envVars = envFile.split('\n').filter(line => line.includes('=') && !line.startsWith('#'));
  envVars.forEach(line => {
    const equalIndex = line.indexOf('=');
    if (equalIndex > 0) {
      const key = line.slice(0, equalIndex).trim();
      const value = line.slice(equalIndex + 1).trim().replace(/^["']|["']$/g, '');
      if (key && value) {
        process.env[key] = value;
      }
    }
  });
} catch (error) {
  console.warn('Warning: Could not load .env.local file:', error);
}

import { supabaseAdmin } from '../src/lib/supabase';
import { relationshipSearchEngine } from '../src/lib/rag/relationship-search';

interface KGTestResult {
  testName: string;
  query: string;
  entitiesDetected: string[];
  relationshipsFound: any[];
  queryEnhanced: boolean;
  enhancedQuery?: string;
  resultCount: number;
  relationshipContextProvided: boolean;
  success: boolean;
  errors: string[];
  executionTime: number;
}

class KGEnhancementTester {
  private baseUrl: string;
  
  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  /**
   * Test relationship-aware search enhancement
   */
  async testRelationshipAwareSearch(
    testName: string,
    query: string
  ): Promise<KGTestResult> {
    console.log(`\n🧪 Testing KG Enhancement: ${testName}`);
    console.log(`🔍 Query: "${query}"`);

    const startTime = Date.now();
    const result: KGTestResult = {
      testName,
      query,
      entitiesDetected: [],
      relationshipsFound: [],
      queryEnhanced: false,
      resultCount: 0,
      relationshipContextProvided: false,
      success: true,
      errors: [],
      executionTime: 0
    };

    try {
      // Test direct relationship search engine
      console.log('🔗 Testing relationship search engine...');
      const relationshipResult = await relationshipSearchEngine.searchWithRelationships({
        query,
        includeRelatedEntities: true,
        maxHops: 1,
        limit: 10
      });

      result.entitiesDetected = relationshipResult.detectedEntities.map(e => e.name);
      result.relationshipsFound = relationshipResult.relationships;
      result.queryEnhanced = relationshipResult.expandedEntities.length > relationshipResult.detectedEntities.length;
      
      if (result.queryEnhanced) {
        const expandedTerms = relationshipResult.expandedEntities
          .filter(e => e.relatedVia === 'relationship')
          .map(e => e.name);
        result.enhancedQuery = `${query} OR ${expandedTerms.join(' OR ')}`;
      }

      console.log(`  ✅ Entities detected: ${result.entitiesDetected.length}`);
      console.log(`  ✅ Relationships found: ${result.relationshipsFound.length}`);
      console.log(`  ✅ Query enhanced: ${result.queryEnhanced ? 'YES' : 'NO'}`);
      
      if (result.enhancedQuery) {
        console.log(`  🚀 Enhanced query: "${result.enhancedQuery}"`);
      }

      // Test via Chat API to validate end-to-end integration
      console.log('💬 Testing via chat API...');
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: query }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Chat API failed: ${response.status}`);
      }

      // Read response
      const reader = response.body?.getReader();
      let assistantResponse = '';
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = new TextDecoder().decode(value);
          assistantResponse += chunk;
        }
      }

      // Analyze response for relationship context
      result.relationshipContextProvided = this.analyzeResponseForRelationshipContext(
        assistantResponse, 
        result.relationshipsFound
      );

      console.log(`  ✅ Response length: ${assistantResponse.length} chars`);
      console.log(`  ✅ Relationship context: ${result.relationshipContextProvided ? 'YES' : 'NO'}`);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ Test failed:`, errorMsg);
      result.errors.push(errorMsg);
      result.success = false;
    }

    result.executionTime = Date.now() - startTime;
    console.log(`  ⏱️  Execution time: ${result.executionTime}ms`);

    return result;
  }

  /**
   * Test multi-hop relationship traversal
   */
  async testMultiHopTraversal(
    testName: string,
    startEntity: string,
    expectedPath: string[]
  ): Promise<KGTestResult> {
    console.log(`\n🧪 Testing Multi-Hop Traversal: ${testName}`);
    console.log(`🎯 Start entity: "${startEntity}"`);
    console.log(`🗺️  Expected path: ${expectedPath.join(' → ')}`);

    const result: KGTestResult = {
      testName,
      query: `Tell me about ${startEntity}`,
      entitiesDetected: [],
      relationshipsFound: [],
      queryEnhanced: false,
      resultCount: 0,
      relationshipContextProvided: false,
      success: true,
      errors: [],
      executionTime: Date.now()
    };

    try {
      // Query database directly for relationship path validation
      const { data: pathEntities } = await supabaseAdmin
        .from('entities')
        .select('id, name, kind')
        .in('name', expectedPath);

      if (!pathEntities || pathEntities.length === 0) {
        throw new Error(`Expected entities not found in database: ${expectedPath.join(', ')}`);
      }

      // Check if relationships exist between expected entities
      const entityIds = pathEntities.map(e => e.id);
      const { data: pathRelationships } = await supabaseAdmin
        .from('edges')
        .select(`
          rel,
          weight,
          evidence_text,
          src:entities!src_id(name),
          dst:entities!dst_id(name)
        `)
        .or(`src_id.in.(${entityIds.join(',')}),dst_id.in.(${entityIds.join(',')})`);

      result.relationshipsFound = pathRelationships || [];
      result.entitiesDetected = pathEntities.map(e => e.name);

      console.log(`  ✅ Path entities found: ${result.entitiesDetected.length}`);
      console.log(`  ✅ Path relationships: ${result.relationshipsFound.length}`);

      // Validate specific relationship path
      const pathExists = this.validateRelationshipPath(expectedPath, result.relationshipsFound);
      if (!pathExists) {
        result.errors.push(`Expected relationship path not found: ${expectedPath.join(' → ')}`);
        result.success = false;
      } else {
        console.log(`  ✅ Relationship path validated`);
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ Multi-hop test failed:`, errorMsg);
      result.errors.push(errorMsg);
      result.success = false;
    }

    result.executionTime = Date.now() - result.executionTime;
    console.log(`  ⏱️  Execution time: ${result.executionTime}ms`);

    return result;
  }

  /**
   * Test entity disambiguation
   */
  async testEntityDisambiguation(
    testName: string,
    ambiguousQuery: string,
    expectedEntity: string,
    expectedType: string
  ): Promise<KGTestResult> {
    console.log(`\n🧪 Testing Entity Disambiguation: ${testName}`);
    console.log(`❓ Ambiguous query: "${ambiguousQuery}"`);
    console.log(`🎯 Expected entity: "${expectedEntity}" (${expectedType})`);

    const result: KGTestResult = {
      testName,
      query: ambiguousQuery,
      entitiesDetected: [],
      relationshipsFound: [],
      queryEnhanced: false,
      resultCount: 0,
      relationshipContextProvided: false,
      success: true,
      errors: [],
      executionTime: Date.now()
    };

    try {
      // Test entity detection in ambiguous context
      const relationshipResult = await relationshipSearchEngine.searchWithRelationships({
        query: ambiguousQuery,
        includeRelatedEntities: true,
        maxHops: 1,
        limit: 5
      });

      result.entitiesDetected = relationshipResult.detectedEntities.map(e => e.name);
      
      // Check if expected entity was correctly identified
      const foundExpected = result.entitiesDetected.includes(expectedEntity);
      if (!foundExpected) {
        result.errors.push(`Expected entity "${expectedEntity}" not detected`);
        result.success = false;
      } else {
        console.log(`  ✅ Correct entity disambiguation: "${expectedEntity}"`);
      }

      // Validate entity type if detected
      if (foundExpected) {
        const { data: entityData } = await supabaseAdmin
          .from('entities')
          .select('kind')
          .eq('name', expectedEntity)
          .single();

        if (entityData?.kind !== expectedType) {
          result.errors.push(`Entity type mismatch: expected ${expectedType}, got ${entityData?.kind}`);
          result.success = false;
        } else {
          console.log(`  ✅ Correct entity type: ${expectedType}`);
        }
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ Disambiguation test failed:`, errorMsg);
      result.errors.push(errorMsg);
      result.success = false;
    }

    result.executionTime = Date.now() - result.executionTime;
    console.log(`  ⏱️  Execution time: ${result.executionTime}ms`);

    return result;
  }

  /**
   * Analyze response for relationship context indicators
   */
  private analyzeResponseForRelationshipContext(
    response: string,
    relationships: any[]
  ): boolean {
    if (relationships.length === 0) return false;

    // Look for relationship-specific language
    const relationshipIndicators = [
      'implements', 'used in', 'connects to', 'related to',
      'technology used', 'developed by', 'integrated with',
      'head tracking', 'lightfield', 'Android', 'OLED'
    ];

    const hasRelationshipLanguage = relationshipIndicators.some(indicator =>
      response.toLowerCase().includes(indicator.toLowerCase())
    );

    // Look for entity names from relationships
    const relationshipEntityNames = relationships.flatMap(rel => [
      rel.src?.name || '',
      rel.dst?.name || ''
    ]).filter(Boolean);

    const hasRelationshipEntities = relationshipEntityNames.some(entity =>
      response.toLowerCase().includes(entity.toLowerCase())
    );

    return hasRelationshipLanguage && hasRelationshipEntities;
  }

  /**
   * Validate that a relationship path exists in the found relationships
   */
  private validateRelationshipPath(expectedPath: string[], relationships: any[]): boolean {
    if (expectedPath.length < 2) return true;

    for (let i = 0; i < expectedPath.length - 1; i++) {
      const source = expectedPath[i];
      const destination = expectedPath[i + 1];

      const connectionExists = relationships.some(rel =>
        (rel.src?.name === source && rel.dst?.name === destination) ||
        (rel.src?.name === destination && rel.dst?.name === source)
      );

      if (!connectionExists) {
        console.log(`  ❌ Missing connection: ${source} ↔ ${destination}`);
        return false;
      }
    }

    return true;
  }
}

/**
 * KG Enhancement Test Suite Execution
 */
async function runKGEnhancementTests() {
  console.log('🧪 E2E Knowledge Graph Enhancement Test Suite');
  console.log('=============================================\n');

  const tester = new KGEnhancementTester();
  const results: KGTestResult[] = [];

  // Test Case 3.1: Multi-Hop Relationship Traversal
  console.log('📋 Test Case 3.1: Multi-Hop Relationship Traversal');
  
  const traversalTests = [
    {
      name: 'Leia → lightfield → Android',
      entity: 'Leia Inc',
      path: ['Leia Inc', 'lightfield', 'Android']
    },
    {
      name: 'head tracking → 3D reconstruction',
      entity: 'head tracking',
      path: ['head tracking', '3D reconstruction']
    }
  ];

  for (const test of traversalTests) {
    const result = await tester.testMultiHopTraversal(
      test.name,
      test.entity,
      test.path
    );
    results.push(result);
  }

  // Test Case 3.2: Entity Detection and Query Enhancement
  console.log('\n\n📋 Test Case 3.2: Entity Detection and Query Enhancement');
  
  const enhancementTests = [
    {
      name: 'Leia Technology Enhancement',
      query: 'Tell me about Leia technology'
    },
    {
      name: 'Display Technology Enhancement', 
      query: 'What display technologies are available?'
    },
    {
      name: 'Head Tracking Enhancement',
      query: 'How does head tracking work?'
    }
  ];

  for (const test of enhancementTests) {
    const result = await tester.testRelationshipAwareSearch(
      test.name,
      test.query
    );
    results.push(result);
  }

  // Test Case 3.3: Entity Disambiguation
  console.log('\n\n📋 Test Case 3.3: Entity Disambiguation');
  
  const disambiguationTests = [
    {
      name: 'Android Context Resolution',
      query: 'Tell me about Android displays',
      expectedEntity: 'Android',
      expectedType: 'product'
    },
    {
      name: 'OLED Technology Context',
      query: 'How do OLED displays work in mobile devices?',
      expectedEntity: 'OLED',
      expectedType: 'technology'
    }
  ];

  for (const test of disambiguationTests) {
    const result = await tester.testEntityDisambiguation(
      test.name,
      test.query,
      test.expectedEntity,
      test.expectedType
    );
    results.push(result);
  }

  // Summary Report
  console.log('\n\n📊 KG ENHANCEMENT TEST SUMMARY');
  console.log('==============================');
  
  const totalTests = results.length;
  const successfulTests = results.filter(r => r.success).length;
  const avgExecutionTime = results.reduce((acc, r) => acc + r.executionTime, 0) / totalTests;
  
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Successful: ${successfulTests}`);
  console.log(`Failed: ${totalTests - successfulTests}`);
  console.log(`Average Execution Time: ${avgExecutionTime.toFixed(1)}ms`);
  
  // Detailed results
  results.forEach((result, index) => {
    console.log(`\nTest ${index + 1}: ${result.testName} (${result.success ? '✅ PASS' : '❌ FAIL'})`);
    console.log(`  Query: "${result.query}"`);
    console.log(`  Entities Detected: ${result.entitiesDetected.length} (${result.entitiesDetected.join(', ')})`);
    console.log(`  Relationships Found: ${result.relationshipsFound.length}`);
    console.log(`  Query Enhanced: ${result.queryEnhanced ? 'YES' : 'NO'}`);
    console.log(`  Relationship Context: ${result.relationshipContextProvided ? 'YES' : 'NO'}`);
    console.log(`  Execution Time: ${result.executionTime}ms`);
    
    if (result.errors.length > 0) {
      console.log(`  Errors:`);
      result.errors.forEach(error => console.log(`    - ${error}`));
    }
  });

  // Performance Analysis
  console.log('\n📈 Performance Analysis:');
  const fastTests = results.filter(r => r.executionTime < 1000).length;
  const slowTests = results.filter(r => r.executionTime >= 3000).length;
  
  console.log(`  Fast (<1s): ${fastTests}/${totalTests} tests`);
  console.log(`  Acceptable (1-3s): ${totalTests - fastTests - slowTests}/${totalTests} tests`);
  console.log(`  Slow (>3s): ${slowTests}/${totalTests} tests`);

  const overallSuccess = successfulTests === totalTests;
  console.log(`\n🎯 Overall Result: ${overallSuccess ? '✅ ALL KG TESTS PASSED' : '❌ SOME KG TESTS FAILED'}`);
  
  return overallSuccess;
}

// Execute tests if run directly
if (require.main === module) {
  runKGEnhancementTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 KG Enhancement test execution failed:', error);
      process.exit(1);
    });
}

export { KGEnhancementTester, runKGEnhancementTests };