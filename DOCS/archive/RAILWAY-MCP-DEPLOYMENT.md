# Railway MCP SSE Server Deployment Guide

This guide explains how to deploy the David-GPT MCP server with SSE transport to Railway, enabling Claude AI custom connectors to access your RAG system directly from claude.ai web interface.

## Overview

You already have Railway infrastructure set up for:
- ✅ Document extraction workers
- ✅ Redis server
- ✅ Background job processing

This guide adds a **new Railway service** to your existing project for the MCP SSE server.

## Architecture

```
Your Railway Project
├── Service 1: Document Workers (existing)
│   └── railway.json → runs "pnpm worker"
├── Service 2: Redis (existing)
│   └── Upstash or Railway Redis
└── Service 3: MCP SSE Server (NEW)
    └── railway-mcp.json → runs "pnpm mcp-sse-server"
```

All services share the same:
- Supabase database connection
- Environment variables
- Codebase (same git repo)

## Prerequisites

- ✅ Railway account (you have this)
- ✅ Existing Railway project with workers (you have this)
- ✅ Supabase credentials configured (you have this)
- ✅ Claude AI Pro/Max/Team/Enterprise account

## Step 1: Prepare Your Repository

The code is already prepared! You have:

- ✅ `src/mcp-server/sse-server.ts` - MCP server with SSE transport
- ✅ `railway-mcp.json` - Railway configuration for MCP service
- ✅ `package.json` - Script added: `"mcp-sse-server"`
- ✅ `express` dependency installed

Commit and push these changes:

```bash
git add .
git commit -m "feat: add MCP SSE server for Railway deployment"
git push origin main
```

## Step 2: Add MCP Service to Railway

### Option A: Using Railway CLI (Recommended)

```bash
# Install Railway CLI if you don't have it
npm i -g @railway/cli

# Login
railway login

# Link to your existing project
railway link

# Create new service from railway-mcp.json
railway up --service mcp-server --config railway-mcp.json

# Set environment variables (see Step 3)
railway variables set NEXT_PUBLIC_SUPABASE_URL="..." --service mcp-server
railway variables set SUPABASE_SERVICE_ROLE_KEY="..." --service mcp-server
railway variables set OPENAI_API_KEY="..." --service mcp-server
railway variables set NEXT_PUBLIC_APP_URL="http://localhost:3000" --service mcp-server
```

### Option B: Using Railway Dashboard

1. **Go to your Railway project dashboard**
   - Visit https://railway.app/dashboard
   - Select your existing project (the one with workers)

2. **Create a new service**
   - Click "New" → "GitHub Repo"
   - Select your repository
   - Railway will detect `railway-mcp.json` and `railway.json`

3. **Configure the service**
   - Name: `mcp-server`
   - Root Directory: `/` (leave default)
   - Start Command: `pnpm mcp-sse-server` (auto-detected from railway-mcp.json)

4. **Add environment variables** (see Step 3)

## Step 3: Configure Environment Variables

Your MCP SSE server needs the same environment variables as your workers.

### Required Variables

In Railway dashboard (Settings → Variables), add or verify:

```bash
# Supabase credentials (should already exist)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# OpenAI API key (should already exist)
OPENAI_API_KEY=sk-proj-...

# App URL - Set to localhost for MCP SSE server
# This tells the MCP server to call the Vercel-hosted chat API
NEXT_PUBLIC_APP_URL=https://david-gpt-orpin.vercel.app

# Optional: Cohere API key for reranking (if using)
COHERE_API_KEY=...
```

### Important: NEXT_PUBLIC_APP_URL Configuration

The MCP SSE server needs to call your Next.js chat API. Set this to your **Vercel deployment URL**:

```bash
NEXT_PUBLIC_APP_URL=https://david-gpt-orpin.vercel.app
```

This way:
- Claude.ai → Railway MCP SSE Server → Vercel Chat API → Supabase

### Verify Variables

In Railway, go to your **mcp-server** service and verify all variables are set correctly. You can copy them from your existing worker service.

## Step 4: Deploy and Test

### Deploy

Railway will automatically deploy after you:
1. Push code to GitHub
2. Add environment variables
3. Service should start automatically

### Check Deployment Logs

```bash
# Using Railway CLI
railway logs --service mcp-server

# Or in Railway dashboard:
# Select mcp-server service → Deployments → View Logs
```

Look for:
```
[MCP SSE] Server listening on port 3001
[MCP SSE] SSE endpoint: http://localhost:3001/sse
[MCP SSE] Health check: http://localhost:3001/health
[MCP SSE] Environment:
  - NEXT_PUBLIC_SUPABASE_URL: https://your-project...
  - SUPABASE_SERVICE_ROLE_KEY: [SET]
  - OPENAI_API_KEY: [SET]
  - NEXT_PUBLIC_APP_URL: https://david-gpt-orpin.vercel.app
```

### Test Health Endpoint

Railway will provide a public URL for your service (e.g., `https://mcp-server.railway.app`).

Test the health check:

```bash
curl https://your-mcp-service.railway.app/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "David-GPT MCP SSE Server",
  "transport": "SSE",
  "timestamp": "2025-10-15T..."
}
```

### Test SSE Connection

```bash
# Test SSE endpoint (should maintain connection)
curl -N https://your-mcp-service.railway.app/sse
```

You should see a persistent connection (doesn't close immediately).

## Step 5: Configure Claude AI Custom Connector

Now that your MCP SSE server is deployed on Railway, connect it to Claude.ai:

### 1. Get Your Railway Service URL

In Railway dashboard:
- Select your `mcp-server` service
- Copy the public URL (e.g., `https://mcp-server-production-abc123.up.railway.app`)

### 2. Add Custom Connector in Claude.ai

1. **Go to Claude.ai Settings**
   - Visit https://claude.ai/settings/connectors
   - (Requires Pro, Max, Team, or Enterprise plan)

2. **Click "Add Custom Connector"**

3. **Configure the connector:**
   - **Name**: `David-GPT RAG`
   - **Description**: `Query David's knowledge base about 3D displays, Leia technology, AI, and computer vision`
   - **Server URL**: `https://your-mcp-service.railway.app/sse`
   - **Authentication**: Leave blank (or add OAuth if you implement it)

4. **Enable the connector**

### 3. Test in Claude.ai

1. **Start a new conversation** in Claude.ai
2. **Click the "Search and tools" button** (brain icon)
3. **Enable "David-GPT RAG"** connector
4. **Ask a question**: "What is Leia technology?"

Claude should automatically use your connector to query the RAG system!

## Step 6: Verify Everything Works

### Test Flow

```
1. User asks question in claude.ai
   ↓
2. Claude detects it needs David-GPT knowledge
   ↓
3. Claude calls your Railway MCP SSE server
   ↓
4. MCP server calls Vercel chat API
   ↓
5. Chat API queries Supabase RAG database
   ↓
6. Response flows back with citations
   ↓
7. Claude presents answer to user
```

### Check Logs

**Railway MCP Server Logs:**
```bash
railway logs --service mcp-server --follow
```

Look for:
```
[MCP SSE] Tool called: new_conversation { message: 'What is Leia technology?' }
[MCP SSE] Creating conversation, session: sse-...
[MCP Chat] Calling chat API: https://david-gpt-orpin.vercel.app/api/chat
[MCP Chat] Response complete: { length: 1234, citations: 5 }
[MCP SSE] Conversation created: uuid-here
```

**Vercel Logs (Chat API):**
```bash
vercel logs --follow
```

Look for:
```
[MCP Chat] Received request from MCP client
[RAG] Searching for: Leia technology
[RAG] Found 10 chunks, returning top 5
[Chat API] Streaming response with citations
```

## Troubleshooting

### Issue 1: Service Won't Start

**Symptoms:**
- Railway shows "Deployment failed"
- Logs show missing dependencies

**Solution:**
```bash
# Make sure all dependencies are installed
pnpm install

# Commit lockfile
git add pnpm-lock.yaml
git commit -m "chore: update lockfile"
git push
```

### Issue 2: Environment Variables Not Set

**Symptoms:**
- Logs show `[MISSING]` for environment variables
- Supabase connection errors

**Solution:**
- Double-check all environment variables in Railway dashboard
- Make sure to copy from your existing worker service
- Restart the service after adding variables

### Issue 3: Can't Connect to Chat API

**Symptoms:**
- Logs show `ECONNREFUSED` or timeout errors
- `Chat API call failed` errors

**Solution:**
1. Verify `NEXT_PUBLIC_APP_URL` points to Vercel deployment
2. Make sure Vercel app is deployed and accessible
3. Test Vercel endpoint directly:
   ```bash
   curl https://david-gpt-orpin.vercel.app/api/chat
   ```

### Issue 4: Claude.ai Can't Connect

**Symptoms:**
- "Unable to connect to connector" error in Claude.ai
- SSE connection drops immediately

**Solution:**
1. Verify Railway service is running (check logs)
2. Test SSE endpoint manually:
   ```bash
   curl -N https://your-service.railway.app/sse
   ```
3. Check CORS settings (should allow claude.ai domain)
4. Verify Railway service has public URL enabled

### Issue 5: Queries Timeout

**Symptoms:**
- Claude shows loading indefinitely
- Logs show long-running queries

**Solution:**
1. Check RAG query performance (should be <10s)
2. Verify Cohere reranking is working
3. Check Supabase connection latency
4. Consider increasing timeout in sse-server.ts if needed

## Monitoring and Maintenance

### Railway Service Health

**Check service status:**
```bash
# Using Railway CLI
railway status --service mcp-server

# Or visit Railway dashboard
# Deployments tab shows uptime, memory, CPU
```

### Resource Usage

The MCP SSE server is lightweight:
- **Memory**: ~100-200 MB
- **CPU**: <5% average
- **Network**: Minimal (SSE + API calls)

### Costs

**Railway Pricing:**
- Hobby plan: $5/month (includes $5 usage credit)
- Pro plan: $20/month + usage

Your MCP SSE server should cost **~$2-5/month** in usage (depending on traffic).

Combined with your existing workers, total Railway cost: **$5-10/month**.

### Logs Retention

Railway keeps logs for:
- Recent: Last 7 days (free)
- Historical: Upgrade to Pro for longer retention

### Scaling

If you get high traffic:
1. Railway auto-scales (up to plan limits)
2. Consider adding Redis caching for frequent queries
3. Monitor response times in Railway dashboard

## Security Best Practices

### 1. Add Authentication (Recommended for Production)

Add OAuth or API key authentication to your MCP server:

```typescript
// src/mcp-server/sse-server.ts
app.use((req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.MCP_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});
```

Add `MCP_API_KEY` to Railway environment variables.

### 2. Restrict CORS Origins

Update CORS to only allow Claude.ai:

```typescript
// src/mcp-server/sse-server.ts
const ALLOWED_ORIGINS = [
  'https://claude.ai',
  'https://*.claude.ai',
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.some(allowed => /* match */)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  next();
});
```

### 3. Rate Limiting

Use existing Redis for rate limiting:

```bash
# Install rate limiting library
pnpm add express-rate-limit rate-limit-redis

# Configure in sse-server.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

const limiter = rateLimit({
  store: new RedisStore({
    client: redisClient, // Reuse your existing Redis
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
});

app.use(limiter);
```

### 4. Monitor for Abuse

Set up Railway alerts:
- High memory usage
- High CPU usage
- Deployment failures
- Unusual traffic patterns

## Comparison: Railway vs Vercel

| Feature | Railway (MCP SSE) | Vercel (HTTP API) |
|---------|------------------|-------------------|
| **Use in claude.ai** | ✅ Yes | ❌ No |
| **Use programmatically** | ❌ No | ✅ Yes |
| **Cost** | ~$5/month | Free (Hobby) |
| **Deployment** | Always-on server | Serverless |
| **Latency** | Low | Very low |
| **Setup** | Moderate | Simple |
| **Best for** | Claude.ai users | Developers |

## Both Approaches Together

**Best of both worlds:** Deploy both!

```
For claude.ai web users:
  User → Railway MCP SSE → Vercel Chat API → Supabase

For programmatic access (Python/JS apps):
  App → Vercel HTTP API → Supabase

For local development (Claude Code, Cursor):
  Tool → Local MCP stdio → Vercel/Local Chat API → Supabase
```

All three approaches:
- ✅ Share the same Supabase database
- ✅ Share the same RAG knowledge base
- ✅ Share the same conversation system
- ✅ Support multi-turn context
- ✅ Return cited responses

## Next Steps

### Immediate
1. ✅ Deploy MCP SSE server to Railway
2. ✅ Configure environment variables
3. ✅ Test health endpoint
4. ✅ Add custom connector in Claude.ai
5. ✅ Test with a query

### Optional Enhancements
- Add API key authentication
- Implement rate limiting
- Add request logging/analytics
- Set up monitoring alerts
- Create usage dashboard

### Advanced
- Add OAuth for Claude.ai connector
- Implement conversation history UI
- Add analytics and metrics
- Create admin API for managing connectors
- Deploy to multiple regions for lower latency

## Resources

- **Railway Documentation**: https://docs.railway.app/
- **MCP Specification**: https://modelcontextprotocol.io/
- **Claude Custom Connectors**: https://support.claude.com/en/articles/11175166
- **Code Reference**: `src/mcp-server/sse-server.ts`
- **HTTP API Alternative**: `DOCS/CLAUDE-AI-INTEGRATION.md`

## Support

If you encounter issues:

1. **Check Railway logs**: `railway logs --service mcp-server`
2. **Check Vercel logs**: `vercel logs --follow`
3. **Test health endpoint**: `curl https://your-service.railway.app/health`
4. **Verify environment variables** in Railway dashboard
5. **Check this documentation** for troubleshooting steps

---

**Status**: Ready to deploy! All code is prepared and tested locally.

**Deployment time**: ~10 minutes
**Cost**: ~$5/month (Railway Hobby plan)
**Maintenance**: Minimal (auto-deploys on git push)
