/**
 * Simple test script for verifying Cohere API connectivity
 */

import { CohereClient } from 'cohere-ai';

async function testCohereAPI() {
  console.log('🧪 Testing Cohere API connectivity...');

  // Environment variable should be loaded at runtime

  if (!process.env.COHERE_API_KEY) {
    console.error('❌ COHERE_API_KEY not found in environment');
    return false;
  }

  const cohereClient = new CohereClient({
    token: process.env.COHERE_API_KEY,
  });

  try {
    const testDocuments = [
      {
        id: '1',
        text: 'Machine learning algorithms for natural language processing and text analysis',
      },
      {
        id: '2',
        text: 'Deep learning neural networks and artificial intelligence systems',
      },
      {
        id: '3',
        text: 'Computer vision and image recognition using convolutional networks',
      },
      {
        id: '4',
        text: 'Natural language understanding and conversation AI for chatbots',
      },
      {
        id: '5',
        text: 'Reinforcement learning algorithms for game playing and robotics',
      },
    ];

    console.log('📤 Sending rerank request to Cohere...');

    const rerankResponse = await cohereClient.rerank({
      model: 'rerank-english-v3.0',
      query: 'natural language processing',
      documents: testDocuments,
      topN: 3,
      returnDocuments: false,
    });

    console.log('✅ Cohere rerank API test successful!');
    console.log(
      `📊 Results: ${rerankResponse.results.length} documents reranked`
    );

    console.log('🏆 Top 3 results:');
    rerankResponse.results.forEach((result, index) => {
      const doc = testDocuments[result.index];
      console.log(
        `  ${index + 1}. [${result.index}] Score: ${result.relevanceScore.toFixed(4)}`
      );
      console.log(`     "${doc.text.substring(0, 60)}..."`);
    });

    return true;
  } catch (error) {
    console.error('❌ Cohere API test failed:', error);
    return false;
  }
}

// Run test
testCohereAPI()
  .then(success => {
    if (success) {
      console.log('\n🎉 Cohere rerank is working properly!');
      process.exit(0);
    } else {
      console.log('\n💥 Cohere rerank test failed');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
  });
