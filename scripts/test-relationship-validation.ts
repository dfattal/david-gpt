/**
 * Relationship Validation Test Script
 * 
 * Tests relationship extraction quality and debugs entity resolution issues
 */

// Load environment variables
import { readFileSync } from 'fs';
import { join } from 'path';

try {
  const envFile = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
  const envVars = envFile.split('\n').filter(line => line.includes('='));
  envVars.forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      process.env[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
    }
  });
} catch (error) {
  console.warn('Warning: Could not load .env.local file');
}

import { supabaseAdmin } from '../src/lib/supabase';
import { relationshipExtractor } from '../src/lib/rag/relationship-extractor';

async function testRelationshipValidation() {
  console.log('🧪 Testing Relationship Extraction and Validation\n');

  // Test 1: Check current entities in database
  console.log('=== Test 1: Current Entity Inventory ===');
  const { data: entities, error: entitiesError } = await supabaseAdmin
    .from('entities')
    .select('id, name, kind')
    .order('name');

  if (entitiesError || !entities) {
    console.error('❌ Failed to fetch entities:', entitiesError);
    return;
  }

  console.log(`📊 Total entities in database: ${entities.length}`);
  
  // Group by kind
  const entitiesByKind = entities.reduce((acc: Record<string, any[]>, entity) => {
    if (!acc[entity.kind]) acc[entity.kind] = [];
    acc[entity.kind].push(entity);
    return acc;
  }, {});

  Object.entries(entitiesByKind).forEach(([kind, kindEntities]) => {
    console.log(`  ${kind.toUpperCase()}: ${kindEntities.length}`);
    kindEntities.slice(0, 3).forEach(entity => {
      console.log(`    - "${entity.name}" (${entity.id.substring(0, 8)}...)`);
    });
    if (kindEntities.length > 3) {
      console.log(`    ... and ${kindEntities.length - 3} more`);
    }
  });

  // Test 2: Test relationship extraction on a single document
  console.log('\n=== Test 2: Single Document Relationship Test ===');
  
  const { data: testDoc, error: docError } = await supabaseAdmin
    .from('documents')
    .select(`
      id, title, doc_type, patent_no, doi, arxiv_id, iso_date,
      document_chunks (content)
    `)
    .eq('processing_status', 'completed')
    .limit(1)
    .single();

  if (docError || !testDoc) {
    console.error('❌ Failed to fetch test document:', docError);
    return;
  }

  console.log(`🔍 Testing with document: "${testDoc.title}"`);

  const documentMetadata = {
    title: testDoc.title,
    docType: testDoc.doc_type,
    patentNo: testDoc.patent_no,
    doi: testDoc.doi,
    arxivId: testDoc.arxiv_id,
    date: testDoc.iso_date
  };

  const documentChunks = (testDoc.document_chunks as any[]).map(chunk => ({ content: chunk.content }));

  try {
    const { relationships, entities: entitiesFound } = await relationshipExtractor.extractRelationshipsFromDocument(
      testDoc.id,
      documentMetadata,
      documentChunks
    );

    console.log(`✅ Extracted ${relationships.length} relationships`);
    console.log(`📋 Entity names found: ${entitiesFound.length}`);
    
    // Show sample relationships
    relationships.slice(0, 5).forEach((rel, i) => {
      console.log(`  ${i+1}. ${rel.srcId} --[${rel.rel}]--> ${rel.dstId}`);
      if (rel.evidenceText) {
        console.log(`     Evidence: "${rel.evidenceText.substring(0, 80)}..."`);
      }
    });

    // Test 3: Entity Resolution Debug
    console.log('\n=== Test 3: Entity Resolution Debug ===');
    
    // Check which entity names can be resolved
    const sampleEntityNames = entitiesFound.slice(0, 10);
    console.log(`🔍 Testing resolution for ${sampleEntityNames.length} entity names:`);
    
    for (const entityName of sampleEntityNames) {
      // Try exact match
      const { data: exactMatch } = await supabaseAdmin
        .from('entities')
        .select('id, name, kind')
        .eq('name', entityName)
        .single();
        
      // Try alias match
      const { data: aliasMatch } = await supabaseAdmin
        .from('aliases')
        .select('entities(id, name, kind)')
        .eq('alias', entityName)
        .single();
        
      const resolved = exactMatch || aliasMatch?.entities;
      
      if (resolved) {
        console.log(`  ✅ "${entityName}" → ${resolved.name} (${resolved.kind})`);
      } else {
        console.log(`  ❌ "${entityName}" → NOT FOUND`);
      }
    }

    // Test 4: Try to save one relationship manually
    console.log('\n=== Test 4: Manual Relationship Save Test ===');
    
    if (relationships.length > 0) {
      const testRel = relationships[0];
      console.log(`🧪 Testing save for: ${testRel.srcId} --[${testRel.rel}]--> ${testRel.dstId}`);
      
      try {
        await relationshipExtractor.saveRelationships([testRel]);
        console.log('✅ Manual relationship save succeeded');
        
        // Check if it's in database
        const { count: relCount } = await supabaseAdmin
          .from('edges')
          .select('*', { count: 'exact', head: true });
        
        console.log(`📊 Total relationships in database: ${relCount}`);
        
      } catch (saveError) {
        console.error('❌ Manual relationship save failed:', saveError);
      }
    }

  } catch (extractError) {
    console.error('❌ Relationship extraction failed:', extractError);
  }

  console.log('\n🎉 Relationship validation test complete!');
}

// Run the test
if (require.main === module) {
  testRelationshipValidation()
    .then(() => {
      console.log('\n✅ Relationship validation completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Relationship validation failed:', error);
      process.exit(1);
    });
}

export { testRelationshipValidation };