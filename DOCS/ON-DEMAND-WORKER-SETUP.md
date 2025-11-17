# On-Demand Worker Setup Guide

This guide explains how to configure the david-gpt worker service to run **on-demand** instead of continuously, dramatically reducing Redis usage and staying within Upstash's free tier limits.

## Problem

BullMQ workers continuously poll Redis for new jobs, even when idle. This burns through Upstash's free tier limit (500k commands/month) in just a few days.

**Default Worker Behavior:**
- Polls Redis every few seconds: ~2.6M commands/month ❌
- Exceeds free tier by 5x

**On-Demand Worker Behavior:**
- Only runs when jobs exist: <10k commands/month ✅
- Stays well within free tier

---

## How It Works

### Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Upload    │─────▶│  Create Job  │─────▶│   Trigger   │
│  Document   │      │  (Redis +    │      │   Railway   │
│             │      │   Supabase)  │      │   Webhook   │
└─────────────┘      └──────────────┘      └─────────────┘
                                                   │
                                                   ▼
                          ┌──────────────────────────────┐
                          │  Railway Deploys Worker      │
                          │  (via Deploy Hook)           │
                          └──────────────────────────────┘
                                                   │
                                                   ▼
                          ┌──────────────────────────────┐
                          │  Worker Processes All Jobs   │
                          │  Then Exits (Queue Empty)    │
                          └──────────────────────────────┘
```

### Workflow

1. **Job Created**: When a user uploads a document, a job is created in Redis + Supabase
2. **Webhook Triggered**: The system POSTs to Railway's Deploy Hook
3. **Worker Starts**: Railway redeploys the worker service
4. **Jobs Processed**: Worker processes all queued jobs
5. **Worker Exits**: When queue is empty, worker exits gracefully
6. **Container Stops**: Railway stops the container (no idle polling!)

---

## Setup Instructions

### Step 1: Create Railway Deploy Hook

1. Go to [Railway Dashboard](https://railway.app)
2. Select your project → `david-gpt-worker` service
3. Click **Settings** → **Deploy**
4. Scroll to **Deploy Hooks** section
5. Click **Generate Deploy Hook**
6. Copy the webhook URL (looks like `https://webhooks.railway.app/deploy/xxxxx`)

### Step 2: Configure Environment Variables

Add the webhook URL to **both** Vercel and Railway:

#### Vercel (Production)
```bash
# Add in Vercel Dashboard → Settings → Environment Variables
RAILWAY_WORKER_WEBHOOK_URL=https://webhooks.railway.app/deploy/xxxxx
```

Then redeploy: `vercel --prod`

#### Railway (Worker Service)
```bash
# Add in Railway Dashboard → david-gpt-worker → Variables
RAILWAY_WORKER_WEBHOOK_URL=https://webhooks.railway.app/deploy/xxxxx
```

#### Local Development (.env.local)
```bash
# Optional - for testing locally
RAILWAY_WORKER_WEBHOOK_URL=https://webhooks.railway.app/deploy/xxxxx
```

### Step 3: Verify Configuration

The worker service should already be configured correctly (via `start.sh`):

```bash
# start.sh automatically uses on-demand worker
case "$SERVICE_NAME" in
  "david-gpt-worker")
    echo "⚙️ Starting On-Demand Worker..."
    exec pnpm worker:on-demand  # ✅ Correct
    ;;
esac
```

---

## Testing

### Test the Complete Flow

1. **Upload a Document**:
   - Go to https://david-gpt-orpin.vercel.app/admin
   - Upload a markdown file

2. **Verify Webhook Triggered**:
   - Check Vercel logs: Should see `🔔 Triggering Railway worker deployment...`
   - Check Railway: Should see new deployment starting

3. **Watch Worker Logs**:
   ```bash
   railway logs --service david-gpt-worker
   ```

   Expected output:
   ```
   🚀 Starting on-demand worker...
   📊 Queue status: 1 waiting, 0 active, 0 delayed
   🔥 Found 1 job(s) to process. Starting worker...
   🔄 Processing job abc123 (type: markdown_single)
   ✅ Job abc123 completed (1/1)
   ✅ All jobs processed! (1 completed, 0 failed)
   🛑 No more jobs in queue. Shutting down...
   ```

4. **Verify Container Stops**:
   - Railway dashboard should show container stopped after ~1 minute
   - This is **correct behavior** - worker exits when done!

### Local Testing

```bash
# 1. Create a test job (via admin UI or API)
# 2. Run on-demand worker locally
pnpm worker:on-demand

# Expected: Processes jobs and exits
```

---

## Monitoring

### Redis Usage

Monitor Upstash commands in the [Upstash Dashboard](https://console.upstash.com):

- **Before (Always-On Worker)**: 50k-100k commands/day ❌
- **After (On-Demand Worker)**: <500 commands/day ✅

### Worker Status

Check if worker is running:
```bash
railway logs --service david-gpt-worker --recent 50
```

If no jobs are queued, you should see:
```
✅ No jobs to process. Exiting gracefully.
```

This is **correct** - the worker should NOT be running when idle!

---

## Troubleshooting

### Issue: Worker Not Starting After Upload

**Symptoms**: Jobs stay in "pending" status, worker never starts

**Diagnosis**:
```bash
# 1. Check Vercel logs
vercel logs

# Look for:
🔔 Triggering Railway worker deployment...
✅ Worker deployment triggered successfully
```

**Solutions**:
- Verify `RAILWAY_WORKER_WEBHOOK_URL` is set in Vercel
- Check webhook URL is correct (test with `curl -X POST <url>`)
- Manually trigger deployment: Railway Dashboard → Deploy

---

### Issue: Worker Exits Too Early

**Symptoms**: Worker starts, then exits before processing all jobs

**Diagnosis**:
```bash
railway logs --service david-gpt-worker
```

**Possible Causes**:
- Jobs are in "delayed" state (check with `pnpm check:worker`)
- Worker timing out (increase safety timeout in `start-worker-on-demand.ts`)

**Solution**:
```typescript
// In start-worker-on-demand.ts, increase timeout:
setTimeout(async () => {
  console.log('⏰ Safety timeout reached (20 minutes). Shutting down...');
  await worker.close();
  process.exit(1);
}, 20 * 60 * 1000); // Changed from 10 to 20 minutes
```

---

### Issue: High Redis Usage Still

**Symptoms**: Upstash showing 10k+ commands/day even with on-demand worker

**Diagnosis**:
```bash
# Check if old always-on worker is still running
railway ps

# Check Upstash dashboard for command breakdown
```

**Solutions**:
1. Verify Railway is using `worker:on-demand` (not `worker`)
2. Check `start.sh` has correct command
3. Redeploy: `git push` (triggers Railway deployment)
4. Verify only one worker service exists (delete old deployments)

---

## Cost Comparison

| Configuration | Redis Commands/Month | Cost |
|--------------|---------------------|------|
| Always-On Worker (default) | 2.6M | $10/month (need paid Upstash) |
| Optimized Always-On | 1.2M | $10/month |
| **On-Demand Worker** | **<10k** | **FREE** ✅ |

---

## Advanced Configuration

### Custom Webhook (Non-Railway)

If you're using a different deployment platform, implement your own webhook:

```typescript
// src/lib/queue/jobQueue.ts
async function triggerWorkerDeployment(): Promise<void> {
  const webhookUrl = process.env.WORKER_WEBHOOK_URL;

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.WEBHOOK_SECRET}` },
    body: JSON.stringify({
      trigger: 'job_queued',
      timestamp: new Date().toISOString()
    }),
  });
}
```

### Health Checks

Add Railway health check to prevent premature restarts:

```bash
# Railway Settings → Healthcheck
HEALTHCHECK_PATH=/api/health
HEALTHCHECK_TIMEOUT=300
```

### Batch Processing

For batch uploads, the webhook is triggered once per job. To optimize:

```typescript
// Debounce webhook triggers within 5 seconds
let webhookTimer: NodeJS.Timeout | null = null;

async function triggerWorkerDeployment(): Promise<void> {
  if (webhookTimer) {
    clearTimeout(webhookTimer);
  }

  webhookTimer = setTimeout(async () => {
    // Actual webhook trigger
    await fetch(process.env.RAILWAY_WORKER_WEBHOOK_URL, { method: 'POST' });
    webhookTimer = null;
  }, 5000);
}
```

---

## Migration from Always-On Worker

If you're currently running the always-on worker, here's how to migrate:

1. **Update Code**:
   ```bash
   git pull origin main  # Get latest on-demand worker code
   ```

2. **Configure Webhook**:
   - Follow Step 1-2 above to set up deploy hook

3. **Deploy**:
   ```bash
   git push  # Triggers Railway deployment
   ```

4. **Verify**:
   - Upload test document
   - Check Railway logs
   - Monitor Upstash usage for 24 hours

5. **Cleanup**:
   - Remove old environment variables
   - Clean up stuck jobs: `pnpm clean:queue`

---

## FAQ

**Q: What if the webhook fails?**
A: Jobs remain queued. You can manually trigger the worker via Railway dashboard → Deploy.

**Q: How long does it take for worker to start?**
A: Railway deployment takes 30-60 seconds. Jobs are processed within 2 minutes of upload.

**Q: Can I run multiple workers?**
A: No need! The on-demand worker processes jobs concurrently (concurrency: 3).

**Q: What about job failures?**
A: BullMQ automatically retries failed jobs 3 times with exponential backoff.

**Q: How do I revert to always-on mode?**
A: Update `start.sh` to use `pnpm worker` instead of `pnpm worker:on-demand`.

---

## Summary

✅ **On-demand worker reduces Redis usage by 99%**
✅ **Stays within Upstash free tier (500k commands/month)**
✅ **No functionality loss - jobs still process automatically**
✅ **Simple setup with Railway Deploy Hooks**

The on-demand worker is the recommended configuration for production use with Upstash free tier.
