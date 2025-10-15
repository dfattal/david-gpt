/**
 * Environment variable loader for MCP server
 * MUST be imported before any other modules that use env vars
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { existsSync, appendFileSync } from 'fs';

const LOG_FILE = '/tmp/mcp-env-debug.log';

function debugLog(message: string) {
  const timestamp = new Date().toISOString();
  try {
    appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`, 'utf-8');
  } catch (error) {
    // Ignore
  }
  console.error(message);
}

debugLog('[ENV] === ENVIRONMENT LOADING STARTED ===');
debugLog(`[ENV] process.cwd(): ${process.cwd()}`);
debugLog(`[ENV] __dirname would be: ${__dirname}`);

// Try to load .env.local first (Next.js convention), fallback to .env
const envLocalPath = resolve(process.cwd(), '.env.local');
const envPath = resolve(process.cwd(), '.env');

debugLog(`[ENV] envLocalPath: ${envLocalPath}`);
debugLog(`[ENV] envLocalPath exists: ${existsSync(envLocalPath)}`);
debugLog(`[ENV] envPath: ${envPath}`);
debugLog(`[ENV] envPath exists: ${existsSync(envPath)}`);

// Store NEXT_PUBLIC_APP_URL if it was explicitly set by MCP client (and not a placeholder)
const mcpAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const isMcpAppUrlPlaceholder = mcpAppUrl?.startsWith('${') && mcpAppUrl?.endsWith('}');
debugLog(`[ENV] MCP client NEXT_PUBLIC_APP_URL: ${mcpAppUrl}`);
debugLog(`[ENV] Is placeholder: ${isMcpAppUrlPlaceholder}`);

// Log environment BEFORE loading
debugLog(`[ENV] BEFORE dotenv - NEXT_PUBLIC_SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);

try {
  // Load .env.local and OVERRIDE any placeholder values from MCP client
  // This is necessary because Claude Code may set env vars to literal "${VAR_NAME}" strings
  const result = dotenv.config({ path: envLocalPath, override: true });
  if (result.error) {
    debugLog(`[ENV] .env.local load error: ${result.error.message}`);
  } else {
    debugLog('[ENV] Loaded environment from .env.local');
    debugLog(`[ENV] Loaded ${Object.keys(result.parsed || {}).length} variables`);
  }
} catch (error) {
  debugLog(`[ENV] Exception loading .env.local: ${error}`);
  const result = dotenv.config({ path: envPath, override: true });
  if (result.error) {
    debugLog(`[ENV] .env load error: ${result.error.message}`);
  } else {
    debugLog('[ENV] Loaded environment from .env');
  }
}

// Log environment AFTER loading
debugLog(`[ENV] AFTER dotenv - NEXT_PUBLIC_SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);

// Restore MCP client's NEXT_PUBLIC_APP_URL if it was set to a real value (not a placeholder)
if (mcpAppUrl && !isMcpAppUrlPlaceholder) {
  process.env.NEXT_PUBLIC_APP_URL = mcpAppUrl;
  debugLog(`[ENV] Using MCP client APP_URL: ${mcpAppUrl}`);
} else if (!process.env.NEXT_PUBLIC_APP_URL || isMcpAppUrlPlaceholder) {
  // Default to localhost if not set or if it's a placeholder
  process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3000';
  debugLog('[ENV] Using default APP_URL: http://127.0.0.1:3000');
}

debugLog(`[ENV] FINAL NEXT_PUBLIC_APP_URL: ${process.env.NEXT_PUBLIC_APP_URL}`);
debugLog('[ENV] === ENVIRONMENT LOADING COMPLETE ===');

// Export a function to validate environment variables
export function validateEnv() {
  const requiredVars = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY'];
  const missing = requiredVars.filter(v => !process.env[v]);

  if (missing.length > 0) {
    console.error('[MCP Server] ERROR: Missing required environment variables:', missing);
    console.error('[MCP Server] Current env values:');
    console.error('  - NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.error('  - SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'missing');
    console.error('  - OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'set' : 'missing');
    process.exit(1);
  }
}
