#!/bin/bash

# Smart start script for Railway
# Detects service name and runs appropriate command

SERVICE_NAME="${RAILWAY_SERVICE_NAME:-unknown}"

echo "🚀 Starting service: $SERVICE_NAME"

case "$SERVICE_NAME" in
  "mcp-server")
    echo "📡 Starting MCP SSE Server..."
    exec pnpm mcp-sse-server
    ;;
  "david-gpt-worker")
    echo "⚙️ Starting On-Demand Worker..."
    exec pnpm worker:on-demand
    ;;
  *)
    echo "❓ Unknown service: $SERVICE_NAME"
    echo "Available services: mcp-server, david-gpt-worker"
    echo "Defaulting to worker..."
    exec pnpm worker
    ;;
esac
