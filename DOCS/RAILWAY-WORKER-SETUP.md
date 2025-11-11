# Railway Worker Service Deployment Guide

This guide walks you through deploying the document extraction worker service on Railway.

## Overview

The worker service processes background jobs for:
- PDF document extraction
- URL content extraction
- Markdown processing
- Document re-ingestion
- Batch processing

## Prerequisites

- ✅ Railway account (upgraded from trial)
- ✅ Redis configured (Upstash)
- ✅ Existing mcp-server service running
- ✅ Supabase credentials
- ✅ OpenAI API key

## Step-by-Step Deployment

### Step 1: Create New Service in Railway

1. **Go to Railway Dashboard**
   - Visit https://railway.app/dashboard
   - Select your **david-gpt** project

2. **Add New Service**
   - Click **"New"** button (top right)
   - Select **"GitHub Repo"**
   - Choose your **david-gpt** repository
   - Click **"Add Service"** or **"Deploy"**

3. **Configure Service Name**
   - Railway will ask for a service name
   - Enter: `david-gpt-worker`
   - Click **"Deploy"**

### Step 2: Set Environment Variables

The worker needs these environment variables. You can copy most from your **mcp-server** service.

**Critical Variables:**

```bash
# Worker identifier (tells start.sh to run worker)
RAILWAY_SERVICE_NAME=david-gpt-worker

# Redis connection (Upstash)
REDIS_URL=rediss://default:AYy8AAIncDI4ZDE1OWEzZmJlODg0NzlkOTYyOTI3ZTdmMDljYmU3N3AyMzYwMjg@frank-duckling-36028.upstash.io:6379

# Supabase (copy from mcp-server)
NEXT_PUBLIC_SUPABASE_URL=https://mnjrwjtzfjfixdjrerke.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# OpenAI (copy from mcp-server)
OPENAI_API_KEY=sk-proj-...

# App URL (copy from mcp-server)
NEXT_PUBLIC_APP_URL=https://david-gpt-orpin.vercel.app

# Optional: Cohere for reranking (copy from mcp-server if you have it)
COHERE_API_KEY=...
```

**How to Add Variables:**

1. In Railway, click on your **david-gpt-worker** service
2. Go to **"Variables"** tab
3. Click **"New Variable"** for each one:
   - Variable name: `RAILWAY_SERVICE_NAME`
   - Variable value: `david-gpt-worker`
   - Click **"Add"**
4. Repeat for all variables above

**Quick Copy from mcp-server:**

Alternatively, you can copy variables in bulk:
1. Go to **mcp-server** service → **Variables**
2. Copy the values you need
3. Paste them into **david-gpt-worker** → **Variables**

### Step 3: Verify Deployment Configuration

Railway should automatically detect your configuration:

**Build Settings:**
- Builder: Nixpacks (from `railway.json`)
- Build Command: Auto-detected from `package.json`

**Deploy Settings:**
- Start Command: `./start.sh` (from `railway.json`)
- Restart Policy: ON_FAILURE
- Max Retries: 10

The `start.sh` script will detect `RAILWAY_SERVICE_NAME=david-gpt-worker` and run:
```bash
pnpm worker
```

Which executes:
```bash
tsx src/lib/queue/workers/start-worker.ts
```

### Step 4: Deploy and Monitor

1. **Trigger Deployment**
   - If not already deploying, click **"Deploy"** or **"Redeploy"**
   - Railway will:
     - Clone your repo
     - Install dependencies with pnpm
     - Run `./start.sh`
     - Start the worker process

2. **Watch the Logs**
   - Click on **"Deployments"** tab
   - Select the latest deployment
   - Click **"View Logs"**

**Expected Log Output:**
```
🚀 Starting service: david-gpt-worker
⚙️ Starting Worker...
🚀 Starting unified extraction worker...
🔌 Connected to Redis: frank-duckling-36028.upstash.io:6379
📊 Worker ready to process jobs
⏳ Waiting for jobs...
```

### Step 5: Verify Worker is Running

Once deployed, the worker should:
- ✅ Connect to Redis (Upstash)
- ✅ Connect to BullMQ queue
- ✅ Wait for jobs to process

**Check Worker Status:**

You can verify from your local machine:
```bash
pnpm check:worker
```

Expected output:
```
✅ Redis connection successful
✅ Queue initialized
✅ Found 1 active worker(s)
   Worker 1: david-gpt-worker
```

## Environment Variables Reference

### Required Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `RAILWAY_SERVICE_NAME` | Tells start.sh which service to run | `david-gpt-worker` |
| `REDIS_URL` | Redis connection (Upstash) | `rediss://default:***@frank-duckling-36028.upstash.io:6379` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API endpoint | `https://mnjrwjtzfjfixdjrerke.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin access | `eyJhbGciOiJIUzI1NiI...` |
| `OPENAI_API_KEY` | OpenAI for embeddings | `sk-proj-...` |
| `NEXT_PUBLIC_APP_URL` | Your Vercel app URL | `https://david-gpt-orpin.vercel.app` |

### Optional Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `COHERE_API_KEY` | Reranking search results | Not used if missing |
| `NODE_ENV` | Environment mode | `production` |
| `LOG_LEVEL` | Logging verbosity | `info` |

## Testing the Worker

### Test 1: Submit a Test Job

From your local machine or Vercel app:

```typescript
// Example: Submit a URL extraction job
import { getQueue } from '@/lib/queue/jobQueue';

const queue = getQueue();
await queue.add('url_single', {
  inputData: {
    url: 'https://example.com/article',
    personaSlug: 'david',
    userId: 'your-user-id'
  }
});
```

### Test 2: Monitor Job Processing

**In Railway Logs:**
```
🔄 Processing job 1 (type: url_single)
🌐 Fetching URL: https://example.com/article
📄 Extracted content: 1234 characters
✅ Job 1 completed successfully
```

**Using Health Check:**
```bash
pnpm check:worker
```

Expected output:
```
✅ Found 1 active worker(s)
✅ Recent completed jobs (last 1):
   • url_single (ID: 1) - 2025-10-15 12:34:56
```

## Troubleshooting

### Issue 1: Worker Not Starting

**Symptoms:**
- Logs show: "Unknown service: david-gpt-worker"
- Or: "Defaulting to worker..."

**Solution:**
- Verify `RAILWAY_SERVICE_NAME=david-gpt-worker` is set
- Check spelling exactly matches
- Redeploy the service

### Issue 2: Redis Connection Failed

**Symptoms:**
- Logs show: "Error: ECONNREFUSED"
- Or: "Redis connection error"

**Solution:**
1. Verify `REDIS_URL` is set correctly
2. Check Upstash Redis is active
3. Test connection locally: `pnpm check:worker`

### Issue 3: Supabase Errors

**Symptoms:**
- Logs show: "Invalid API key"
- Or: "Unauthorized"

**Solution:**
1. Verify `SUPABASE_SERVICE_ROLE_KEY` is set (not the anon key)
2. Check `NEXT_PUBLIC_SUPABASE_URL` is correct
3. Verify in Supabase dashboard → Settings → API

### Issue 4: Worker Crashes on Job

**Symptoms:**
- Worker restarts frequently
- Logs show job errors

**Solution:**
1. Check OpenAI API key is valid and has credits
2. Verify document URLs are accessible
3. Check Supabase storage permissions
4. Review error logs for specific issues

### Issue 5: No Jobs Being Processed

**Symptoms:**
- Worker is running but idle
- No jobs in queue

**This is normal!** The worker waits for jobs. Jobs are created when:
- You upload documents via the admin interface
- You submit URLs for processing
- You trigger batch ingestion

## Architecture After Deployment

```
┌─────────────────────────────────────────────────────────┐
│ RAILWAY PROJECT: david-gpt                              │
│                                                          │
│  Service 1: mcp-server                                  │
│  ├── Runs: pnpm mcp-sse-server                          │
│  ├── Port: 3001                                         │
│  └── Purpose: MCP SSE server for Claude.ai              │
│                                                          │
│  Service 2: david-gpt-worker (NEW)                      │
│  ├── Runs: pnpm worker                                  │
│  ├── No public port (background worker)                 │
│  └── Purpose: Process document extraction jobs          │
│                                                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ UPSTASH (External)                                      │
│  └── Redis: frank-duckling-36028.upstash.io             │
│     └── Used by: BullMQ job queue                       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ VERCEL (External)                                       │
│  └── Next.js App: david-gpt-orpin.vercel.app            │
│     └── Submits jobs to queue via API                   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ SUPABASE (External)                                     │
│  └── Database + Storage                                 │
│     └── Worker stores processed documents here          │
└─────────────────────────────────────────────────────────┘
```

## Cost Breakdown

After adding the worker service:

| Service | Provider | Cost |
|---------|----------|------|
| Redis | Upstash | Free (10K commands/day) |
| MCP Server | Railway | ~$5/month |
| Worker | Railway | ~$5/month |
| **Total** | | **~$10/month** |

## Monitoring and Maintenance

### Check Worker Health

Run periodically:
```bash
pnpm check:worker
```

### View Worker Logs

```bash
railway logs --service david-gpt-worker --follow
```

Or in Railway Dashboard:
- Select **david-gpt-worker** service
- Click **"Deployments"**
- Select latest deployment
- Click **"View Logs"**

### Monitor Resource Usage

In Railway Dashboard:
- CPU usage (should be low when idle)
- Memory usage (should be ~100-200 MB)
- Network traffic

### Restart Worker

If needed:
```bash
railway redeploy --service david-gpt-worker
```

Or in Railway Dashboard:
- Select **david-gpt-worker** service
- Click **"Redeploy"**

## Next Steps

After deployment:

1. ✅ Verify worker is running (check logs)
2. ✅ Test with a sample job
3. ✅ Monitor for a few hours
4. ✅ Use admin interface to ingest documents

## Support

If you encounter issues:

1. Check worker logs: `railway logs --service david-gpt-worker`
2. Run health check: `pnpm check:worker`
3. Verify all environment variables are set
4. Check Upstash Redis dashboard (should show connections)
5. Review this troubleshooting guide

---

**Deployment completed!** Your worker service should now be processing document extraction jobs in the background.
