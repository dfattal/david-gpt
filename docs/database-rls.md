# Database Row Level Security (RLS) Documentation

## Overview

The David-GPT database uses Supabase's Row Level Security to ensure users can only access their own conversations and messages. This provides data isolation at the database level.

## auth.uid() Function

- `auth.uid()` returns the UUID of the currently authenticated user from Supabase Auth
- Returns `null` for unauthenticated requests (which will fail RLS checks)
- Automatically extracted from the JWT token in the Authorization header

## RLS Policies Implemented

### Conversations Table

1. **conv_select_owner**: Users can SELECT only their own non-deleted conversations
   - Filters by: `owner = auth.uid() AND deleted_at IS NULL`
   - Soft delete support: deleted conversations are hidden

2. **conv_ins_owner**: Users can INSERT conversations only for themselves
   - Enforces: `owner = auth.uid()`

3. **conv_update_owner**: Users can UPDATE only their own conversations
   - Filters by: `owner = auth.uid()`

### Messages Table

1. **msg_select_by_owner**: Users can SELECT messages only from their own conversations
   - Uses EXISTS subquery to verify conversation ownership and non-deletion
   - Prevents access to messages from other users' conversations

2. **msg_insert_by_owner**: Users can INSERT messages only into their own conversations
   - Uses EXISTS subquery to verify conversation ownership and non-deletion
   - Prevents inserting messages into other users' conversations

## Security Guarantees

- **Data Isolation**: Each user can only see their own data
- **Soft Delete Protection**: Deleted conversations and their messages are hidden
- **Foreign Key Integrity**: Messages can only be added to existing, owned conversations
- **Authentication Required**: All operations require a valid Supabase session

## Performance Considerations

- Index `conv_owner_updated_idx` optimizes conversation queries by owner
- Index `msg_conv_created_idx` optimizes message queries within conversations
- RLS policies use indexes effectively to minimize query overhead