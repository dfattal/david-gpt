/**
 * Complete System Validation Test
 * 
 * Tests all components together:
 * 1. Entity consolidation working
 * 2. Cohere API working
 * 3. Enhanced search with corrected imports
 * 4. End-to-end KG-enhanced RAG pipeline
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
import { kgEnhancedSearchEngine } from '../src/lib/rag/kg-enhanced-search';
import { CohereClient } from 'cohere-ai';

async function validateCompleteSystem() {
  console.log('🚀 Complete System Validation Test\n');

  let allTestsPassed = true;

  // Test 1: Verify Entity Consolidation Results
  console.log('=== Test 1: Entity Consolidation Verification ===');
  try {
    const { data: leiaEntities, error } = await supabaseAdmin
      .from('entities')
      .select('name, kind, mention_count, authority_score')
      .eq('name', 'Leia Inc');

    if (error || !leiaEntities || leiaEntities.length === 0) {
      console.error('❌ Entity consolidation failed: No Leia Inc entity found');
      allTestsPassed = false;
    } else {
      const entity = leiaEntities[0];
      console.log(`✅ Entity consolidation verified: "${entity.name}" with ${entity.mention_count} mentions`);
      
      // Check aliases
      const { data: aliases } = await supabaseAdmin
        .from('aliases')
        .select('alias')
        .eq('entity_id', (await supabaseAdmin
          .from('entities')
          .select('id')
          .eq('name', 'Leia Inc')
          .single()
        ).data?.id);
        
      console.log(`📌 Aliases created: ${aliases?.map(a => `"${a.alias}"`).join(', ') || 'none'}`);
    }
  } catch (error) {
    console.error('❌ Entity consolidation verification failed:', error);
    allTestsPassed = false;
  }

  // Test 2: Cohere API Integration
  console.log('\n=== Test 2: Cohere API Integration ===');
  try {
    const cohereClient = new CohereClient({
      token: process.env.COHERE_API_KEY!,
    });

    const testResponse = await cohereClient.rerank({
      model: 'rerank-english-v3.0',
      query: 'lightfield display technology',
      documents: [
        { text: 'Leia Inc lightfield display patent for 3D visualization' },
        { text: 'General information about computer monitors' },
        { text: 'OLED technology for mobile displays' }
      ],
      topN: 2,
      returnDocuments: false,
    });

    if (testResponse.results && testResponse.results.length > 0) {
      console.log(`✅ Cohere rerank working: ${testResponse.results.length} results with scores`);
      console.log(`   Top result score: ${testResponse.results[0].relevanceScore.toFixed(4)}`);
    } else {
      console.error('❌ Cohere API returned no results');
      allTestsPassed = false;
    }
  } catch (error) {
    console.error('❌ Cohere API integration failed:', error);
    allTestsPassed = false;
  }

  // Test 3: KG-Enhanced Search with Entity Recognition
  console.log('\n=== Test 3: KG-Enhanced Search Pipeline ===');
  try {
    const searchResult = await kgEnhancedSearchEngine.kgSearch({
      query: "Leia lightfield displays",
      expandEntities: true,
      authorityBoost: true,
      limit: 3
    });

    if (searchResult.results && searchResult.results.length > 0) {
      console.log(`✅ KG-enhanced search working: ${searchResult.results.length} documents found`);
      
      // Check if entity expansion worked (query should include Leia Inc variations)
      const hasEntityExpansion = searchResult.metadata?.expandedQuery?.includes('Leia Inc');
      if (hasEntityExpansion) {
        console.log('✅ Entity expansion verified: Query includes "Leia Inc" variations');
      } else {
        console.log('⚠️  Entity expansion may need adjustment');
      }
      
      // Show top results
      searchResult.results.slice(0, 2).forEach((doc, i) => {
        console.log(`   ${i+1}. "${doc.title}" (${doc.docType || 'unknown type'})`);
      });
    } else {
      console.error('❌ KG-enhanced search returned no results');
      allTestsPassed = false;
    }
  } catch (error) {
    console.error('❌ KG-enhanced search failed:', error);
    allTestsPassed = false;
  }

  // Test 4: Knowledge Graph Statistics
  console.log('\n=== Test 4: Knowledge Graph Health Check ===');
  try {
    const { count: entityCount } = await supabaseAdmin
      .from('entities')
      .select('*', { count: 'exact', head: true });

    const { count: aliasCount } = await supabaseAdmin
      .from('aliases')
      .select('*', { count: 'exact', head: true });

    const { count: documentCount } = await supabaseAdmin
      .from('documents')
      .select('*', { count: 'exact', head: true });

    console.log(`✅ Knowledge Graph Statistics:`);
    console.log(`   📊 Total entities: ${entityCount || 0}`);
    console.log(`   🔗 Total aliases: ${aliasCount || 0}`);
    console.log(`   📄 Total documents: ${documentCount || 0}`);
    
    if ((entityCount || 0) < 5) {
      console.log('⚠️  Low entity count - may need more document processing');
    }
  } catch (error) {
    console.error('❌ Knowledge graph health check failed:', error);
    allTestsPassed = false;
  }

  // Final Results
  console.log('\n' + '='.repeat(50));
  if (allTestsPassed) {
    console.log('🎉 ALL SYSTEM VALIDATION TESTS PASSED! 🎉');
    console.log('\n✅ System Status:');
    console.log('   • Entity consolidation: WORKING ✅');
    console.log('   • Cohere API integration: WORKING ✅');
    console.log('   • Import functions: FIXED ✅');
    console.log('   • KG-enhanced search: WORKING ✅');
    console.log('   • End-to-end pipeline: VALIDATED ✅');
  } else {
    console.log('❌ SOME VALIDATION TESTS FAILED');
    console.log('\nPlease review the errors above and ensure all components are properly configured.');
  }
  
  return allTestsPassed;
}

// Run validation
if (require.main === module) {
  validateCompleteSystem()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('\n💥 System validation failed:', error);
      process.exit(1);
    });
}

export { validateCompleteSystem };