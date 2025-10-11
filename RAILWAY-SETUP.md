# Railway Worker Setup Guide

## Step 1: Create Worker Service on Railway

1. Go to your Railway project dashboard
2. Click **"New"** → **"GitHub Repo"**
3. Select your `david-gpt` repository
4. Railway will detect the `railway.json` configuration

## Step 2: Configure the Worker Service

### Service Settings:
- **Name**: `david-gpt-worker` (or any name you prefer)
- **Start Command**: Should auto-detect `pnpm worker` from `railway.json`
- If not, manually set: `pnpm worker`

### Environment Variables to Add:

Click on your worker service → **Variables** tab → Add the following:

```bash
OPENAI_API_KEY=<copy from .env.local>
COHERE_API_KEY=<copy from .env.local>
GOOGLE_GENERATIVE_AI_API_KEY=<copy from .env.local>
GEMINI_API_KEY=<copy from .env.local>
NEXT_PUBLIC_SUPABASE_URL=<copy from .env.local>
SUPABASE_SERVICE_ROLE_KEY=<copy from .env.local>
```

**IMPORTANT**: `REDIS_URL` should already be set automatically when you added the Redis database. Verify it exists.

## Step 3: Connect Redis to Worker Service

1. In Railway, click on your worker service
2. Click **"Variables"** tab
3. Click **"Add Reference Variable"**
4. Select your Redis database
5. Choose `REDIS_URL`
6. This ensures the worker can connect to Redis

## Step 4: Deploy

1. Railway should auto-deploy after you push the `railway.json` file
2. Or click **"Deploy"** manually in the Railway dashboard

## Step 5: Verify Deployment

1. Click on your worker service → **"Logs"** tab
2. You should see:
   ```
   🚀 Starting unified extraction worker...
   ✅ Redis client connected
   ✅ Unified worker started (concurrency: 3)
      Supports: markdown_single, url_single, url_batch, pdf, reingest
   Press Ctrl+C to stop
   ```

## Troubleshooting

### Worker keeps crashing
- Check logs for error messages
- Verify all environment variables are set
- Ensure REDIS_URL is correctly connected

### Redis connection errors
- Make sure Redis database is in the same Railway project
- Verify REDIS_URL is set in worker environment variables
- Check Redis database is running (green status)

### Jobs not processing
- Check worker logs for activity
- Verify local app is creating jobs (check your local worker logs)
- Ensure both local and Railway workers use the same REDIS_URL
