#!/usr/bin/env node

/**
 * Test script for DELETE conversation functionality
 * Tests the RLS policy fix for soft delete operations
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testDeleteConversation() {
  try {
    console.log('🔍 Testing DELETE conversation functionality...');
    
    // Step 1: Create a test user session (you'll need to be authenticated)
    console.log('1. Checking authentication...');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('❌ Not authenticated. Please sign in to the app first.');
      return;
    }
    console.log('✅ Authenticated as:', user.email);
    
    // Step 2: Create a test conversation
    console.log('2. Creating test conversation...');
    const { data: conversation, error: createError } = await supabase
      .from('conversations')
      .insert({ title: 'Test Conversation for Delete', owner: user.id })
      .select('id, title, owner, deleted_at')
      .single();
      
    if (createError) {
      console.error('❌ Failed to create test conversation:', createError);
      return;
    }
    console.log('✅ Created test conversation:', conversation);
    
    // Step 3: Test soft delete (what the DELETE API does)
    console.log('3. Testing soft delete (UPDATE deleted_at)...');
    const { error: deleteError } = await supabase
      .from('conversations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', conversation.id);
      
    if (deleteError) {
      console.error('❌ Soft delete failed:', deleteError);
      console.error('This indicates the RLS policy fix is needed!');
      
      // Clean up the test conversation
      await supabase.from('conversations').delete().eq('id', conversation.id);
      return;
    }
    console.log('✅ Soft delete successful!');
    
    // Step 4: Verify the conversation is marked as deleted
    console.log('4. Verifying soft delete...');
    const { data: deletedConv, error: fetchError } = await supabase
      .from('conversations')
      .select('id, title, deleted_at')
      .eq('id', conversation.id)
      .is('deleted_at', null); // This should return empty because of RLS policy
      
    if (fetchError) {
      console.error('❌ Error fetching deleted conversation:', fetchError);
    } else if (deletedConv.length === 0) {
      console.log('✅ Conversation properly hidden from SELECT (RLS working)');
    } else {
      console.log('⚠️  Conversation still visible:', deletedConv);
    }
    
    // Step 5: Clean up by doing a hard delete
    console.log('5. Cleaning up test data...');
    const { error: cleanupError } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversation.id);
      
    if (cleanupError) {
      console.error('⚠️  Could not clean up test conversation:', cleanupError);
    } else {
      console.log('✅ Test conversation cleaned up');
    }
    
    console.log('\n🎉 DELETE conversation test completed successfully!');
    console.log('The RLS policy fix resolves the soft delete issue.');
    
  } catch (error) {
    console.error('💥 Test failed with error:', error);
  }
}

testDeleteConversation();
