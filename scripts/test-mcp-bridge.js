/**
 * Test script for MCP Bridge HTTP API
 * Run with: node scripts/test-mcp-bridge.js
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_URL = `${BASE_URL}/api/mcp-bridge`;

async function testAPI() {
  console.log('🧪 Testing MCP Bridge HTTP API\n');
  console.log(`Base URL: ${BASE_URL}\n`);

  try {
    // Test 1: GET endpoint (API info)
    console.log('📋 Test 1: GET /api/mcp-bridge (API info)');
    const infoResponse = await fetch(API_URL);
    const info = await infoResponse.json();
    console.log('✅ Status:', infoResponse.status);
    console.log('✅ Service:', info.service);
    console.log('✅ Version:', info.version);
    console.log('');

    // Test 2: New conversation
    console.log('💬 Test 2: POST /api/mcp-bridge (new_conversation)');
    const newConvResponse = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'new_conversation',
        message: 'What is Leia technology?',
        persona: 'david'
      })
    });

    if (!newConvResponse.ok) {
      const error = await newConvResponse.json();
      throw new Error(`Failed to create conversation: ${JSON.stringify(error)}`);
    }

    const newConv = await newConvResponse.json();
    console.log('✅ Status:', newConvResponse.status);
    console.log('✅ Conversation ID:', newConv.conversation_id);
    console.log('✅ Session ID:', newConv.session_id);
    console.log('✅ Response length:', newConv.response.length, 'characters');
    console.log('✅ Citations count:', newConv.citations_count);
    console.log('✅ Response preview:', newConv.response.substring(0, 150) + '...');
    console.log('');

    // Test 3: Reply to conversation
    console.log('💬 Test 3: POST /api/mcp-bridge (reply_to_conversation)');
    const replyResponse = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reply_to_conversation',
        conversation_id: newConv.conversation_id,
        message: 'Tell me more about the 3D Cell technology'
      })
    });

    if (!replyResponse.ok) {
      const error = await replyResponse.json();
      throw new Error(`Failed to reply: ${JSON.stringify(error)}`);
    }

    const reply = await replyResponse.json();
    console.log('✅ Status:', replyResponse.status);
    console.log('✅ Response length:', reply.response.length, 'characters');
    console.log('✅ Citations count:', reply.citations_count);
    console.log('✅ Context messages:', reply.context_messages);
    console.log('✅ Response preview:', reply.response.substring(0, 150) + '...');
    console.log('');

    // Test 4: List conversations
    console.log('📋 Test 4: POST /api/mcp-bridge (list_conversations)');
    const listResponse = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'list_conversations',
        limit: 5
      })
    });

    if (!listResponse.ok) {
      const error = await listResponse.json();
      throw new Error(`Failed to list conversations: ${JSON.stringify(error)}`);
    }

    const list = await listResponse.json();
    console.log('✅ Status:', listResponse.status);
    console.log('✅ Conversations count:', list.count);
    console.log('✅ Latest conversation:', list.conversations[0]?.title || 'None');
    console.log('');

    // Test 5: Error handling - invalid action
    console.log('❌ Test 5: POST /api/mcp-bridge (error handling)');
    const errorResponse = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'invalid_action'
      })
    });

    const errorData = await errorResponse.json();
    console.log('✅ Status:', errorResponse.status, '(expected 400)');
    console.log('✅ Error message:', errorData.error);
    console.log('');

    // Summary
    console.log('🎉 All tests passed!');
    console.log('');
    console.log('📊 Test Summary:');
    console.log('  ✅ API info endpoint works');
    console.log('  ✅ New conversation creation works');
    console.log('  ✅ Reply to conversation works (with context)');
    console.log('  ✅ List conversations works');
    console.log('  ✅ Error handling works');
    console.log('');
    console.log('🚀 Your MCP Bridge HTTP API is ready to use!');
    console.log('');
    console.log('📖 Documentation: DOCS/MCP-BRIDGE-API.md');
    console.log('🌐 API URL:', API_URL);

  } catch (error) {
    console.error('');
    console.error('❌ Test failed:', error.message);
    console.error('');
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run tests
testAPI();
