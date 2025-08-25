/**
 * Title Generation Utilities
 * Handles automatic conversation title generation using AI
 * 
 * This module provides:
 * - Automatic title generation after first assistant response
 * - David Fattal persona-specific title prompts
 * - Background processing to avoid blocking chat responses
 * - Error handling and retry capabilities
 * - UI state management for title generation status
 */

/**
 * Get the base URL for API calls
 * In Edge runtime, we need absolute URLs
 */
function getBaseUrl(): string {
  // In Edge runtime on Vercel, we can use VERCEL_URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  
  // For local development
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000'
  }
  
  // Fallback - try to get from environment or use relative URL
  return process.env.NEXT_PUBLIC_SITE_URL || ''
}

/**
 * Triggers title generation for a conversation in the background
 * Should be called after the first assistant response
 * 
 * FIXED: Uses absolute URLs to avoid "URL is malformed" errors in Edge runtime
 */
export async function triggerTitleGeneration(conversationId: string): Promise<void> {
  try {
    console.log(`[Title Generation Trigger] Starting background title generation for conversation ${conversationId}`)
    
    const baseUrl = getBaseUrl()
    const url = baseUrl ? `${baseUrl}/api/conversations/${conversationId}/title` : `/api/conversations/${conversationId}/title`
    
    console.log(`[Title Generation Trigger] Making request to: ${url}`)
    
    // Fire and forget - don't wait for title generation to complete
    // This runs in the background and doesn't block the chat response
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    }).then(response => {
      if (response.ok) {
        console.log(`[Title Generation Trigger] Successfully triggered title generation for conversation ${conversationId}`)
      } else {
        console.warn(`[Title Generation Trigger] Title generation request failed with status ${response.status} for conversation ${conversationId}`)
      }
    }).catch(error => {
      // Log error but don't throw - title generation is non-critical for UX
      console.warn(`[Title Generation Trigger] Background title generation failed for conversation ${conversationId}:`, error)
    })
  } catch (error) {
    // Silent fail for title generation - don't impact user experience
    console.warn(`[Title Generation Trigger] Failed to trigger title generation for conversation ${conversationId}:`, error)
  }
}

/**
 * Retry title generation for failed attempts
 * Can be called manually from UI if title generation fails
 * 
 * FIXED: For client-side retry calls, we need to construct absolute URLs
 * or use the current window.location.origin
 */
export async function retryTitleGeneration(conversationId: string): Promise<boolean> {
  try {
    // For client-side calls, construct absolute URL using window.location.origin
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    const url = baseUrl ? `${baseUrl}/api/conversations/${conversationId}/title` : `/api/conversations/${conversationId}/title`
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    
    return response.ok
  } catch (error) {
    console.error('Title generation retry failed:', error)
    return false
  }
}

/**
 * Checks if a conversation needs title generation
 * Returns true if title_status is 'pending'
 */
export function needsTitleGeneration(titleStatus: string): boolean {
  return titleStatus === 'pending'
}

/**
 * Gets display info for conversation titles based on their status
 */
export function getTitleDisplayInfo(title: string, titleStatus: string) {
  return {
    displayTitle: title,
    showLoading: false, // Never show loading spinner - just display title as-is
    showError: titleStatus === 'error',
    isReady: titleStatus === 'ready',
    shouldRetry: titleStatus === 'error'
  }
}

/**
 * Determines if we should trigger title generation after a message
 * Should trigger after first assistant response in a new conversation
 * UPDATED: Now checks for exactly 1 user message instead of 2 total messages
 */
export function shouldTriggerTitleGeneration(
  titleStatus: string,
  userMessageCount: number
): boolean {
  // Only generate title for conversations with exactly 1 user message
  // and title status is still 'pending' (first exchange complete)
  return userMessageCount === 1 && titleStatus === 'pending'
}

/**
 * Enhanced title generation prompt specifically tuned for David Fattal persona
 */
export const DAVID_FATTAL_TITLE_PROMPT = `You are generating conversation titles for David Fattal, Founder & CTO of Leia Inc.

David's expertise areas:
- Quantum computing and nanophotonics
- Light field displays and 3D technology
- Spatial AI and computer vision
- Immersive holographic systems
- Advanced materials science
- Consumer electronics manufacturing

Title Generation Rules:
1. Use exactly 3-6 words
2. Use Title Case (First Letter Capitalized)
3. Be specific about the technical topic discussed
4. Avoid generic words like "Chat", "Discussion", "Question", "Help", "About"
5. Focus on the core technology, concept, or problem being discussed
6. Make it immediately clear what the conversation covers
7. Prefer technical terminology over layman's terms when appropriate

Examples of excellent titles:
- "Quantum Light Field Physics"
- "3D Display Manufacturing Challenges"
- "Spatial AI Algorithm Design"
- "Holographic Data Storage Methods"
- "Nanophotonic Device Fabrication"
- "Light Field Compression Techniques"
- "Computational Holography Optimization"
- "3D Scene Understanding Models"

Analyze this conversation between a user and David Fattal. Generate ONE concise title that captures the main technical topic. Respond with only the title - no quotes, no punctuation, no explanation.`
