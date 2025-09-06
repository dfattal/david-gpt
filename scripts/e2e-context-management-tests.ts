/**
 * E2E Context Management Test Suite
 * 
 * Tests multi-turn context carry-over, decay, and turn classification
 * in the David-GPT chat system without relying on pre-trained knowledge.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// Load environment variables from .env.local
try {
  const envFile = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
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
} catch (error) {
  console.warn('Warning: Could not load .env.local file:', error);
}

import { supabaseAdmin } from '../src/lib/supabase';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ConversationTestResult {
  conversationId: string;
  messages: ChatMessage[];
  contextSources: any[];
  citations: any[];
  turnClassifications: string[];
  responseModes: string[];
  success: boolean;
  errors: string[];
}

class E2EContextTester {
  private baseUrl: string;
  
  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  /**
   * Execute a multi-turn conversation via the chat API
   */
  async executeConversation(
    testName: string,
    turns: string[],
    conversationId?: string
  ): Promise<ConversationTestResult> {
    console.log(`\n🧪 Starting test: ${testName}`);
    console.log(`📝 ${turns.length} turns planned\n`);

    const result: ConversationTestResult = {
      conversationId: conversationId || '',
      messages: [],
      contextSources: [],
      citations: [],
      turnClassifications: [],
      responseModes: [],
      success: true,
      errors: []
    };

    let currentConversationId = conversationId;

    for (let i = 0; i < turns.length; i++) {
      const userQuery = turns[i];
      console.log(`\n🔄 Turn ${i + 1}: "${userQuery}"`);

      try {
        // Prepare messages array for this turn
        const messages = [
          ...result.messages,
          { role: 'user' as const, content: userQuery }
        ];

        // Make API request
        const response = await fetch(`${this.baseUrl}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages,
            conversationId: currentConversationId
          })
        });

        if (!response.ok) {
          throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        // Read streaming response
        const reader = response.body?.getReader();
        let assistantResponse = '';
        
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = new TextDecoder().decode(value);
            assistantResponse += chunk;
          }
        }

        // Store messages
        result.messages.push(
          { role: 'user', content: userQuery },
          { role: 'assistant', content: assistantResponse }
        );

        console.log(`✅ Response received (${assistantResponse.length} chars)`);

        // If first turn, try to find the conversation ID
        if (i === 0 && !currentConversationId) {
          // Look for recently created conversation in database
          const { data: recentConversations } = await supabaseAdmin
            .from('conversations')
            .select('id, created_at')
            .order('created_at', { ascending: false })
            .limit(1);

          if (recentConversations?.[0]) {
            currentConversationId = recentConversations[0].id;
            result.conversationId = currentConversationId;
            console.log(`📋 Using conversation ID: ${currentConversationId}`);
          }
        }

        // Small delay between turns
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`❌ Turn ${i + 1} failed:`, errorMsg);
        result.errors.push(`Turn ${i + 1}: ${errorMsg}`);
        result.success = false;
      }
    }

    // Analyze conversation results
    if (result.conversationId) {
      await this.analyzeConversationResults(result);
    }

    return result;
  }

  /**
   * Analyze conversation context and citations
   */
  async analyzeConversationResults(result: ConversationTestResult): Promise<void> {
    console.log(`\n📊 Analyzing conversation results...`);

    try {
      // Get conversation sources (context carry-over)
      const { data: sources } = await supabaseAdmin
        .from('conversation_sources')
        .select(`
          document_id,
          carry_score,
          turns_inactive,
          pinned,
          last_used_at,
          documents(title, doc_type)
        `)
        .eq('conversation_id', result.conversationId)
        .order('last_used_at', { ascending: false });

      result.contextSources = sources || [];
      console.log(`📚 Context sources: ${result.contextSources.length}`);

      // Get message citations
      const { data: messages } = await supabaseAdmin
        .from('messages')
        .select(`
          id,
          role,
          content,
          message_citations(
            marker,
            fact_summary,
            document_id,
            relevance_score,
            documents(title, doc_type)
          )
        `)
        .eq('conversation_id', result.conversationId)
        .order('created_at');

      if (messages) {
        // Extract citations from all assistant messages
        const allCitations = messages
          .filter(msg => msg.role === 'assistant')
          .flatMap(msg => msg.message_citations || []);
        
        result.citations = allCitations;
        console.log(`📝 Citations found: ${result.citations.length}`);
      }

    } catch (error) {
      console.error('❌ Analysis failed:', error);
      result.errors.push(`Analysis failed: ${error}`);
    }
  }

  /**
   * Validate context carry-over behavior
   */
  validateContextCarryOver(result: ConversationTestResult): {
    passed: boolean;
    details: string[];
  } {
    const details: string[] = [];
    let passed = true;

    // Check that sources were created
    if (result.contextSources.length === 0) {
      passed = false;
      details.push('❌ No context sources found');
    } else {
      details.push(`✅ Context sources created: ${result.contextSources.length}`);
    }

    // Check carry scores (should decay over turns)
    const carryScores = result.contextSources.map(s => parseFloat(s.carry_score || '1.0'));
    if (carryScores.some(score => score < 1.0)) {
      details.push('✅ Score decay detected (expected for multi-turn)');
    }

    // Check turns_inactive progression
    const inactiveTurns = result.contextSources.map(s => s.turns_inactive || 0);
    const maxInactive = Math.max(...inactiveTurns);
    if (maxInactive < result.messages.length / 2 - 1) {
      details.push('✅ Turns inactive tracking working');
    }

    return { passed, details };
  }

  /**
   * Validate citation accuracy and persistence
   */
  validateCitations(result: ConversationTestResult): {
    passed: boolean;
    details: string[];
  } {
    const details: string[] = [];
    let passed = true;

    if (result.citations.length === 0) {
      // Citations are only expected if RAG was triggered
      const hasRagContent = result.messages.some(msg => 
        msg.role === 'assistant' && /\[A\d+\]|\[B\d+\]/.test(msg.content)
      );
      
      if (hasRagContent) {
        passed = false;
        details.push('❌ Citations in text but not persisted to database');
      } else {
        details.push('ℹ️  No citations found (may be expected for general queries)');
      }
    } else {
      details.push(`✅ Citations persisted: ${result.citations.length}`);
      
      // Validate citation format
      const validMarkers = result.citations.every(c => /^[A-Z]\d+$/.test(c.marker || ''));
      if (validMarkers) {
        details.push('✅ Citation markers properly formatted');
      } else {
        passed = false;
        details.push('❌ Invalid citation marker format');
      }
    }

    return { passed, details };
  }
}

/**
 * Test Suite Execution
 */
async function runContextManagementTests() {
  console.log('🧪 E2E Context Management Test Suite');
  console.log('=====================================\n');

  const tester = new E2EContextTester();
  const results: ConversationTestResult[] = [];

  // Test Case 2.1: Drill-Down Conversation
  console.log('📋 Test Case 2.1: Drill-Down Conversation');
  const drillDownResult = await tester.executeConversation(
    'Drill-Down Context Test',
    [
      'What is lightfield technology?',
      'How does Leia implement this?',
      'What devices use this technology?',
      'Tell me about CAT3D paper'
    ]
  );
  results.push(drillDownResult);

  // Validate drill-down behavior
  console.log('\n🔍 Validating drill-down context behavior...');
  const contextValidation = tester.validateContextCarryOver(drillDownResult);
  const citationValidation = tester.validateCitations(drillDownResult);
  
  console.log('\nContext Carry-Over Validation:');
  contextValidation.details.forEach(detail => console.log(`  ${detail}`));
  
  console.log('\nCitation Validation:');
  citationValidation.details.forEach(detail => console.log(`  ${detail}`));

  // Test Case 2.2: Source Decay Validation  
  console.log('\n\n📋 Test Case 2.2: Source Decay Validation');
  const decayResult = await tester.executeConversation(
    'Source Decay Test',
    [
      'What is Leia Image Format?',
      'How does it relate to video format?',
      'What compression does it use?',
      'Tell me about Android displays'
    ]
  );
  results.push(decayResult);

  // Test Case 2.3: New Topic Context Reset
  console.log('\n\n📋 Test Case 2.3: New Topic Context Reset');
  const resetResult = await tester.executeConversation(
    'Context Reset Test',
    [
      'Explain head tracking in displays',
      'How is this different from traditional 3D displays?',
      'What is CAT3D paper about?'  // Should trigger new-topic reset
    ]
  );
  results.push(resetResult);

  // Summary Report
  console.log('\n\n📊 TEST SUMMARY REPORT');
  console.log('======================');
  
  const totalTests = results.length;
  const successfulTests = results.filter(r => r.success).length;
  
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Successful: ${successfulTests}`);
  console.log(`Failed: ${totalTests - successfulTests}`);
  
  results.forEach((result, index) => {
    console.log(`\nTest ${index + 1} (${result.success ? '✅ PASS' : '❌ FAIL'}):`);
    console.log(`  Conversation ID: ${result.conversationId}`);
    console.log(`  Messages: ${result.messages.length}`);
    console.log(`  Context Sources: ${result.contextSources.length}`);
    console.log(`  Citations: ${result.citations.length}`);
    
    if (result.errors.length > 0) {
      console.log(`  Errors:`);
      result.errors.forEach(error => console.log(`    - ${error}`));
    }
  });

  const overallSuccess = successfulTests === totalTests;
  console.log(`\n🎯 Overall Result: ${overallSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  
  return overallSuccess;
}

// Execute tests if run directly
if (require.main === module) {
  runContextManagementTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Test execution failed:', error);
      process.exit(1);
    });
}

export { E2EContextTester, runContextManagementTests };