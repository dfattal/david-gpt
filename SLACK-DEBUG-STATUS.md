# Slack Bot Debugging - Current Status

## Latest Changes (Commit 352bab5)

### Improvements Made
1. **Added comprehensive logging** throughout the process handler
2. **Fixed error handling** - Properly store channel/threadTs before body parsing
3. **Added validation** for required fields (query, channel)
4. **Enhanced Slack postMessage** function with detailed logging
5. **Added success/error indicators** (✅/❌) for better visibility

### Key Logging Points

#### Process Handler (`/api/slack/process`)
- `[Slack Process] Processing request started` - Entry point
- `[Slack Process] Request parsed` - Shows query, channel, threadTs
- `[Slack Process] Calling chat API` - Before chat API call
- `[Slack Process] Chat API response` - Shows status, ok, statusText
- `[Slack Process] Streaming response from chat API` - During streaming
- `[Slack Process] Response complete` - Shows length and preview
- `[Slack Process] Creating Slack client` - Before Slack client creation
- `[Slack Process] Posting message to Slack` - Before posting
- `[Slack] Posting message` - Inside postMessage function
- `[Slack] Message posted successfully` - After successful post
- `[Slack Process] ✅ Successfully posted response to Slack` - Final success
- `[Slack Process] ❌ Error` - Any errors with full details

#### Events Handler (`/api/slack/events`)
- `[Slack Events] Received event` - Shows event type
- `[Slack Events] App mention received` - Shows channel, user, text
- `[Slack Events] Added eyes reaction` - After 👀 reaction
- `[Slack Events] Triggering process handler` - Shows URL
- `[Slack Events] Process handler triggered successfully` - Shows status, ok
- `[Slack Events] Event acknowledged` - Final acknowledgment

## Testing Instructions

### 1. Test in Slack
Go to your Slack workspace and send a message:
```
@David-GPT tell me about DLB tech
```

Expected behavior:
1. Bot adds 👀 reaction immediately
2. Bot posts answer in thread after ~10-30 seconds

### 2. Check Logs

#### Events Handler Logs
Look for logs starting with `[Slack Events]` to see:
- If the event was received
- If the 👀 reaction was added
- If the process handler was triggered successfully

#### Process Handler Logs
Look for logs starting with `[Slack Process]` to see:
- If the request was parsed correctly
- What the chat API response was
- If the response was streamed successfully
- If the message was posted to Slack

**IMPORTANT**: Process handler logs appear in a **separate Vercel function invocation**. You need to look for a separate log entry.

### 3. Direct API Test
You can test the process handler directly:

```bash
curl -X POST https://david-gpt-orpin.vercel.app/api/slack/process \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is DLB tech?",
    "channel": "C123456",
    "threadTs": "1234567890.123456",
    "messageTs": "1234567890.123456"
  }'
```

This should fail with a Slack API error (invalid channel), but you should see all the logging up to the "Posting message to Slack" step.

## Known Issues

### 1. Separate Log Streams
The process handler runs in a **separate Vercel function invocation**, so its logs don't appear in the same stream as the events handler.

**Solution**: Look for separate log entries with timestamps matching when you sent the Slack message.

### 2. Long Processing Time
The chat API takes ~10-30 seconds to respond, which is why we split the handlers.

### 3. Vercel Pro Required
The process handler needs `maxDuration = 60` which requires Vercel Pro plan ($20/month).

## What to Look For

### Success Indicators
- ✅ `[Slack Process] ✅ Successfully posted response to Slack`
- Message appears in Slack thread

### Failure Indicators
- ❌ `[Slack Process] ❌ Error` - Will show error details
- `[Slack] Failed to post message` - Slack API error
- `Chat API returned [status]` - Chat API error
- No logs from process handler at all - Function not triggered or timed out

## Next Steps

1. **Test in Slack** and share the logs
2. **Check both log streams** (events handler + process handler)
3. **Look for error indicators** (❌) or missing logs
4. Based on logs, we can identify the exact failure point

## Deployment Status
- ✅ Code deployed to Vercel production
- ✅ Events endpoint healthy: https://david-gpt-orpin.vercel.app/api/slack/events
- ✅ Latest commit: 352bab5 (comprehensive logging)
