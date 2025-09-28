/**
 * Test Script for Semantic Entity Deduplication
 *
 * Tests the semantic deduplication system with known duplicate entities
 * to verify proper similarity detection and canonical entity selection.
 */

import { semanticEntityDeduplicator } from './semantic-entity-deduplicator';
import type { Entity } from './types';

/**
 * Test semantic deduplication with various duplicate scenarios
 */
async function testSemanticDeduplication() {
  console.log('🧪 Testing Semantic Entity Deduplication\n');
  console.log('='.repeat(80) + '\n');

  // Existing entities in the "database"
  const existingEntities: Partial<Entity>[] = [
    {
      name: 'Nubia Pad 3D II',
      kind: 'product',
      mentionCount: 5,
      authorityScore: 0.8,
    },
    {
      name: 'Leia Inc.',
      kind: 'organization',
      mentionCount: 3,
      authorityScore: 0.9,
    },
    {
      name: 'Samsung Galaxy S24 Ultra',
      kind: 'product',
      mentionCount: 8,
      authorityScore: 0.95,
    },
    {
      name: 'David Chen',
      kind: 'person',
      mentionCount: 2,
      authorityScore: 0.7,
    },
    {
      name: 'Glasses-Free 3D Tablet',
      kind: 'product',
      mentionCount: 4,
      authorityScore: 0.75,
    },
  ];

  // Test entities that should trigger deduplication
  const testCases = [
    {
      entity: { name: 'just Nubia Pad 3D II', kind: 'product' as const },
      description: 'Entity with extraction prefix artifact',
    },
    {
      entity: {
        name: 'announced the Nubia Pad 3D II',
        kind: 'product' as const,
      },
      description: 'Entity with announcement prefix',
    },
    {
      entity: { name: 'ZTE Nubia Pad 3D II', kind: 'product' as const },
      description: 'Entity with brand prefix',
    },
    {
      entity: { name: 'Leia', kind: 'organization' as const },
      description: 'Company without legal suffix',
    },
    {
      entity: { name: 'Galaxy S24 Ultra', kind: 'product' as const },
      description: 'Product without brand prefix',
    },
    {
      entity: { name: 'Samsung Galaxy S24 Ultra', kind: 'product' as const },
      description: 'Exact duplicate',
    },
    {
      entity: { name: 'Free 3D Tablet', kind: 'product' as const },
      description: 'Glasses-Free fragment',
    },
    {
      entity: { name: 'David Chen', kind: 'person' as const },
      description: 'Exact person duplicate',
    },
    {
      entity: { name: 'iPhone 15 Pro', kind: 'product' as const },
      description: 'Completely new entity',
    },
  ];

  let totalTests = 0;
  let correctActions = 0;

  for (const testCase of testCases) {
    totalTests++;
    console.log(`📱 Testing: "${testCase.entity.name}"`);
    console.log(`   Description: ${testCase.description}`);

    try {
      const result = await semanticEntityDeduplicator.checkEntityDuplication(
        testCase.entity,
        existingEntities
      );

      console.log(`   🎯 Action: ${result.action}`);
      console.log(`   📊 Similarity: ${(result.similarity * 100).toFixed(1)}%`);
      console.log(`   💭 Explanation: ${result.explanation}`);

      if (result.canonicalEntity) {
        console.log(`   ✨ Canonical: "${result.canonicalEntity.name}"`);
        if (result.canonicalEntity.mentionCount) {
          console.log(
            `   📈 Merged mention count: ${result.canonicalEntity.mentionCount}`
          );
        }
      }

      // Validate expected behavior
      let expectedCorrect = false;

      if (testCase.entity.name.includes('iPhone 15 Pro')) {
        // Should create new entity
        expectedCorrect = result.action === 'create';
      } else if (testCase.entity.name === 'Samsung Galaxy S24 Ultra') {
        // Exact duplicate should merge
        expectedCorrect = result.action === 'merge';
      } else if (
        testCase.entity.name.includes('Nubia Pad 3D II') ||
        testCase.entity.name.includes('Leia') ||
        testCase.entity.name.includes('Galaxy S24 Ultra') ||
        testCase.entity.name.includes('Free 3D Tablet') ||
        testCase.entity.name === 'David Chen'
      ) {
        // Similar entities should merge
        expectedCorrect = result.action === 'merge';
      } else {
        // Default expectation based on similarity
        expectedCorrect =
          result.similarity >= 0.85
            ? result.action === 'merge'
            : result.action === 'create';
      }

      if (expectedCorrect) {
        correctActions++;
        console.log('   ✅ Correct action taken');
      } else {
        console.log('   ❌ Unexpected action');
      }
    } catch (error) {
      console.error(`   💥 Error: ${error}`);
    }

    console.log('');
  }

  // Summary
  console.log('📈 Test Results Summary');
  console.log('='.repeat(80));
  console.log(
    `Correct actions: ${correctActions}/${totalTests} (${Math.round((correctActions / totalTests) * 100)}%)`
  );

  if (correctActions === totalTests) {
    console.log('🎉 All semantic deduplication tests passed!');
  } else if (correctActions >= totalTests * 0.8) {
    console.log('✅ Semantic deduplication working well with minor issues.');
  } else {
    console.log('⚠️  Semantic deduplication needs adjustment.');
  }
}

/**
 * Test specific similarity algorithms
 */
async function testSimilarityAlgorithms() {
  console.log('\n🔬 Testing Individual Similarity Algorithms\n');
  console.log('='.repeat(80) + '\n');

  const testPairs = [
    {
      entity1: 'Nubia Pad 3D II',
      entity2: 'announced the Nubia Pad 3D II',
      expected: 'high',
    },
    { entity1: 'Leia Inc.', entity2: 'Leia', expected: 'high' },
    {
      entity1: 'Samsung Galaxy S24 Ultra',
      entity2: 'Galaxy S24 Ultra',
      expected: 'high',
    },
    {
      entity1: 'Glasses-Free 3D Tablet',
      entity2: 'Free 3D Tablet',
      expected: 'high',
    },
    {
      entity1: 'iPhone 15 Pro',
      entity2: 'Samsung Galaxy S24 Ultra',
      expected: 'low',
    },
    { entity1: 'Apple', entity2: 'Apple Inc.', expected: 'high' },
  ];

  for (const pair of testPairs) {
    console.log(`🔍 Comparing: "${pair.entity1}" vs "${pair.entity2}"`);

    const result = await semanticEntityDeduplicator.checkEntityDuplication(
      { name: pair.entity2, kind: 'product' },
      [{ name: pair.entity1, kind: 'product' }]
    );

    console.log(`   Similarity: ${(result.similarity * 100).toFixed(1)}%`);
    console.log(`   Expected: ${pair.expected} similarity`);

    const actualLevel =
      result.similarity >= 0.85
        ? 'high'
        : result.similarity >= 0.3
          ? 'medium'
          : 'low';
    const correct = actualLevel === pair.expected;

    console.log(
      `   Result: ${actualLevel} similarity ${correct ? '✅' : '❌'}`
    );
    console.log('');
  }
}

/**
 * Run all semantic deduplication tests
 */
async function runSemanticDeduplicationTests() {
  console.log('🚀 Semantic Entity Deduplication Test Suite\n');

  try {
    await testSemanticDeduplication();
    await testSimilarityAlgorithms();

    console.log('\n✅ Semantic deduplication test suite completed!');
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runSemanticDeduplicationTests();
}

export {
  runSemanticDeduplicationTests,
  testSemanticDeduplication,
  testSimilarityAlgorithms,
};
