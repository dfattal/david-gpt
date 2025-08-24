# Authentication Setup Guide

This guide covers setting up Google OAuth authentication with Supabase for David-GPT.

## Supabase Configuration

### 1. Enable Google OAuth Provider

1. Go to your Supabase project dashboard
2. Navigate to **Authentication > Providers**
3. Find **Google** and click **Enable**
4. Configure the following:
   - **Client ID**: Your Google OAuth client ID
   - **Client Secret**: Your Google OAuth client secret

### 2. Configure Redirect URLs

In your Supabase project settings under **Authentication > URL Configuration**:

**Development:**
- Site URL: `http://localhost:3000`
- Redirect URLs: `http://localhost:3000/auth/callback`

**Production:**
- Site URL: `https://yourdomain.com`
- Redirect URLs: `https://yourdomain.com/auth/callback`

### 3. Google Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable **Google+ API**
4. Go to **Credentials > Create Credentials > OAuth client ID**
5. Configure:
   - Application type: **Web application**
   - Authorized JavaScript origins:
     - `http://localhost:3000` (development)
     - `https://yourdomain.com` (production)
   - Authorized redirect URIs:
     - `https://[your-supabase-project].supabase.co/auth/v1/callback`

## Environment Variables

Add to your `.env.local`:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
```

## Features Implemented

### Authentication Flow
- ✅ Google OAuth sign-in via Supabase Auth
- ✅ Automatic session management and token refresh  
- ✅ Server-side session validation in middleware
- ✅ Protected routes with automatic redirect

### Security Features
- ✅ Row Level Security (RLS) policies enforced
- ✅ Server-side auth validation in all API routes
- ✅ CSRF protection via Supabase Auth
- ✅ Secure cookie-based sessions

### UI Components
- ✅ Login page with Google OAuth button
- ✅ User profile display in sidebar
- ✅ Sign out functionality
- ✅ Loading states and error handling

### Route Protection
- ✅ Middleware protecting all chat routes
- ✅ Automatic redirect to login for unauthenticated users
- ✅ AuthGuard component for client-side protection

## Database Integration

The authentication system works seamlessly with the existing database schema:

- `conversations.owner` field automatically populated with authenticated user ID
- RLS policies ensure users can only access their own data
- All API endpoints validate authentication before database operations

## Testing

1. Start the development server: `pnpm dev`
2. Navigate to `http://localhost:3000`
3. You should be redirected to `/login`
4. Click "Continue with Google" to test OAuth flow
5. After successful authentication, you'll be redirected to the chat interface

## Troubleshooting

### Common Issues

**"Authentication Error" on login:**
- Verify Google OAuth credentials in Supabase
- Check redirect URLs match exactly
- Ensure Google Console project has correct domains

**"Unauthorized" API errors:**
- Check that user session is properly established
- Verify RLS policies are correctly configured
- Ensure API routes use server-side Supabase client

**Infinite redirect loops:**
- Check middleware configuration
- Verify environment variables are set correctly
- Clear browser cookies and try again