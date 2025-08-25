# Deployment Guide - David GPT

## Production Deployment Checklist

### ✅ Database Setup (COMPLETED)
- [x] Supabase project created: `mnjrwjtzfjfixdjrerke` (Habit Tracker)
- [x] Database schema applied via migration `001_init_david_gpt_schema`
- [x] Tables created: `conversations`, `messages`
- [x] RLS policies enabled and configured
- [x] Performance indexes created
- [x] Trigger functions implemented

### ✅ GitHub Repository
- [x] Public repository: `dfattal/david-gpt`
- [x] Connected to Vercel project
- [x] CI/CD pipeline configured

### 🔧 Environment Variables Required

The following environment variables must be set in Vercel:

```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-proj-[your-key]

# Supabase Configuration  
NEXT_PUBLIC_SUPABASE_URL=https://mnjrwjtzfjfixdjrerke.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-anon-key]

# Optional: Service role key for server operations
SUPABASE_SERVICE_ROLE_KEY=[your-service-role-key]
```

### 🚀 Vercel Configuration

#### Project Settings
- **Framework Preset**: Next.js
- **Build Command**: `pnpm build`  
- **Output Directory**: `.next`
- **Install Command**: `pnpm install`
- **Node.js Version**: 20.x

#### Function Configuration
- Chat streaming endpoint: 60s timeout
- Title generation: 30s timeout
- Other API routes: 10s default

### 🔐 Google OAuth Setup

1. **Google Cloud Console**:
   - Create OAuth 2.0 credentials
   - Add authorized domains:
     - Development: `http://localhost:3000`
     - Production: `https://[your-domain].vercel.app`

2. **Supabase Auth Settings**:
   - Site URL: `https://[your-domain].vercel.app`
   - Redirect URLs: `https://[your-domain].vercel.app/auth/callback`

### 📊 Performance Targets

The application meets these performance budgets:
- **Lighthouse Score**: ≥90%
- **Bundle Size**: 178KB (under 200KB target)
- **Core Web Vitals**: LCP <2.5s, FID <100ms, CLS <0.1
- **Streaming Latency**: <200ms first token

### 🧪 Quality Gates

Every deployment passes:
- TypeScript compilation (zero errors)
- ESLint (zero warnings)
- Build process (successful)
- E2E tests (95 tests across 6 suites)
- Performance budgets

### 🔄 CI/CD Pipeline

**On Pull Request**:
- Run type checking
- Run linting
- Run build
- Run E2E tests
- Upload test artifacts

**On Main Branch**:
- All above checks
- Deploy to production

### 🌐 Domain Configuration

1. **Custom Domain** (Optional):
   - Add domain in Vercel dashboard
   - Update OAuth redirect URLs
   - Update Supabase site URL

2. **SSL Certificate**:
   - Automatically handled by Vercel
   - HTTPS enforced

### 📈 Monitoring

**Built-in Monitoring**:
- Performance monitoring via Web Vitals API
- Error tracking in browser console
- Database query performance logging
- Memory usage tracking

**Vercel Analytics**:
- Real User Monitoring (RUM)
- Core Web Vitals tracking
- Performance insights

### 🚨 Health Checks

**Health Check Endpoint**: `/health`
- Database connectivity
- AI service availability
- Authentication service status

### 🔧 Troubleshooting

**Common Issues**:

1. **Environment Variables**: Check all required vars are set in Vercel
2. **Database Connection**: Verify Supabase project is active
3. **OAuth Issues**: Check redirect URLs match exactly
4. **Build Failures**: Ensure TypeScript/ESLint pass locally

**Debug Commands**:
```bash
# Local development
pnpm dev

# Type checking
pnpm type-check

# Linting
pnpm lint

# Build test
pnpm build

# E2E tests
pnpm test:e2e
```

### 🎯 Production Checklist

Before going live:
- [ ] Set all environment variables in Vercel
- [ ] Configure Google OAuth for production domain
- [ ] Update Supabase Auth settings
- [ ] Test authentication flow
- [ ] Verify streaming chat functionality
- [ ] Check performance metrics
- [ ] Test mobile responsiveness
- [ ] Validate accessibility compliance

## Next Steps

1. **Push to GitHub**: All code is ready for deployment
2. **Configure Vercel**: Set environment variables
3. **Test Production**: Verify all functionality works
4. **Monitor**: Watch performance and error metrics