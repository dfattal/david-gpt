"""
Example: Using David-GPT MCP Bridge with Claude API

This script demonstrates how to integrate the David-GPT RAG system
with Claude AI using the MCP Bridge HTTP API and Claude's tool calling feature.

Requirements:
    pip install anthropic requests

Usage:
    export ANTHROPIC_API_KEY="your-api-key"
    python examples/claude-api-integration.py
"""

import os
import requests
from anthropic import Anthropic

# Configuration
MCP_BRIDGE_URL = os.getenv("MCP_BRIDGE_URL", "http://localhost:3000/api/mcp-bridge")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

if not ANTHROPIC_API_KEY:
    raise ValueError("Please set ANTHROPIC_API_KEY environment variable")

# Initialize Claude client
client = Anthropic(api_key=ANTHROPIC_API_KEY)

# Track conversation state
conversation_id = None

def call_david_gpt(message: str, conversation_id: str = None):
    """Call the David-GPT RAG system via MCP Bridge"""
    if conversation_id:
        # Continue existing conversation
        response = requests.post(
            MCP_BRIDGE_URL,
            json={
                "action": "reply_to_conversation",
                "conversation_id": conversation_id,
                "message": message
            }
        )
    else:
        # Start new conversation
        response = requests.post(
            MCP_BRIDGE_URL,
            json={
                "action": "new_conversation",
                "message": message,
                "persona": "david"
            }
        )

    response.raise_for_status()
    data = response.json()

    return {
        "conversation_id": data.get("conversation_id"),
        "response": data.get("response"),
        "citations": data.get("citations", []),
    }

# Define the tool for Claude
tools = [
    {
        "name": "ask_david_gpt",
        "description": """Ask David's RAG knowledge base about 3D displays, Leia technology, computer vision, AI, and related technical topics.

        The system returns cited responses from technical documents, patents, and research papers.
        Use this when the user asks about:
        - Leia technology and 3D displays
        - Diffractive Lightfield Backlighting (DLB)
        - 3D Cell / Liquid Crystal lens technology
        - Glasses-free 3D displays
        - Computer vision and AI topics
        - Patents and technical innovations""",
        "input_schema": {
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "Question or query for the RAG system"
                }
            },
            "required": ["message"]
        }
    }
]

def chat_with_claude(user_message: str):
    """Have a conversation with Claude that can query David-GPT"""
    global conversation_id

    print(f"\n\n{'='*60}")
    print(f"USER: {user_message}")
    print(f"{'='*60}\n")

    messages = [{"role": "user", "content": user_message}]

    # Call Claude with tools
    response = client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=2048,
        tools=tools,
        messages=messages
    )

    # Process tool calls
    while response.stop_reason == "tool_use":
        tool_use = next(block for block in response.content if block.type == "tool_use")

        print(f"🔧 Claude is using tool: {tool_use.name}")
        print(f"   Query: {tool_use.input['message']}\n")

        # Call David-GPT
        result = call_david_gpt(tool_use.input["message"], conversation_id)

        # Save conversation ID for follow-up questions
        if result["conversation_id"]:
            conversation_id = result["conversation_id"]

        print(f"📚 David-GPT Response Preview:")
        print(f"   {result['response'][:200]}...\n")
        print(f"   Citations: {len(result['citations'])}\n")

        # Return result to Claude
        messages.append({"role": "assistant", "content": response.content})
        messages.append({
            "role": "user",
            "content": [{
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": result["response"]
            }]
        })

        # Continue conversation
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=2048,
            tools=tools,
            messages=messages
        )

    # Print Claude's final response
    final_text = next(
        (block.text for block in response.content if hasattr(block, "text")),
        None
    )

    print(f"🤖 CLAUDE: {final_text}\n")

    return final_text

# Example conversation
if __name__ == "__main__":
    print("🚀 David-GPT + Claude AI Integration Demo")
    print("   Using MCP Bridge HTTP API")
    print(f"   MCP Bridge: {MCP_BRIDGE_URL}")

    # Example 1: Ask about Leia technology
    chat_with_claude("What is Leia technology and how does it work?")

    # Example 2: Follow-up question (uses conversation context)
    chat_with_claude("What are the advantages of the 3D Cell approach over the older DLB technology?")

    # Example 3: Ask Claude to summarize
    chat_with_claude("Can you summarize the key innovations in simple terms?")

    print("\n✅ Demo complete!")
    print(f"   Conversation ID: {conversation_id}")
    print("   You can continue this conversation by keeping the same conversation_id")
