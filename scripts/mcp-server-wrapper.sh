#!/usr/bin/env bash
#
# MCP Server Wrapper for Gemini CLI
#
# This script ensures the MCP server runs from the correct directory
# MCP protocol requires: JSON-RPC messages on stdout, logs on stderr

# Change to project root
cd "$(dirname "$0")/.." || exit 1

# Run the MCP server
# - pnpm will output any errors to stderr
# - MCP server uses console.error() for all logs (stderr)
# - MCP protocol messages go to stdout (clean JSON-RPC)
exec pnpm mcp-server
