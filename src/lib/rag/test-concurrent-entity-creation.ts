/**
 * Test Concurrent Entity Creation Scenarios
 *
 * Tests the updated entity consolidator to ensure it properly handles
 * concurrent entity creation without creating duplicates.
 */

// Load environment variables FIRST before any other imports
require('dotenv').config({
  path: require('path').resolve(process.cwd(), '.env.local'),
});

import { entityConsolidator } from './entity-consolidator';
import { supabaseAdmin } from '@/lib/supabase';

interface TestResult {
  success: boolean;
  message: string;
  details?: any;
}

/**
 * Test concurrent creation of the same entity
 */
async function testConcurrentEntityCreation(): Promise<TestResult> {
  console.log('🧪 Testing concurrent entity creation...');

  const testEntityName = `Test Entity ${Date.now()}`;
  const testEntityKind = 'technology';
  const testDescription = 'Test entity for concurrent creation';

  try {
    // Clean up any existing test entities
    await supabaseAdmin.from('entities').delete().like('name', 'Test Entity%');

    // Simulate concurrent creation by running multiple consolidation calls in parallel
    const promises = Array.from({ length: 5 }, (_, i) =>
      entityConsolidator.consolidateEntityOnIngestion(
        testEntityName,
        testEntityKind,
        `${testDescription} - Process ${i + 1}`
      )
    );

    const results = await Promise.all(promises);

    // Check that all results point to the same entity ID
    const uniqueEntityIds = new Set(results.map(r => r.entityId));

    if (uniqueEntityIds.size === 1) {
      // Verify only one entity was created in the database
      const { data: entities } = await supabaseAdmin
        .from('entities')
        .select('id, name, mention_count')
        .eq('name', testEntityName)
        .eq('kind', testEntityKind);

      if (entities && entities.length === 1) {
        const entity = entities[0];
        console.log(`✅ Success: Only one entity created with ID ${entity.id}`);
        console.log(`   Mention count: ${entity.mention_count}`);
        console.log(
          `   Results breakdown:`,
          results.map(r => ({
            entityId: r.entityId,
            wasReused: r.wasReused,
          }))
        );

        // Clean up
        await supabaseAdmin.from('entities').delete().eq('id', entity.id);

        return {
          success: true,
          message: `Concurrent entity creation test passed. Single entity created with ${entity.mention_count} mentions.`,
          details: {
            entityId: entity.id,
            mentionCount: entity.mention_count,
            results,
          },
        };
      } else {
        return {
          success: false,
          message: `Multiple entities found in database: ${entities?.length || 0}`,
          details: entities,
        };
      }
    } else {
      return {
        success: false,
        message: `Multiple entity IDs returned: ${Array.from(uniqueEntityIds).join(', ')}`,
        details: results,
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Test failed with error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: error,
    };
  }
}

/**
 * Test concurrent creation with consolidation rules
 */
async function testConcurrentConsolidationRules(): Promise<TestResult> {
  console.log('🧪 Testing concurrent creation with consolidation rules...');

  try {
    // Clean up any existing OLED entities
    await supabaseAdmin
      .from('entities')
      .delete()
      .eq('name', 'OLED')
      .eq('kind', 'technology');

    // Test concurrent creation of OLED variants (which should consolidate to "OLED")
    const promises = [
      entityConsolidator.consolidateEntityOnIngestion('OLED', 'technology'),
      entityConsolidator.consolidateEntityOnIngestion('oled', 'technology'),
      entityConsolidator.consolidateEntityOnIngestion('Oled', 'technology'),
      entityConsolidator.consolidateEntityOnIngestion('OLED', 'technology'),
    ];

    const results = await Promise.all(promises);

    // Check that all results point to the same entity ID
    const uniqueEntityIds = new Set(results.map(r => r.entityId));

    if (uniqueEntityIds.size === 1) {
      // Verify entity and aliases were created correctly
      const { data: entities } = await supabaseAdmin
        .from('entities')
        .select('id, name, mention_count')
        .eq('name', 'OLED')
        .eq('kind', 'technology');

      const { data: aliases } = await supabaseAdmin
        .from('aliases')
        .select('alias')
        .eq('entity_id', results[0].entityId);

      console.log(`✅ Success: OLED consolidation worked`);
      console.log(`   Entity:`, entities?.[0]);
      console.log(
        `   Aliases:`,
        aliases?.map(a => a.alias)
      );

      // Clean up
      if (entities?.[0]) {
        await supabaseAdmin.from('entities').delete().eq('id', entities[0].id);
      }

      return {
        success: true,
        message: `Concurrent consolidation rules test passed. Entity: ${entities?.[0]?.name}, Aliases: ${aliases?.length || 0}`,
        details: { entity: entities?.[0], aliases: aliases?.map(a => a.alias) },
      };
    } else {
      return {
        success: false,
        message: `Multiple entity IDs for OLED variants: ${Array.from(uniqueEntityIds).join(', ')}`,
        details: results,
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Consolidation rules test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: error,
    };
  }
}

/**
 * Test entity creation with existing entities to ensure no duplicates
 */
async function testNoDuplicatesWithExistingEntities(): Promise<TestResult> {
  console.log('🧪 Testing no duplicates with existing entities...');

  const testEntityName = `Existing Entity ${Date.now()}`;
  const testEntityKind = 'organization';

  try {
    // First create an entity normally
    const firstResult = await entityConsolidator.consolidateEntityOnIngestion(
      testEntityName,
      testEntityKind,
      'First creation'
    );

    // Then try to create the same entity multiple times concurrently
    const promises = Array.from({ length: 3 }, (_, i) =>
      entityConsolidator.consolidateEntityOnIngestion(
        testEntityName,
        testEntityKind,
        `Concurrent creation ${i + 1}`
      )
    );

    const results = await Promise.all(promises);

    // All results should point to the same entity (the first one)
    const allResults = [firstResult, ...results];
    const uniqueEntityIds = new Set(allResults.map(r => r.entityId));

    if (
      uniqueEntityIds.size === 1 &&
      uniqueEntityIds.has(firstResult.entityId)
    ) {
      // Verify only one entity exists in database
      const { data: entities } = await supabaseAdmin
        .from('entities')
        .select('id, name, mention_count')
        .eq('name', testEntityName)
        .eq('kind', testEntityKind);

      if (entities && entities.length === 1) {
        const entity = entities[0];
        console.log(`✅ Success: Reused existing entity`);
        console.log(`   Entity ID: ${entity.id}`);
        console.log(`   Mention count: ${entity.mention_count}`);

        // Clean up
        await supabaseAdmin.from('entities').delete().eq('id', entity.id);

        return {
          success: true,
          message: `No duplicates test passed. Reused existing entity with ${entity.mention_count} mentions.`,
          details: { entityId: entity.id, mentionCount: entity.mention_count },
        };
      } else {
        return {
          success: false,
          message: `Expected 1 entity, found ${entities?.length || 0}`,
          details: entities,
        };
      }
    } else {
      return {
        success: false,
        message: `Expected all results to use same entity ID, got: ${Array.from(uniqueEntityIds).join(', ')}`,
        details: allResults,
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `No duplicates test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: error,
    };
  }
}

/**
 * Run all concurrent entity creation tests
 */
export async function runConcurrentEntityCreationTests(): Promise<void> {
  console.log('🚀 Starting concurrent entity creation tests...');

  const tests = [
    { name: 'Concurrent Entity Creation', test: testConcurrentEntityCreation },
    {
      name: 'Concurrent Consolidation Rules',
      test: testConcurrentConsolidationRules,
    },
    {
      name: 'No Duplicates with Existing Entities',
      test: testNoDuplicatesWithExistingEntities,
    },
  ];

  const results: Array<TestResult & { testName: string }> = [];

  for (const { name, test } of tests) {
    console.log(`\n--- ${name} ---`);
    try {
      const result = await test();
      results.push({ ...result, testName: name });

      if (result.success) {
        console.log(`✅ ${name}: ${result.message}`);
      } else {
        console.log(`❌ ${name}: ${result.message}`);
      }
    } catch (error) {
      console.error(`💥 ${name} crashed:`, error);
      results.push({
        testName: name,
        success: false,
        message: `Test crashed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error,
      });
    }
  }

  console.log('\n📊 Test Summary:');
  const passed = results.filter(r => r.success).length;
  const total = results.length;

  console.log(`   ✅ Passed: ${passed}/${total}`);
  console.log(`   ❌ Failed: ${total - passed}/${total}`);

  if (passed === total) {
    console.log('\n🎉 All concurrent entity creation tests passed!');
  } else {
    console.log('\n⚠️ Some tests failed. Review the results above.');

    // Log failed test details
    results
      .filter(r => !r.success)
      .forEach(result => {
        console.log(`\n❌ ${result.testName}:`);
        console.log(`   Message: ${result.message}`);
        if (result.details) {
          console.log(`   Details:`, result.details);
        }
      });
  }
}

// Allow running this test file directly
if (require.main === module) {
  runConcurrentEntityCreationTests()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Test suite crashed:', error);
      process.exit(1);
    });
}
