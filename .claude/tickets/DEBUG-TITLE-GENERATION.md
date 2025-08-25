# DEBUG-TITLE-GENERATION

**Agent**: ai-integrations  
**Priority**: P1 (High)  
**Status**: todo

## Problem Statement
Title generation is not working as expected:
- Conversation titles remain as "New chat" despite multiple message exchanges
- Background title generation not triggering after assistant responses
- No visible indication that title generation is working

## Investigation Required
1. **Title Generation Trigger**: Verify background title generation after first assistant response
2. **API Endpoint**: Test POST /api/conversations/[id]/title endpoint
3. **Status Updates**: Check title_status field updates in database
4. **Frontend Integration**: Verify title refresh mechanism

## Expected Deliverables
- [ ] Debug title generation API endpoint
- [ ] Verify trigger mechanism after assistant responses
- [ ] Check database title_status field updates
- [ ] Test title generation with different conversation lengths
- [ ] Implement proper error handling for title generation failures
- [ ] Add loading states for title generation
- [ ] Test title format validation (3-6 word Title Case)
- [ ] Verify non-blocking background processing

## Technical Investigation
- Check David Fattal persona-specific prompts for title generation
- Verify GPT-4 integration for title generation
- Test retry logic and error handling
- Review title generation utilities library

## Definition of Done
- Titles automatically generate after first assistant response
- Title status updates work correctly
- Frontend shows proper title updates
- Error handling works for failed title generation
- Title format meets specification (3-6 word Title Case)

## Dependencies
- Conversation management fixes (DEBUG-CONVERSATION-MANAGEMENT)
- Backend API endpoints (working)

## Time Estimate
2-3 hours