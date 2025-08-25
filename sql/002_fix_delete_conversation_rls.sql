-- Migration: Fix DELETE conversation RLS policy issue
-- Issue: DELETE /api/conversations/[id] fails with RLS violation
-- Root Cause: UPDATE policy missing 'with check' clause for soft delete operations
-- Date: 2025-08-25

-- Fix the RLS UPDATE policy for conversations to allow soft delete
-- This is required because DELETE API does soft delete via UPDATE deleted_at
drop policy if exists conv_update_owner on public.conversations;
create policy conv_update_owner
on public.conversations for update
using (owner = auth.uid())
with check (owner = auth.uid());

-- Verify the policy was created correctly
SELECT 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd, 
  qual, 
  with_check
FROM pg_policies 
WHERE tablename = 'conversations' AND cmd = 'UPDATE';
