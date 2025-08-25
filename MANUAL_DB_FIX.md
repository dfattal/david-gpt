# MANUAL DATABASE FIX REQUIRED

## Issue: DELETE Conversation RLS Policy Violation

**Status**: Critical bug blocking conversation deletion functionality
**Error**: `new row violates row-level security policy for table "conversations"` (code: 42501)

## Root Cause Analysis
The DELETE API endpoint performs soft delete by setting `deleted_at` field using an UPDATE query. However, the RLS policy `conv_update_owner` is missing the `with check` clause, which is required for UPDATE operations to validate that the updated row still meets security requirements.

## Fix Required
Run this SQL command in your Supabase SQL Editor to fix the RLS policy:

```sql
-- Fix the RLS UPDATE policy for conversations to allow soft delete
drop policy if exists conv_update_owner on public.conversations;
create policy conv_update_owner
on public.conversations for update
using (owner = auth.uid())
with check (owner = auth.uid());
```

## To Apply the Fix:

1. **Open Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Navigate to your project (mnjrwjtzfjfixdjrerke)

2. **Open SQL Editor**
   - Click on "SQL Editor" in the left sidebar
   - Click "New Query"

3. **Run the Fix**
   - Copy and paste the SQL above
   - Click "Run" to execute
   - Should see "Success. No rows returned" message

4. **Verify the Fix**
   - Run this query to confirm the policy was updated:
   ```sql
   SELECT tablename, policyname, cmd, qual, with_check
   FROM pg_policies 
   WHERE tablename = 'conversations' AND cmd = 'UPDATE';
   ```
   - Should show the policy with both `qual` (using clause) and `with_check` populated

## Test the Fix
After applying the database fix:

1. **Restart the development server** (if running)
2. **Test delete functionality**:
   - Login to the app
   - Create a test conversation
   - Try to delete it from the sidebar
   - Should succeed without 500 errors
   - Conversation should disappear from sidebar immediately

## Files Updated
- ✅ `sql/001_init.sql` - Fixed RLS policy with `with check` clause
- ✅ `.claude/contracts/db.md` - Updated contract to reflect fix
- ✅ `sql/002_fix_delete_conversation_rls.sql` - Migration script created
- ✅ `test-delete-conversation.js` - Test script for verification

## Success Criteria
- ✅ No more 42501 RLS policy violation errors
- ✅ DELETE API returns 200 status instead of 500
- ✅ Deleted conversations disappear from sidebar
- ✅ Users can successfully delete their own conversations
- ✅ RLS still prevents users from deleting other users' conversations

---

**IMPORTANT**: The database fix must be applied manually through the Supabase dashboard since CLI access is not available in this environment.
