# Slack + MCP Integration Attempt Summary

**Date**: 2025-10-12 to 2025-10-14
**Status**: Rolled back - Starting fresh
**Commits**: `b63791f` (pre-Slack) → `291ce52` (reverted)

## Overview

This document summarizes the Slack and MCP integration attempt that was rolled back. The code changes were reverted to commit `2fc8630`, but **database migrations were applied and persist in Supabase**.

## Database Migrations Applied (IRREVERSIBLE)

These migrations were applied to the Supabase database and **persist after code rollback**:

### 1. Slack Integration Migration
**File**: `supabase/migrations/20250112_slack_integration.sql`

Added to `conversations` table:
- `slack_user_id TEXT`
- `slack_team_id TEXT`
- `slack_channel_id TEXT`
- `slack_thread_ts TEXT`
- `slack_user_info JSONB`

Indexes:
- `idx_conversations_slack_thread`
- `idx_conversations_slack_user`

**Impact**: Safe to leave - won't affect non-Slack usage.

### 2. MCP Integration Migration
**File**: `supabase/migrations/20250XXX_mcp_integration.sql`

New tables:
- `mcp_api_keys` - API key management
- `mcp_usage_logs` - Usage analytics
- `mcp_api_key_stats` (view) - Statistics

**Impact**: New tables created. Safe to leave.

### 3. MCP User Tracking Migration
**File**: `supabase/migrations/20250XXX_mcp_user_tracking.sql`

Added to `conversations` table:
- `mcp_api_key_id UUID`
- `mcp_client_info JSONB`
- `mcp_user_id UUID`

New table:
- `mcp_users` - Individual MCP users

**⚠️ IMPORTANT CONSTRAINT**:
```sql
ALTER TABLE conversations ADD CONSTRAINT check_conversation_has_source
CHECK (
  user_id IS NOT NULL OR
  slack_user_id IS NOT NULL OR
  mcp_api_key_id IS NOT NULL
);
```

**Impact**: This constraint may affect conversation creation if none of these fields are set.

## Complete Database Rollback Script

If needed, run this to remove all Slack/MCP schema changes:

```sql
-- Remove MCP user tracking
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS check_conversation_has_source;
DROP VIEW IF EXISTS mcp_user_stats;
ALTER TABLE conversations DROP COLUMN IF EXISTS mcp_api_key_id;
ALTER TABLE conversations DROP COLUMN IF EXISTS mcp_client_info;
ALTER TABLE conversations DROP COLUMN IF EXISTS mcp_user_id;
DROP TABLE IF EXISTS mcp_users CASCADE;

-- Remove MCP integration
DROP VIEW IF EXISTS mcp_api_key_stats;
DROP TABLE IF EXISTS mcp_usage_logs CASCADE;
DROP TABLE IF EXISTS mcp_api_keys CASCADE;

-- Remove Slack integration
DROP INDEX IF EXISTS idx_conversations_slack_thread;
DROP INDEX IF EXISTS idx_conversations_slack_user;
ALTER TABLE conversations DROP COLUMN IF EXISTS slack_user_id;
ALTER TABLE conversations DROP COLUMN IF EXISTS slack_team_id;
ALTER TABLE conversations DROP COLUMN IF EXISTS slack_channel_id;
ALTER TABLE conversations DROP COLUMN IF EXISTS slack_thread_ts;
ALTER TABLE conversations DROP COLUMN IF EXISTS slack_user_info;
```

## Environment Variables (Vercel)

These persist in Vercel production - remove manually if not needed:
- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`
- `SLACK_APP_TOKEN`
- `SLACK_SKIP_VERIFICATION`
- `NEXT_PUBLIC_APP_URL`

## Vercel Pro Upgrade

Account upgraded to Vercel Pro ($20/month) for extended serverless timeouts.

Consider if still needed after rollback.

## Key Learnings

1. **Chat API is slow**: ~13 seconds for RAG query (exceeds free tier 10s timeout)
2. **Vercel Pro needed** for queries > 10 seconds
3. **Async patterns have limits**: Background operations still killed with parent function
4. **Architecture was too complex**: Multiple iterations, split handlers, unclear flow

## Recommendations for Next Attempt

1. **Use Slack Slash Commands** instead of Events API (simpler, longer timeouts)
2. **Optimize chat API** to < 10 seconds (faster model, fewer results, skip reranking)
3. **Simpler architecture**: Single handler, reuse `/api/chat`, thin Slack wrapper
4. **Test iteratively**: Deploy after small changes, not big refactors

## What Was Removed

All Slack/MCP code files were removed by the reset:
- `src/app/api/slack/*` - Slack handlers
- `src/lib/slack/*` - Slack utilities
- Various documentation files (`SLACK-*.md`)

Database schema changes remain and are documented above.

---

**Next steps**: Start fresh with optimized approach based on learnings.
