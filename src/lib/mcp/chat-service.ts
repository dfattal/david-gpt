/**
 * MCP Chat Service
 * Handles chat API calls and streaming responses for MCP clients
 */

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface CitationMetadata {
  docRef: string;
  sourceUrl?: string;
  docTitle?: string;
  docId: string;
}

interface ChatResponse {
  content: string;
  citations: CitationMetadata[];
}

/**
 * Call the chat API with conversation history
 * @param messages - Array of conversation messages
 * @param conversationId - Conversation UUID
 * @param personaSlug - Persona slug (default: 'david')
 * @returns Chat response with content and citations
 */
export async function callChatApi(
  messages: ChatMessage[],
  conversationId: string,
  personaSlug: string = 'david'
): Promise<ChatResponse> {
  // Log ALL environment variables related to URL construction
  console.error('[MCP Chat] === URL CONSTRUCTION DEBUG ===');
  console.error('[MCP Chat] NEXT_PUBLIC_APP_URL from env:', process.env.NEXT_PUBLIC_APP_URL);
  console.error('[MCP Chat] NEXT_PUBLIC_APP_URL type:', typeof process.env.NEXT_PUBLIC_APP_URL);
  console.error('[MCP Chat] NEXT_PUBLIC_APP_URL length:', process.env.NEXT_PUBLIC_APP_URL?.length);

  // Determine chat API URL
  // Priority: explicit MCP env var > localhost default
  // This ensures MCP server always uses localhost unless explicitly configured otherwise
  let chatApiUrl = 'http://localhost:3000/api/chat';

  if (process.env.NEXT_PUBLIC_APP_URL) {
    const envUrl = process.env.NEXT_PUBLIC_APP_URL;
    console.error('[MCP Chat] envUrl value:', envUrl);
    console.error('[MCP Chat] envUrl includes localhost?', envUrl.includes('localhost'));
    console.error('[MCP Chat] envUrl includes 127.0.0.1?', envUrl.includes('127.0.0.1'));

    // Only use env var if it's localhost or explicitly configured for MCP
    if (envUrl.includes('localhost') || envUrl.includes('127.0.0.1')) {
      chatApiUrl = `${envUrl}/api/chat`;
      console.error('[MCP Chat] Constructed chatApiUrl:', chatApiUrl);
    } else {
      console.error('[MCP Chat] envUrl does not include localhost or 127.0.0.1, using default');
    }
  } else {
    console.error('[MCP Chat] NEXT_PUBLIC_APP_URL not set, using default localhost:3000');
  }

  console.error('[MCP Chat] Final chatApiUrl:', chatApiUrl);
  console.error('[MCP Chat] === END URL CONSTRUCTION DEBUG ===');

  console.error('[MCP Chat] Calling chat API:', chatApiUrl);
  console.error('[MCP Chat] Messages:', messages.length, 'Persona:', personaSlug);
  console.error('[MCP Chat] ENV NEXT_PUBLIC_APP_URL:', process.env.NEXT_PUBLIC_APP_URL);

  // Validate URL before fetch and inspect for hidden characters
  try {
    const validatedUrl = new URL(chatApiUrl);
    console.error('[MCP Chat] URL validated successfully:', validatedUrl.href);
  } catch (urlError) {
    console.error('[MCP Chat] Invalid URL detected:', chatApiUrl);
    console.error('[MCP Chat] URL length:', chatApiUrl.length);
    console.error('[MCP Chat] URL character codes:');
    for (let i = 0; i < chatApiUrl.length; i++) {
      const char = chatApiUrl[i];
      const code = chatApiUrl.charCodeAt(i);
      console.error(`  [${i}] '${char}' = ${code}${code < 32 || code > 126 ? ' ⚠️ NON-STANDARD' : ''}`);
    }
    console.error('[MCP Chat] URL Error:', urlError);
    throw new Error(`Invalid chat API URL: ${chatApiUrl}`);
  }

  try {
    // Add X-MCP-Client header to tell chat API to skip citation metadata in headers
    // This prevents header overflow errors when citations are large
    const response = await fetch(chatApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MCP-Client': 'true',
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
      console.error('[MCP Chat] API error:', response.status, errorText);
      throw new Error(`Chat API returned ${response.status}: ${errorText}`);
    }

    // Try to extract citation metadata from headers
    // Note: May fail if headers are too large (>16KB default limit)
    let citations: CitationMetadata[] = [];
    try {
      const citationMetadataHeader = response.headers.get('X-Citation-Metadata');
      if (citationMetadataHeader) {
        const decoded = Buffer.from(citationMetadataHeader, 'base64').toString('utf-8');
        citations = JSON.parse(decoded);
        console.error('[MCP Chat] Extracted citation metadata:', citations.length, 'citations');
      }
    } catch (error) {
      console.error('[MCP Chat] Failed to extract citation metadata (headers may be too large):', error);
      // Continue without citation metadata - the response text still has inline citations
    }

    // Stream and buffer the response
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body from chat API');
    }

    let fullResponse = '';
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      fullResponse += chunk;
    }

    console.error('[MCP Chat] Response complete:', {
      length: fullResponse.length,
      preview: fullResponse.substring(0, 100),
      citations: citations.length,
    });

    if (!fullResponse.trim()) {
      throw new Error('Empty response from chat API');
    }

    return {
      content: fullResponse,
      citations,
    };
  } catch (error) {
    console.error('[MCP Chat] Failed to call chat API:', error);
    console.error('[MCP Chat] Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('[MCP Chat] Error message:', error instanceof Error ? error.message : String(error));
    console.error('[MCP Chat] Chat API URL was:', chatApiUrl);
    console.error('[MCP Chat] NEXT_PUBLIC_APP_URL env:', process.env.NEXT_PUBLIC_APP_URL);

    // Re-throw with more context
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Chat API call failed (URL: ${chatApiUrl}): ${errorMessage}`);
  }
}

/**
 * Format citations for MCP response
 * @param citations - Array of citation metadata
 * @returns Formatted citation string
 */
export function formatCitations(citations: CitationMetadata[]): string {
  if (citations.length === 0) {
    return '';
  }

  const lines = ['', '---', '**Sources:**', ''];

  citations.forEach((citation, index) => {
    const number = index + 1;
    const title = citation.docTitle || citation.docId;
    const url = citation.sourceUrl;

    if (url) {
      lines.push(`${number}. [${title}](${url})`);
    } else {
      lines.push(`${number}. ${title}`);
    }
  });

  return lines.join('\n');
}

/**
 * Generate a conversation title from the first user message
 * @param message - User message content
 * @returns Suggested title (max 100 chars)
 */
export function generateConversationTitle(message: string): string {
  // Take first sentence or first 100 characters
  const firstSentence = message.split(/[.!?]/)[0];
  const title = firstSentence.trim().substring(0, 100);

  return title || 'New conversation';
}
