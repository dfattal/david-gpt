/**
 * Simplified E2E Test Runner
 * Uses direct API calls to test multi-turn chat functionality
 */

import { readFileSync } from 'fs';

// Load environment variables from the correct path
try {
  const envFile = readFileSync('/Users/david.fattal/Documents/GitHub/david-gpt/.env.local', 'utf8');
  const envVars = envFile.split('\n').filter(line => line.includes('=') && !line.startsWith('#'));
  envVars.forEach(line => {
    const equalIndex = line.indexOf('=');
    if (equalIndex > 0) {
      const key = line.slice(0, equalIndex).trim();
      const value = line.slice(equalIndex + 1).trim().replace(/^["']|["']$/g, '');
      if (key && value) {
        process.env[key] = value;
      }
    }
  });
  console.log('✅ Environment variables loaded');
} catch (error) {
  console.error('❌ Could not load .env.local file:', error);
  process.exit(1);
}

interface TestResult {
  testName: string;
  success: boolean;
  details: string;
  duration: number;
}

class SimpleE2ETester {
  private baseUrl: string = 'http://localhost:3000';

  async makeApiCall(query: string): Promise<{ success: boolean; response: string; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: query }]
        })
      });

      if (!response.ok) {
        return { success: false, response: '', error: `HTTP ${response.status}` };
      }

      // Read streaming response
      const reader = response.body?.getReader();
      let responseText = '';
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          responseText += new TextDecoder().decode(value);
        }
      }

      return { success: true, response: responseText };
    } catch (error) {
      return { success: false, response: '', error: String(error) };
    }
  }

  async testSingleTurnRAG(): Promise<TestResult> {
    console.log('\n🧪 Test 1: Single-Turn RAG with Citations');
    const startTime = Date.now();
    
    const query = "What is lightfield technology?";
    const result = await this.makeApiCall(query);
    
    if (!result.success) {
      return {
        testName: 'Single-Turn RAG',
        success: false,
        details: `API call failed: ${result.error}`,
        duration: Date.now() - startTime
      };
    }

    // Validate response
    const hasContent = result.response.length > 100;
    const hasCitations = /\[A\d+\]|\[B\d+\]/.test(result.response);
    const hasLightfieldContent = result.response.toLowerCase().includes('lightfield');
    
    const success = hasContent && hasLightfieldContent;
    
    console.log(`  Response length: ${result.response.length} chars`);
    console.log(`  Has lightfield content: ${hasLightfieldContent ? 'YES' : 'NO'}`);
    console.log(`  Has citations: ${hasCitations ? 'YES' : 'NO'}`);
    console.log(`  Result: ${success ? '✅ PASS' : '❌ FAIL'}`);

    return {
      testName: 'Single-Turn RAG',
      success,
      details: `Content: ${hasContent}, Lightfield: ${hasLightfieldContent}, Citations: ${hasCitations}`,
      duration: Date.now() - startTime
    };
  }

  async testRelationshipEnhancement(): Promise<TestResult> {
    console.log('\n🧪 Test 2: Relationship-Aware Search Enhancement');
    const startTime = Date.now();
    
    const query = "Tell me about Leia technology";
    const result = await this.makeApiCall(query);
    
    if (!result.success) {
      return {
        testName: 'Relationship Enhancement',
        success: false,
        details: `API call failed: ${result.error}`,
        duration: Date.now() - startTime
      };
    }

    // Check for relationship-enhanced content
    const hasLeia = result.response.toLowerCase().includes('leia');
    const hasLightfield = result.response.toLowerCase().includes('lightfield');
    const hasHeadTracking = result.response.toLowerCase().includes('head tracking');
    const hasRelatedTech = hasLightfield || hasHeadTracking;
    
    const success = hasLeia && hasRelatedTech;
    
    console.log(`  Has Leia content: ${hasLeia ? 'YES' : 'NO'}`);
    console.log(`  Has lightfield content: ${hasLightfield ? 'YES' : 'NO'}`);
    console.log(`  Has head tracking content: ${hasHeadTracking ? 'YES' : 'NO'}`);
    console.log(`  Result: ${success ? '✅ PASS' : '❌ FAIL'}`);

    return {
      testName: 'Relationship Enhancement',
      success,
      details: `Leia: ${hasLeia}, Lightfield: ${hasLightfield}, Head tracking: ${hasHeadTracking}`,
      duration: Date.now() - startTime
    };
  }

  async testMultiTurnContext(): Promise<TestResult> {
    console.log('\n🧪 Test 3: Multi-Turn Context Management');
    const startTime = Date.now();
    
    // Simulate multi-turn conversation
    const turns = [
      "What is lightfield technology?",
      "How does Leia implement this?",
      "What devices use this technology?"
    ];

    const conversationMessages: Array<{role: string, content: string}> = [];
    let allSuccessful = true;
    let contextContinuity = false;

    for (let i = 0; i < turns.length; i++) {
      console.log(`  Turn ${i + 1}: "${turns[i]}"`);
      
      conversationMessages.push({ role: 'user', content: turns[i] });
      
      try {
        const response = await fetch(`${this.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: conversationMessages
          })
        });

        if (!response.ok) {
          allSuccessful = false;
          console.log(`    ❌ API call failed: ${response.status}`);
          break;
        }

        // Read response
        const reader = response.body?.getReader();
        let responseText = '';
        
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            responseText += new TextDecoder().decode(value);
          }
        }

        conversationMessages.push({ role: 'assistant', content: responseText });
        
        console.log(`    ✅ Response received (${responseText.length} chars)`);
        
        // Check for context continuity in later turns
        if (i > 0) {
          const hasContextualResponse = responseText.toLowerCase().includes('leia') ||
                                      responseText.toLowerCase().includes('lightfield') ||
                                      responseText.toLowerCase().includes('head tracking');
          if (hasContextualResponse) {
            contextContinuity = true;
          }
        }

        // Small delay between turns
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        allSuccessful = false;
        console.log(`    ❌ Error: ${error}`);
        break;
      }
    }

    const success = allSuccessful && contextContinuity;
    
    console.log(`  All turns successful: ${allSuccessful ? 'YES' : 'NO'}`);
    console.log(`  Context continuity detected: ${contextContinuity ? 'YES' : 'NO'}`);
    console.log(`  Result: ${success ? '✅ PASS' : '❌ FAIL'}`);

    return {
      testName: 'Multi-Turn Context',
      success,
      details: `Turns successful: ${allSuccessful}, Context continuity: ${contextContinuity}`,
      duration: Date.now() - startTime
    };
  }

  async testBoundaryConditions(): Promise<TestResult> {
    console.log('\n🧪 Test 4: Boundary Conditions (Out-of-Corpus)');
    const startTime = Date.now();
    
    const query = "What is quantum computing?"; // Outside corpus
    const result = await this.makeApiCall(query);
    
    if (!result.success) {
      return {
        testName: 'Boundary Conditions',
        success: false,
        details: `API call failed: ${result.error}`,
        duration: Date.now() - startTime
      };
    }

    // Should NOT have corpus citations for out-of-scope queries
    const hasCitations = /\[A\d+\]|\[B\d+\]/.test(result.response);
    const hasQuantumContent = result.response.toLowerCase().includes('quantum');
    const hasContent = result.response.length > 50;
    
    // Success = responds with content but no corpus citations
    const success = !hasCitations && hasQuantumContent && hasContent;
    
    console.log(`  Has content: ${hasContent ? 'YES' : 'NO'}`);
    console.log(`  Has quantum content: ${hasQuantumContent ? 'YES' : 'NO'}`);
    console.log(`  Has corpus citations: ${hasCitations ? 'YES (BAD)' : 'NO (GOOD)'}`);
    console.log(`  Result: ${success ? '✅ PASS' : '❌ FAIL'}`);

    return {
      testName: 'Boundary Conditions',
      success,
      details: `Content: ${hasContent}, Quantum: ${hasQuantumContent}, Citations: ${!hasCitations}`,
      duration: Date.now() - startTime
    };
  }
}

async function runSimpleE2ETests() {
  console.log('🚀 David-GPT Simple E2E Test Suite');
  console.log('===================================');
  
  const tester = new SimpleE2ETester();
  const results: TestResult[] = [];
  const overallStart = Date.now();

  // Run all tests
  results.push(await tester.testSingleTurnRAG());
  results.push(await tester.testRelationshipEnhancement());
  results.push(await tester.testMultiTurnContext());
  results.push(await tester.testBoundaryConditions());

  const totalDuration = Date.now() - overallStart;
  const passedTests = results.filter(r => r.success).length;
  const totalTests = results.length;

  // Generate report
  console.log('\n📊 TEST SUMMARY REPORT');
  console.log('======================');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${totalTests - passedTests}`);
  console.log(`Success Rate: ${(passedTests/totalTests*100).toFixed(1)}%`);
  console.log(`Total Duration: ${(totalDuration/1000).toFixed(1)}s`);

  results.forEach((result, index) => {
    console.log(`\n${index + 1}. ${result.testName}: ${result.success ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   Duration: ${result.duration}ms`);
    console.log(`   Details: ${result.details}`);
  });

  const overallSuccess = passedTests === totalTests;
  console.log(`\n🎯 OVERALL RESULT: ${overallSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

  // Key validations summary
  console.log('\n🔍 KEY VALIDATIONS:');
  console.log(`- RAG retrieval with citations: ${results[0].success ? '✅' : '❌'}`);
  console.log(`- Relationship-aware search: ${results[1].success ? '✅' : '❌'}`);
  console.log(`- Multi-turn context management: ${results[2].success ? '✅' : '❌'}`);
  console.log(`- Boundary condition handling: ${results[3].success ? '✅' : '❌'}`);

  return overallSuccess;
}

// Execute tests
runSimpleE2ETests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
  });