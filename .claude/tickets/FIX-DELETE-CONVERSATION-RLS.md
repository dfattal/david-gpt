# FIX-DELETE-CONVERSATION-RLS

**Agent**: backend-developer  
**Priority**: P0 (Critical - Blocking Core Feature)  
**Status**: todo

## Problem Statement
Delete conversation functionality is completely broken due to Row Level Security policy violations:
```
Failed to delete conversation: new row violates row-level security policy for table "conversations"
```

## Root Cause Analysis
- Delete button clicks are registered correctly
- DELETE API requests are sent to correct endpoints
- **FAILS** with 500 errors due to RLS policy blocking DELETE operations
- Conversations remain in sidebar despite delete attempts

## Technical Details from Testing
```
DELETE /api/conversations/c5bfbaf1-3fa2-497d-9a59-fa589e68021a 500 in 732ms
DELETE /api/conversations/6ec34ad0-d439-43b7-a325-3090d3d32c84 500 in 593ms
Failed to delete conversation: {
  code: '42501',
  details: null,
  hint: null,
  message: 'new row violates row-level security policy for table "conversations"'
}
```

## Investigation Required
1. **Review RLS Policies**: Check current DELETE policies on conversations table
2. **Authentication Context**: Verify user authentication in DELETE operations
3. **Policy Logic**: Ensure DELETE policies allow owners to delete their conversations
4. **Soft Delete**: Determine if using soft delete (setting deleted_at) or hard delete

## Expected Deliverables
- [ ] Fix RLS policies to allow conversation owners to delete their conversations
- [ ] Verify DELETE API endpoint works correctly
- [ ] Test delete functionality from sidebar
- [ ] Ensure deleted conversations disappear from sidebar
- [ ] Add proper error handling for delete failures
- [ ] Test with multiple conversation deletions

## Database Schema Context
Current conversations table structure:
- `owner uuid not null references auth.users(id)`
- `deleted_at timestamptz` (suggests soft delete pattern)
- RLS policies should allow `owner = auth.uid()` for DELETE operations

## Definition of Done
- Users can successfully delete their own conversations
- Deleted conversations disappear from sidebar immediately
- No RLS policy violation errors
- DELETE API endpoints return 200 status
- Proper error messages for failed deletes (if any edge cases)

## Dependencies
- Database schema deployed (✅ completed)
- Authentication working (✅ completed)

## Time Estimate
2-3 hours