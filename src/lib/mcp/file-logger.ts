/**
 * Simple file logger for MCP server debugging
 * Writes logs to /tmp/mcp-server-debug.log
 */

import { appendFileSync, writeFileSync } from 'fs';

const LOG_FILE = '/tmp/mcp-server-debug.log';
let logInitialized = false;

export function logToFile(message: string, ...args: any[]) {
  // Initialize log file on first use
  if (!logInitialized) {
    try {
      writeFileSync(LOG_FILE, `=== MCP Server Debug Log Started at ${new Date().toISOString()} ===\n`, 'utf-8');
      logInitialized = true;
    } catch (error) {
      // Silently fail
    }
  }

  const timestamp = new Date().toISOString();
  const formattedArgs = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');

  const logLine = `[${timestamp}] ${message} ${formattedArgs}\n`;

  try {
    appendFileSync(LOG_FILE, logLine, 'utf-8');
  } catch (error) {
    // Silently fail if we can't write to log file
  }

  // Also log to console.error for backward compatibility
  console.error(message, ...args);
}
