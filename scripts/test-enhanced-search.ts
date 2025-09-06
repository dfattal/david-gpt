/**
 * Test Enhanced Search with Real Knowledge Graph Data
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

import { kgEnhancedSearchEngine } from '../src/lib/rag/kg-enhanced-search';
import { 
  searchTechnologyAdvanced, 
  searchAuthorAdvanced,
  searchPatentsAdvanced 
} from '../src/lib/rag/specialized-search';

async function testEnhancedSearch() {
  console.log('🧪 Testing Enhanced Search with Real KG Data\n');

  // Test 1: Basic KG-Enhanced Search
  console.log('=== Test 1: KG-Enhanced Search ===');
  try {
    const result1 = await kgEnhancedSearchEngine.kgSearch({
      query: "lightfield display technology",
      expandEntities: true,
      authorityBoost: true,
      limit: 5
    });
    
    console.log(`✅ KG Search Results: ${result1.results.length} documents found`);
    console.log(`📊 Entity expansions: ${result1.metadata?.entityExpansions?.length || 0}`);
    console.log(`🔍 Query: "${result1.metadata?.expandedQuery || 'N/A'}"`);
    
    result1.results.slice(0, 2).forEach((doc, i) => {
      const score = doc.combinedScore ? doc.combinedScore.toFixed(3) : 'N/A';
      console.log(`  ${i+1}. ${doc.title} (score: ${score})`);
    });
    
  } catch (error) {
    console.error('❌ KG Search failed:', error);
  }

  // Test 2: Technology Search
  console.log('\n=== Test 2: Technology Search ===');
  try {
    const result2 = await searchTechnologyAdvanced('OLED displays', {
      includeImplementations: true,
      includeRelatedTech: true,
      limit: 3
    });
    
    console.log(`✅ Technology Search: ${result2.documents.length} documents found`);
    console.log(`🔧 Technologies found: ${result2.relatedTechnologies?.length || 0}`);
    
    result2.documents.slice(0, 2).forEach((doc, i) => {
      const relevance = doc.relevanceScore ? doc.relevanceScore.toFixed(3) : 'N/A';
      console.log(`  ${i+1}. ${doc.title} (relevance: ${relevance})`);
    });
    
  } catch (error) {
    console.error('❌ Technology Search failed:', error);
  }

  // Test 3: Patent Search  
  console.log('\n=== Test 3: Patent Search ===');
  try {
    const result3 = await searchPatentsAdvanced('3D display head tracking', {
      includeExpired: false,
      limit: 3
    });
    
    console.log(`✅ Patent Search: ${result3.patents.length} patents found`);
    
    result3.patents.slice(0, 2).forEach((patent, i) => {
      console.log(`  ${i+1}. ${patent.title} (status: ${patent.legalStatus || 'unknown'})`);
    });
    
  } catch (error) {
    console.error('❌ Patent Search failed:', error);
  }

  // Test 4: Entity-based Query Expansion
  console.log('\n=== Test 4: Entity Recognition Test ===');
  try {
    const result4 = await kgEnhancedSearchEngine.kgSearch({
      query: "Leia lightfield technology",
      expandEntities: true,
      authorityBoost: true,
      limit: 3
    });
    
    console.log(`✅ Entity-based Search: ${result4.results.length} documents`);
    console.log(`🏢 Entities recognized: ${result4.metadata?.entitiesRecognized?.length || 0}`);
    
    if (result4.metadata?.entitiesRecognized) {
      result4.metadata.entitiesRecognized.forEach(entity => {
        console.log(`  - ${entity.name} (${entity.kind}, score: ${entity.authorityScore})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Entity Recognition failed:', error);
  }

  console.log('\n🎉 Enhanced Search Testing Complete!');
}

// Run the test
if (require.main === module) {
  testEnhancedSearch()
    .then(() => {
      console.log('\n✅ All search tests completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Search tests failed:', error);
      process.exit(1);
    });
}

export { testEnhancedSearch };