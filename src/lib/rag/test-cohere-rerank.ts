/**
 * Test script for verifying Cohere rerank functionality
 */

import { CohereClient } from 'cohere-ai';
import { hybridSearchEngine } from './hybrid-search';

const cohereClient = new CohereClient({
  token: process.env.COHERE_API_KEY || '',
});

export async function testCohereRerank() {
  console.log('🧪 Testing Cohere Rerank functionality...');
  
  try {
    // Test 1: Direct Cohere API connection
    console.log('✅ Step 1: Testing direct Cohere API connection...');
    
    const testDocuments = [
      { id: '1', text: 'Machine learning algorithms for natural language processing' },
      { id: '2', text: 'Deep learning neural networks and artificial intelligence' },
      { id: '3', text: 'Computer vision and image recognition systems' },
      { id: '4', text: 'Natural language understanding and conversation AI' },
    ];
    
    const rerankResponse = await cohereClient.rerank({
      model: 'rerank-english-v3.0',
      query: 'natural language processing',
      documents: testDocuments,
      topN: 3,
      returnDocuments: false,
    });
    
    console.log('✅ Cohere rerank API test successful!');
    console.log(`📊 Results: ${rerankResponse.results.length} documents reranked`);
    console.log('📋 Top result:', {
      index: rerankResponse.results[0]?.index,
      relevanceScore: rerankResponse.results[0]?.relevanceScore
    });
    
    // Test 2: Hybrid search with reranking (if documents exist in DB)
    console.log('\n✅ Step 2: Testing hybrid search with reranking...');
    
    const searchResult = await hybridSearchEngine.search({
      query: 'machine learning',
      limit: 5,
      threshold: 0.1,
    });
    
    console.log('✅ Hybrid search test completed!');
    console.log(`📊 Search results: ${searchResult.results.length} documents found`);
    console.log(`⏱️  Execution time: ${searchResult.executionTime}ms`);
    
    if (searchResult.results.length > 0) {
      console.log('📋 Top result:', {
        title: searchResult.results[0].title,
        score: searchResult.results[0].score,
        rerankedScore: searchResult.results[0].rerankedScore,
      });
      
      // Check if reranking was applied
      const hasRerankedScores = searchResult.results.some(r => r.rerankedScore !== undefined);
      if (hasRerankedScores) {
        console.log('🎯 Reranking was successfully applied!');
      } else {
        console.log('⚠️  No reranked scores found - may indicate reranking was not applied');
      }
    } else {
      console.log('ℹ️  No documents found in database for reranking test');
    }
    
    return {
      success: true,
      cohereApiWorking: true,
      hybridSearchWorking: true,
      rerankingApplied: searchResult.results.some(r => r.rerankedScore !== undefined),
      resultCount: searchResult.results.length,
      executionTime: searchResult.executionTime,
    };
    
  } catch (error) {
    console.error('❌ Cohere rerank test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Run test if called directly
if (require.main === module) {
  testCohereRerank()
    .then(result => {
      console.log('\n🔬 Test Results:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Test execution failed:', error);
      process.exit(1);
    });
}