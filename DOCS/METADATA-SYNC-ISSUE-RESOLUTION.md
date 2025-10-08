# Metadata Synchronization Issue - Root Cause & Resolution

## Issue Summary

Documents extracted before commit `302ee68` (metadata standardization) had `NULL` values for `source_url` and `date` in the database, even though the metadata was present in the markdown frontmatter.

## Root Cause

### The Bug (Fixed in commit `302ee68`)

**Before the fix** (`documentStorage.ts` lines 105-106):
```typescript
date: frontmatter.date || null,
source_url: frontmatter.source_url || null,
```

**Problem**: Only looked for TOP-LEVEL fields, but documents were using STRUCTURED format:
- `frontmatter.identifiers.source_url` (not `frontmatter.source_url`)
- `frontmatter.dates.created` (not `frontmatter.date`)

**Result**: Database got `NULL` values because the extraction code couldn't find the metadata in the expected location.

### The Fix (Current code)

**After the fix** (`documentStorage.ts` lines 89-97):
```typescript
const primaryDate = frontmatter.dates?.created ||
                   frontmatter.dates?.published ||
                   frontmatter.dates?.filing ||
                   frontmatter.date ||
                   null;

const primarySourceUrl = frontmatter.identifiers?.source_url ||
                        frontmatter.source_url ||
                        null;
```

**Solution**: Properly extracts from structured fields with fallback to old top-level fields.

## Impact

### Documents Affected
- Any documents extracted BEFORE commit `302ee68` (Oct 8, 2025)
- Approximately 16 documents had missing metadata

### Symptoms
1. ❌ Citations missing clickable links (no `source_url`)
2. ❌ Date field empty in DocumentMetadataEditor
3. ✅ Metadata WAS present in frontmatter (just not synced to DB)

## Resolution

### 1. Immediate Fix (Completed)
Created and ran migration script: `scripts/sync-metadata-to-db.ts`

**Results**:
- ✅ 3 source URLs synced
- ✅ 8 dates synced
- ✅ 0 errors

### 2. Permanent Fix (Already in place)
The extraction code in `documentStorage.ts` now correctly:
1. Extracts from structured fields (`identifiers.source_url`, `dates.created`, etc.)
2. Falls back to old top-level fields for backward compatibility
3. Populates BOTH database columns AND structured JSONB fields

### 3. Future Prevention

**For new documents**:
- ✅ Extraction code is fixed
- ✅ All new documents will have metadata synced correctly

**For old documents**:
- Run `scripts/sync-metadata-to-db.ts` if you encounter more documents with missing metadata
- Usage:
  ```bash
  NEXT_PUBLIC_SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> pnpm tsx scripts/sync-metadata-to-db.ts
  ```

## Verification

To verify the fix is working for new documents:

1. Extract a new document with structured metadata:
   ```yaml
   ---
   identifiers:
     source_url: "https://example.com"
   dates:
     created: "2025-01-01"
   ---
   ```

2. Check database:
   ```sql
   SELECT id, source_url, date FROM docs WHERE id = 'your-doc-id';
   ```

3. Expected result:
   - ✅ `source_url` = "https://example.com"
   - ✅ `date` = "2025-01-01"

## Related Files

- `/src/lib/rag/storage/documentStorage.ts` - Main extraction logic (FIXED)
- `/scripts/sync-metadata-to-db.ts` - Migration script for old documents
- `/DOCS/METADATA-STANDARDIZATION-SUMMARY.md` - Overall metadata strategy
- `/DOCS/SOURCE-URL-FLOW.md` - Data flow documentation

## Conclusion

✅ **Root cause fixed**: Extraction code now properly handles structured metadata
✅ **Old documents migrated**: Ran sync script to update existing documents
✅ **Future prevention**: New documents will be extracted correctly
✅ **No code changes needed**: The fix was already implemented in commit `302ee68`
