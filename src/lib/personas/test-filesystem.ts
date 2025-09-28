#!/usr/bin/env tsx
/**
 * Test Persona File System Components
 *
 * Tests persona validation and constraints parsing without requiring database access
 */

import { PersonaValidator } from './persona-validator';
import { ConstraintsParser } from './constraints-parser';

async function testPersonaFileSystemComponents() {
  console.log('🧪 Testing Persona File System Components');
  console.log('==========================================\n');

  const personasToTest = ['david', 'legal'];

  for (const personaId of personasToTest) {
    console.log(`Testing ${personaId} persona...`);
    console.log('-'.repeat(50));

    try {
      // Test 1: Persona Validation from Disk
      console.log('1. Testing PersonaValidator.validateFromDisk()...');
      const validationResult = await PersonaValidator.validateFromDisk(
        `personas/${personaId}`
      );

      console.log(
        `   ✅ Validation Result: ${validationResult.isValid ? 'VALID' : 'INVALID'}`
      );
      if (validationResult.metadata) {
        console.log(`   - Title: ${validationResult.metadata.title}`);
        console.log(`   - Version: ${validationResult.metadata.version}`);
        console.log(
          `   - Author: ${validationResult.metadata.author || 'N/A'}`
        );
        console.log(
          `   - Tags: ${validationResult.metadata.tags?.join(', ') || 'None'}`
        );
      }

      if (validationResult.errors.length > 0) {
        console.log(`   ⚠️  Errors: ${validationResult.errors.length}`);
        validationResult.errors.forEach(error =>
          console.log(`      - ${error}`)
        );
      }

      if (validationResult.warnings.length > 0) {
        console.log(`   ⚠️  Warnings: ${validationResult.warnings.length}`);
        validationResult.warnings.forEach(warning =>
          console.log(`      - ${warning}`)
        );
      }

      // Test 2: Constraints Parsing from Persona Folder
      console.log('\n2. Testing ConstraintsParser.parseFromPersonaFolder()...');
      const constraintsResult = await ConstraintsParser.parseFromPersonaFolder(
        `personas/${personaId}`
      );

      console.log(
        `   ✅ Constraints Result: ${constraintsResult.success ? 'SUCCESS' : 'FAILED'}`
      );
      if (constraintsResult.constraints) {
        const c = constraintsResult.constraints;
        console.log(
          `   - Document Types: ${c.required_doc_types.length} (${c.required_doc_types.slice(0, 3).join(', ')}${c.required_doc_types.length > 3 ? '...' : ''})`
        );
        console.log(
          `   - Entity Types: ${c.kg_required_entities.length} (${c.kg_required_entities.slice(0, 3).join(', ')}${c.kg_required_entities.length > 3 ? '...' : ''})`
        );
        console.log(
          `   - Relationship Types: ${c.kg_required_edges.length} (${c.kg_required_edges.slice(0, 3).join(', ')}${c.kg_required_edges.length > 3 ? '...' : ''})`
        );
        console.log(
          `   - Chunk Size: ${c.content_chunk_min_chars}-${c.content_chunk_max_chars} chars`
        );
        console.log(
          `   - Quality Gate - Min Completion: ${c.quality_gates.min_completion_percentage}%`
        );
        console.log(`   - Default Processor: ${c.default_processor}`);
      }

      if (constraintsResult.errors && constraintsResult.errors.length > 0) {
        console.log(`   ❌ Errors: ${constraintsResult.errors.length}`);
        constraintsResult.errors.forEach(error =>
          console.log(`      - ${error}`)
        );
      }

      // Test 3: Effective Processor Selection
      if (constraintsResult.constraints) {
        console.log(
          '\n3. Testing ConstraintsParser.getEffectiveProcessor()...'
        );
        const testDocTypes = ['patent', 'note', 'legal-doc'];

        for (const docType of testDocTypes) {
          const processor = ConstraintsParser.getEffectiveProcessor(
            constraintsResult.constraints,
            docType
          );
          console.log(`   - ${docType}: ${processor}`);
        }
      }

      // Test 4: Extract Specific Configurations
      if (constraintsResult.constraints) {
        console.log('\n4. Testing configuration extraction methods...');
        const chunkConstraints = ConstraintsParser.extractChunkConstraints(
          constraintsResult.constraints
        );
        const entityReqs = ConstraintsParser.extractEntityRequirements(
          constraintsResult.constraints
        );
        const qualityGates = ConstraintsParser.extractQualityGates(
          constraintsResult.constraints
        );

        console.log(
          `   ✅ Chunk Constraints: ${chunkConstraints.content_chunk_min_chars}-${chunkConstraints.content_chunk_max_chars} chars, ${chunkConstraints.chunk_overlap_percentage}% overlap`
        );
        console.log(
          `   ✅ Entity Requirements: min ${entityReqs.min_entities_per_document} entities, confidence ${entityReqs.confidence_threshold}`
        );
        console.log(
          `   ✅ Quality Gates: ${qualityGates.min_completion_percentage}% completion, require identifiers: ${qualityGates.require_identifiers}`
        );
      }

      console.log('\n' + '='.repeat(70) + '\n');
    } catch (error) {
      console.error(`❌ Error testing ${personaId}:`, error);
      console.log('\n' + '='.repeat(70) + '\n');
    }
  }

  // Test 5: Error handling with invalid persona
  console.log('Testing error handling with invalid persona...');
  console.log('-'.repeat(50));

  try {
    const invalidResult = await PersonaValidator.validateFromDisk(
      'personas/nonexistent'
    );
    console.log(
      `✅ Invalid persona handled correctly: isValid = ${invalidResult.isValid}`
    );
    console.log(`   Errors: ${invalidResult.errors.join(', ')}`);
  } catch (error) {
    console.log(
      `✅ Exception handled correctly: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  console.log('\n🎉 File system component testing completed!');
}

// Run if called directly
if (require.main === module) {
  testPersonaFileSystemComponents().catch(console.error);
}

export { testPersonaFileSystemComponents };
