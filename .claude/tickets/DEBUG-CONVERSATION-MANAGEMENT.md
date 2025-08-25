# DEBUG-CONVERSATION-MANAGEMENT

**Agent**: backend-developer  
**Priority**: P0 (Critical)  
**Status**: todo

## Problem Statement
Conversation management is completely broken. Testing reveals:
- Conversations don't appear in sidebar despite successful chat interactions
- "New" button produces 401 authentication errors
- Users cannot see chat history or switch between conversations

## Root Cause Investigation Required
1. **API Endpoint Issues**: Check all conversation CRUD endpoints
2. **RLS Policy Problems**: Verify Supabase Row Level Security policies
3. **Authentication Errors**: Debug 401 errors in conversation management
4. **Database Queries**: Verify conversation creation and retrieval logic

## Expected Deliverables
- [ ] Fix conversation creation (POST /api/conversations)
- [ ] Fix conversation retrieval (GET /api/conversations) 
- [ ] Debug and resolve 401 authentication errors
- [ ] Verify RLS policies are working correctly
- [ ] Test conversation sidebar population
- [ ] Test "New" conversation button functionality
- [ ] Ensure conversation persistence works end-to-end

## Definition of Done
- Conversations appear in sidebar after chat interactions
- "New" button creates new conversations without errors
- Users can switch between multiple conversations
- All conversation CRUD operations work without 401 errors

## Dependencies
- Database schema (completed)
- Authentication system (completed)

## Time Estimate
4-6 hours