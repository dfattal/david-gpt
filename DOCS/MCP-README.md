# MCP Integration Documentation

**📚 Main Guide:** [MCP-INTEGRATION-GUIDE.md](MCP-INTEGRATION-GUIDE.md)

---

## Quick Links

### By Use Case

| I want to... | See Section |
|--------------|-------------|
| **Use in Claude Code/Cursor** | [stdio Transport](MCP-INTEGRATION-GUIDE.md#1-stdio-local) |
| **Use in Python/JavaScript app** | [HTTP API](MCP-INTEGRATION-GUIDE.md#2-http-api) |
| **Use in Claude.ai web** | [SSE Transport](MCP-INTEGRATION-GUIDE.md#3-sse-server-sent-events) |
| **Use in ChatGPT** | [SSE Streaming](MCP-INTEGRATION-GUIDE.md#streaming-support) |
| **Understand all options** | [Quick Decision Matrix](MCP-INTEGRATION-GUIDE.md#quick-decision-matrix) |

### By Topic

- **Streaming Support:** [Streaming Guide](MCP-INTEGRATION-GUIDE.md#streaming-support)
- **Deployment Architecture:** [Architecture](MCP-INTEGRATION-GUIDE.md#deployment-architecture)
- **Usage Examples:** [Examples](MCP-INTEGRATION-GUIDE.md#usage-examples)
- **Troubleshooting:** [Common Issues](MCP-INTEGRATION-GUIDE.md#troubleshooting)
- **Comparison Tables:** [Comparisons](MCP-INTEGRATION-GUIDE.md#comparison-tables)

---

## Available Transports

### ✅ All Production Ready

| Transport | Use For | Endpoint |
|-----------|---------|----------|
| **stdio** | Local dev tools (Claude Code, Cursor) | `pnpm mcp-server` |
| **HTTP API** | Programmatic access (Python/JS apps) | `https://david-gpt-orpin.vercel.app/api/mcp-bridge` |
| **SSE** | Claude AI / ChatGPT connectors | `https://mcp-server-production-6a46.up.railway.app/sse` |
| **SSE Streaming** | Real-time streaming connectors | `https://mcp-server-production-6a46.up.railway.app/sse` |

---

## Quick Start

```bash
# Local Development (stdio)
pnpm dev                    # Start Next.js
# Use in Claude Code/Cursor - already configured in .cursor/mcp.json

# Programmatic Access (HTTP API)
curl -X POST https://david-gpt-orpin.vercel.app/api/mcp-bridge \
  -H "Content-Type: application/json" \
  -d '{
    "action": "new_conversation",
    "message": "What is Leia technology?",
    "persona": "david"
  }'

# Claude AI Custom Connector (SSE)
# Add connector in claude.ai/settings/connectors
# URL: https://mcp-server-production-6a46.up.railway.app/sse

# ChatGPT Custom GPT (SSE Streaming)
# Create custom GPT with SSE action
# URL: https://mcp-server-production-6a46.up.railway.app/sse
```

---

## Documentation Structure

- **[MCP-INTEGRATION-GUIDE.md](MCP-INTEGRATION-GUIDE.md)** - 📚 Main comprehensive guide (START HERE)
- **archive/** - Legacy documentation (consolidated into main guide)

---

## Key Features

All MCP transports provide:

- ✅ **Multi-turn conversations** with context retention (last 6 messages)
- ✅ **RAG-powered responses** with hybrid search (vector + BM25)
- ✅ **Transparent citations** with source URLs and document metadata
- ✅ **Persona-aware responses** using curated knowledge bases
- ✅ **3 core tools:** `new_conversation`, `reply_to_conversation`, `list_conversations`

---

## Support

- **Questions?** See [Troubleshooting](MCP-INTEGRATION-GUIDE.md#troubleshooting)
- **Examples:** Check [Usage Examples](MCP-INTEGRATION-GUIDE.md#usage-examples)
- **Python Example:** `examples/claude-api-integration.py`
