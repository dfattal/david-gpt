#!/usr/bin/env tsx
import { personaManager } from './persona-manager';

async function testEnhancedPersonaManager() {
  console.log('🧪 Testing Enhanced PersonaManager');
  console.log('==================================\n');

  const personasToTest = ['david', 'legal'];

  for (const personaId of personasToTest) {
    console.log(`Testing ${personaId} persona configuration loading...`);
    console.log('-'.repeat(50));

    try {
      // Test comprehensive config loading
      console.log('1. Loading comprehensive PersonaConfig...');
      const configResult = await personaManager.getPersonaConfig(personaId);

      if (configResult.success && configResult.config) {
        console.log('✅ PersonaConfig loaded successfully');
        console.log(`   - Persona ID: ${configResult.config.persona_id}`);
        console.log(`   - Active: ${configResult.config.is_active}`);
        console.log(`   - Title: ${configResult.config.metadata.title}`);
        console.log(
          `   - Document Types: ${configResult.config.constraints.required_doc_types.length}`
        );
        console.log(
          `   - Entity Types: ${configResult.config.constraints.kg_required_entities.length}`
        );
        console.log(
          `   - Relationship Types: ${configResult.config.constraints.kg_required_edges.length}`
        );

        if (configResult.warnings && configResult.warnings.length > 0) {
          console.log(`   - Warnings: ${configResult.warnings.join(', ')}`);
        }
      } else {
        console.log('❌ PersonaConfig loading failed');
        configResult.errors?.forEach(error => console.log(`      ${error}`));
        continue;
      }

      // Test document processing config
      console.log('\n2. Loading DocumentProcessingConfig...');
      const processingResult =
        await personaManager.getDocumentProcessingConfig(personaId);

      if (processingResult.success && processingResult.config) {
        console.log('✅ DocumentProcessingConfig loaded successfully');
        console.log(
          `   - Document Types: ${processingResult.config.document_types.join(', ')}`
        );
        console.log(
          `   - Default Processor: ${processingResult.config.default_processor}`
        );
        console.log(
          `   - Chunk Size: ${processingResult.config.chunk_constraints.content_chunk_min_chars}-${processingResult.config.chunk_constraints.content_chunk_max_chars}`
        );
        console.log(
          `   - Quality Gate - Min Completion: ${processingResult.config.quality_gates.min_completion_percentage}%`
        );
      } else {
        console.log('❌ DocumentProcessingConfig loading failed');
        processingResult.errors?.forEach(error =>
          console.log(`      ${error}`)
        );
      }

      // Test search config
      console.log('\n3. Loading SearchConfig...');
      const searchResult = await personaManager.getSearchConfig(personaId);

      if (searchResult.success && searchResult.config) {
        console.log('✅ SearchConfig loaded successfully');
        console.log(
          `   - Allowed Doc Types: ${searchResult.config.allowed_document_types.length} types`
        );
        console.log(
          `   - Allowed Entity Kinds: ${searchResult.config.allowed_entity_kinds.length} kinds`
        );
        console.log(
          `   - Allowed Relationships: ${searchResult.config.allowed_relationship_types.length} types`
        );
      } else {
        console.log('❌ SearchConfig loading failed');
        searchResult.errors?.forEach(error => console.log(`      ${error}`));
      }

      // Test document type validation
      console.log('\n4. Testing document type validation...');
      const testDocTypes = ['patent', 'legal-doc', 'case-law', 'note'];

      for (const docType of testDocTypes) {
        const isAllowed = await personaManager.validateDocumentType(
          personaId,
          docType
        );
        console.log(
          `   - ${docType}: ${isAllowed ? '✅ Allowed' : '❌ Not allowed'}`
        );
      }

      // Test processor selection
      console.log('\n5. Testing processor selection...');
      const processor = await personaManager.getEffectiveProcessor(
        personaId,
        'patent'
      );
      console.log(`   - Effective processor for 'patent': ${processor}`);

      console.log('\n' + '='.repeat(70) + '\n');
    } catch (error) {
      console.error(`❌ Error testing ${personaId}:`, error);
    }
  }
}

// Run if called directly
if (require.main === module) {
  testEnhancedPersonaManager().catch(console.error);
}

export { testEnhancedPersonaManager };
