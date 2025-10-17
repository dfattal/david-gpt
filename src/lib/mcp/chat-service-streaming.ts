/**
 * MCP Chat Service - Streaming Edition
 * Handles chat API calls with streaming support for SSE MCP server
 */

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface StreamCallbacks {
  onToken?: (token: string) => void;
  onCitation?: (citation: any) => void;
  onComplete?: (fullResponse: string, citations: any[]) => void;
}

/**
 * Call chat API with streaming support
 * Invokes callbacks as chunks arrive instead of buffering
 */
export async function callChatApiStreaming(
  messages: ChatMessage[],
  conversationId: string,
  personaSlug: string = 'david',
  callbacks: StreamCallbacks = {}
): Promise<void> {
  // Determine chat API URL from environment variable
  let chatApiUrl = 'http://localhost:3000/api/chat'; // Fallback default

  if (process.env.NEXT_PUBLIC_APP_URL) {
    const envUrl = process.env.NEXT_PUBLIC_APP_URL;
    console.error('[MCP Chat Streaming] Using NEXT_PUBLIC_APP_URL:', envUrl);
    chatApiUrl = `${envUrl}/api/chat`;
  } else {
    console.error('[MCP Chat Streaming] NEXT_PUBLIC_APP_URL not set, using default localhost:3000');
  }

  console.error('[MCP Chat Streaming] Calling:', chatApiUrl);

  try {
    const response = await fetch(chatApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MCP-Client': 'true', // Skip large headers
      },
      body: JSON.stringify({
        messages,
        conversationId,
        personaId: personaSlug,
        useRag: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chat API returned ${response.status}: ${errorText}`);
    }

    // Extract citations from headers (if available)
    const citations: any[] = [];
    try {
      const citationMetadataHeader = response.headers.get('X-Citation-Metadata');
      if (citationMetadataHeader) {
        const decoded = Buffer.from(citationMetadataHeader, 'base64').toString('utf-8');
        citations.push(...JSON.parse(decoded));
      }
    } catch (error) {
      console.error('[MCP Chat Streaming] Failed to extract citation metadata:', error);
    }

    // Stream the response
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    if (!reader) {
      throw new Error('Response body is not readable');
    }

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      fullResponse += chunk;

      // Callback for each token/chunk
      if (callbacks.onToken) {
        callbacks.onToken(chunk);
      }
    }

    // Notify citations (if any)
    if (callbacks.onCitation && citations.length > 0) {
      citations.forEach(citation => callbacks.onCitation!(citation));
    }

    // Final callback with complete response
    if (callbacks.onComplete) {
      callbacks.onComplete(fullResponse, citations);
    }

  } catch (error) {
    console.error('[MCP Chat Streaming] Error:', error);
    throw error;
  }
}

/**
 * Format citations for display
 */
export function formatCitations(citations: any[]): string {
  if (!citations || citations.length === 0) {
    return '';
  }

  const citationList = citations
    .map((c, idx) => {
      const docRef = c.docRef || `[${idx + 1}]`;
      const title = c.title || 'Unknown source';
      return `${docRef}: ${title}`;
    })
    .join('\n');

  return `\n\nSources:\n${citationList}`;
}
