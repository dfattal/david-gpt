/**
 * Direct test of DELETE conversation API
 */
// Using built-in fetch in Node.js 18+

async function testDeleteConversation() {
  const baseUrl = 'http://localhost:3000';
  
  try {
    console.log('🧪 Testing DELETE conversation API directly...\n');
    
    // First, get the list of conversations to find one to delete
    console.log('1. Fetching conversations list...');
    const listResponse = await fetch(`${baseUrl}/api/conversations`);
    
    if (!listResponse.ok) {
      console.error('❌ Failed to fetch conversations:', listResponse.status, await listResponse.text());
      return;
    }
    
    const conversations = await listResponse.json();
    console.log(`✅ Found ${conversations.length} conversations`);
    
    if (conversations.length === 0) {
      console.log('ℹ️  No conversations to delete');
      return;
    }
    
    // Pick the first conversation to delete
    const conversationToDelete = conversations[0];
    console.log(`\n2. Attempting to delete conversation: ${conversationToDelete.id} ("${conversationToDelete.title}")`);
    
    // Attempt to delete
    const deleteResponse = await fetch(`${baseUrl}/api/conversations/${conversationToDelete.id}`, {
      method: 'DELETE'
    });
    
    console.log(`\n3. DELETE Response Status: ${deleteResponse.status}`);
    
    if (deleteResponse.ok) {
      const result = await deleteResponse.json();
      console.log('✅ DELETE Success:', result);
      
      // Verify it's gone from the list
      console.log('\n4. Verifying conversation is deleted...');
      const verifyResponse = await fetch(`${baseUrl}/api/conversations`);
      const updatedConversations = await verifyResponse.json();
      
      const stillExists = updatedConversations.find(c => c.id === conversationToDelete.id);
      if (stillExists) {
        console.log('❌ Conversation still exists in list after delete');
      } else {
        console.log('✅ Conversation successfully removed from list');
      }
      
    } else {
      const errorText = await deleteResponse.text();
      console.log('❌ DELETE Failed:', errorText);
    }
    
  } catch (error) {
    console.error('💥 Test failed with error:', error);
  }
}

testDeleteConversation();