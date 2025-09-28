/**
 * Test Script for Entity Quality Validation Improvements
 *
 * Tests the enhanced validation rules against problematic entities
 * that were identified as needing improvement.
 */

import {
  entityQualityAssessor,
  type EntityQualityProfile,
} from './entity-quality-framework';
import type {
  Entity,
  EntityKind,
  DocumentMetadata,
  DocumentChunk,
} from './types';

// Sample problematic entities that should be caught by our validation
const problematicEntities: Array<{
  entity: Partial<Entity>;
  description: string;
}> = [
  // Fragment entities (should be rejected)
  {
    entity: { name: 'of Gaming', kind: 'technology' as EntityKind },
    description: 'Fragment starting with preposition',
  },
  {
    entity: { name: 'bringing 3D', kind: 'technology' as EntityKind },
    description: 'Fragment starting with verb',
  },
  {
    entity: { name: 'Technology of', kind: 'technology' as EntityKind },
    description: 'Fragment ending with preposition',
  },

  // Stop word entities (should be rejected)
  {
    entity: { name: 'Professional', kind: 'product' as EntityKind },
    description: 'Generic adjective as product',
  },
  {
    entity: { name: 'Premium', kind: 'product' as EntityKind },
    description: 'Generic adjective as product',
  },
  {
    entity: { name: 'Advanced', kind: 'technology' as EntityKind },
    description: 'Generic adjective as technology',
  },

  // Company names incorrectly classified as products (should be caught)
  {
    entity: { name: 'Samsung', kind: 'product' as EntityKind },
    description: 'Company name classified as product',
  },
  {
    entity: { name: 'Apple', kind: 'product' as EntityKind },
    description: 'Company name classified as product',
  },
  {
    entity: { name: 'LG', kind: 'product' as EntityKind },
    description: 'Company name classified as product',
  },

  // Technical specifications as entities (should be rejected)
  {
    entity: { name: '49-inch', kind: 'component' as EntityKind },
    description: 'Display size specification',
  },
  {
    entity: { name: '120Hz', kind: 'technology' as EntityKind },
    description: 'Refresh rate specification',
  },
  {
    entity: { name: 'A 10000mAh', kind: 'component' as EntityKind },
    description: 'Battery capacity specification',
  },

  // Event/venue entities (should be rejected)
  {
    entity: { name: 'MWC 2024', kind: 'organization' as EntityKind },
    description: 'Trade show event',
  },
  {
    entity: { name: 'Hall 3', kind: 'organization' as EntityKind },
    description: 'Convention hall venue',
  },

  // Price entities (should be rejected)
  {
    entity: { name: '$1199', kind: 'product' as EntityKind },
    description: 'Price value',
  },
  {
    entity: { name: '2499 dollars', kind: 'product' as EntityKind },
    description: 'Price in words',
  },
];

// Good entities that should pass validation
const goodEntities: Array<{ entity: Partial<Entity>; description: string }> = [
  // Proper product names
  {
    entity: { name: 'Galaxy Tab S10 Ultra', kind: 'product' as EntityKind },
    description: 'Valid product name',
  },
  {
    entity: { name: 'Odyssey 3D', kind: 'product' as EntityKind },
    description: 'Valid product name',
  },
  {
    entity: { name: 'Nubia Pad 3D II', kind: 'product' as EntityKind },
    description: 'Valid product name',
  },

  // Proper company names
  {
    entity: { name: 'Samsung', kind: 'organization' as EntityKind },
    description: 'Company correctly classified',
  },
  {
    entity: { name: 'Leia Inc.', kind: 'organization' as EntityKind },
    description: 'Company with legal suffix',
  },

  // Proper technology names
  {
    entity: { name: 'Lightfield Display', kind: 'technology' as EntityKind },
    description: 'Valid technology name',
  },
  {
    entity: { name: '3D Display Technology', kind: 'technology' as EntityKind },
    description: 'Valid technology description',
  },

  // Proper person names
  {
    entity: { name: 'David Chen', kind: 'person' as EntityKind },
    description: 'Valid person name',
  },
  {
    entity: { name: 'Sarah Martinez', kind: 'person' as EntityKind },
    description: 'Valid person name',
  },
];

// Mock document context for testing
const mockContext = {
  documentMetadata: {
    title: 'Test Document',
    docType: 'press-article',
    url: 'https://example.com/test',
  } as DocumentMetadata,
  chunks: [
    {
      content: 'Sample content for testing entity validation',
      chunkIndex: 0,
      startOffset: 0,
      endOffset: 100,
    },
  ] as DocumentChunk[],
  extractionSource: 'content' as const,
};

/**
 * Test entity validation with problematic entities
 */
function testProblematicEntities() {
  console.log(
    '🔍 Testing Problematic Entities (should be caught by validation)\n'
  );

  let caughtIssues = 0;
  let totalIssues = 0;

  problematicEntities.forEach(({ entity, description }) => {
    const profile = entityQualityAssessor.assessEntity(entity, mockContext);

    totalIssues++;
    const hasValidationIssues =
      profile.metrics.validationScore < 0.5 ||
      profile.qualityTier === 'rejected' ||
      profile.qualityTier === 'minimal' ||
      profile.issues.some(issue => issue.type === 'pattern_violation');

    if (hasValidationIssues) {
      caughtIssues++;
      console.log(`✅ CAUGHT: "${entity.name}" (${description})`);
      console.log(`   Quality Tier: ${profile.qualityTier}`);
      console.log(
        `   Validation Score: ${profile.metrics.validationScore.toFixed(3)}`
      );
      console.log(
        `   Overall Score: ${profile.metrics.overallScore.toFixed(3)}`
      );
    } else {
      console.log(`❌ MISSED: "${entity.name}" (${description})`);
      console.log(`   Quality Tier: ${profile.qualityTier}`);
      console.log(
        `   Validation Score: ${profile.metrics.validationScore.toFixed(3)}`
      );
      console.log(
        `   Overall Score: ${profile.metrics.overallScore.toFixed(3)}`
      );
    }

    if (profile.issues.length > 0) {
      console.log(
        `   Issues: ${profile.issues.map(i => i.description).join('; ')}`
      );
    }
    console.log('');
  });

  console.log(
    `📊 Results: Caught ${caughtIssues}/${totalIssues} problematic entities (${Math.round((caughtIssues / totalIssues) * 100)}%)\n`
  );
  return { caughtIssues, totalIssues };
}

/**
 * Test entity validation with good entities
 */
function testGoodEntities() {
  console.log('✨ Testing Good Entities (should pass validation)\n');

  let passedEntities = 0;
  let totalEntities = 0;

  goodEntities.forEach(({ entity, description }) => {
    const profile = entityQualityAssessor.assessEntity(entity, mockContext);

    totalEntities++;
    const passedValidation =
      profile.metrics.validationScore >= 0.5 &&
      profile.qualityTier !== 'rejected' &&
      !profile.issues.some(issue => issue.severity === 'critical');

    if (passedValidation) {
      passedEntities++;
      console.log(`✅ PASSED: "${entity.name}" (${description})`);
      console.log(`   Quality Tier: ${profile.qualityTier}`);
      console.log(
        `   Validation Score: ${profile.metrics.validationScore.toFixed(3)}`
      );
      console.log(
        `   Overall Score: ${profile.metrics.overallScore.toFixed(3)}`
      );
    } else {
      console.log(`❌ FAILED: "${entity.name}" (${description})`);
      console.log(`   Quality Tier: ${profile.qualityTier}`);
      console.log(
        `   Validation Score: ${profile.metrics.validationScore.toFixed(3)}`
      );
      console.log(
        `   Overall Score: ${profile.metrics.overallScore.toFixed(3)}`
      );
      if (profile.issues.length > 0) {
        console.log(
          `   Issues: ${profile.issues.map(i => i.description).join('; ')}`
        );
      }
    }
    console.log('');
  });

  console.log(
    `📊 Results: ${passedEntities}/${totalEntities} good entities passed validation (${Math.round((passedEntities / totalEntities) * 100)}%)\n`
  );
  return { passedEntities, totalEntities };
}

/**
 * Test cross-type duplicate detection
 */
function testCrossTypeDuplicates() {
  console.log('🔄 Testing Cross-Type Duplicate Detection\n');

  // Create entities that should be detected as cross-type duplicates
  const duplicateEntities: Partial<Entity>[] = [
    { name: 'Samsung', kind: 'organization' }, // Correct
    { name: 'Samsung', kind: 'product' }, // Incorrect duplicate
    { name: 'Apple Inc.', kind: 'organization' }, // Correct
    { name: 'Apple', kind: 'product' }, // Incorrect duplicate
    { name: 'David Smith', kind: 'person' }, // Correct
    { name: 'David Smith', kind: 'organization' }, // Incorrect duplicate
  ];

  const profiles = entityQualityAssessor.assessEntities(
    duplicateEntities,
    mockContext
  );

  profiles.forEach(profile => {
    const hasDuplicateIssues = profile.issues.some(
      issue =>
        issue.type === 'duplicate' && issue.description.includes('Cross-type')
    );

    console.log(
      `${hasDuplicateIssues ? '🔍' : '📋'} "${profile.entity.name}" (${profile.entity.kind})`
    );
    console.log(`   Quality Tier: ${profile.qualityTier}`);
    console.log(`   Overall Score: ${profile.metrics.overallScore.toFixed(3)}`);

    if (hasDuplicateIssues) {
      const duplicateIssue = profile.issues.find(
        issue =>
          issue.type === 'duplicate' && issue.description.includes('Cross-type')
      );
      console.log(`   ⚠️  ${duplicateIssue?.description}`);
      console.log(`   💡 ${duplicateIssue?.suggestion}`);
    }
    console.log('');
  });
}

/**
 * Run all entity quality tests
 */
async function runEntityQualityTests() {
  console.log('🧪 Entity Quality Validation Test Suite\n');
  console.log('='.repeat(60) + '\n');

  try {
    // Test problematic entities
    const problematicResults = testProblematicEntities();

    // Test good entities
    const goodResults = testGoodEntities();

    // Test cross-type duplicates
    testCrossTypeDuplicates();

    // Summary
    console.log('📈 Test Summary');
    console.log('='.repeat(60));
    console.log(
      `Problematic entities caught: ${problematicResults.caughtIssues}/${problematicResults.totalIssues} (${Math.round((problematicResults.caughtIssues / problematicResults.totalIssues) * 100)}%)`
    );
    console.log(
      `Good entities passed: ${goodResults.passedEntities}/${goodResults.totalEntities} (${Math.round((goodResults.passedEntities / goodResults.totalEntities) * 100)}%)`
    );

    const overallSuccess =
      (problematicResults.caughtIssues / problematicResults.totalIssues +
        goodResults.passedEntities / goodResults.totalEntities) /
      2;

    console.log(
      `Overall validation accuracy: ${Math.round(overallSuccess * 100)}%`
    );

    if (overallSuccess >= 0.8) {
      console.log('\n✅ Entity quality validation system is working well!');
    } else if (overallSuccess >= 0.6) {
      console.log('\n⚠️  Entity quality validation needs some tuning.');
    } else {
      console.log(
        '\n❌ Entity quality validation system needs significant improvement.'
      );
    }
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runEntityQualityTests();
}

export {
  runEntityQualityTests,
  testProblematicEntities,
  testGoodEntities,
  testCrossTypeDuplicates,
};
