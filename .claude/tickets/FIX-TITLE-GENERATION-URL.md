# FIX-TITLE-GENERATION-URL

**Agent**: ai-integrations  
**Priority**: P0 (Critical - Blocking Core Feature)  
**Status**: todo

## Problem Statement
Title generation is completely broken due to URL malformation error in Edge runtime:
```
URL is malformed "/api/conversations/[id]/title". Please use only absolute URLs
```

## Root Cause Analysis
- Title generation triggers correctly after first assistant response
- Background title generation starts successfully 
- **FAILS** when making API call with relative URL in Next.js Edge runtime
- All conversations stuck at "Generating title..." status indefinitely

## Technical Details from Testing
```
[Title Generation Trigger] Background title generation failed for conversation c5bfbaf1-3fa2-497d-9a59-fa589e68021a: 
Error: URL is malformed "/api/conversations/c5bfbaf1-3fa2-497d-9a59-fa589e68021a/title". 
Please use only absolute URLs
```

## Expected Deliverables
- [ ] Fix relative URL issue in title generation API call
- [ ] Use absolute URLs or proper Next.js API calling pattern
- [ ] Test title generation works end-to-end
- [ ] Verify titles update in sidebar after generation
- [ ] Ensure "Generating title..." status resolves properly
- [ ] Test with multiple conversations

## Technical Solution Options
1. **Use absolute URLs**: Construct full URL with base URL
2. **Use Next.js internal routing**: Use proper server-side API calling
3. **Fix Edge runtime compatibility**: Adjust API calling mechanism

## Definition of Done
- Titles generate automatically after first assistant response
- "Generating title..." status resolves to actual titles
- No URL malformation errors in console
- Sidebar shows proper conversation titles
- Title generation works consistently across conversations

## Dependencies
- Conversation management working (✅ completed)
- Backend API endpoints functional (✅ completed)

## Time Estimate
2-3 hours