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
 * Triggers title generation for a conversation in the background
 * Should be called after the first assistant response
 */
export async function triggerTitleGeneration(conversationId: string): Promise<void> {
  try {
    // Fire and forget - don't wait for title generation to complete
    // This runs in the background and doesn't block the chat response
    fetch(`/api/conversations/${conversationId}/title`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    }).catch(error => {
      // Log error but don't throw - title generation is non-critical for UX
      console.warn('Background title generation failed:', error)
    })
  } catch (error) {
    // Silent fail for title generation - don't impact user experience
    console.warn('Failed to trigger title generation:', error)
  }
}

/**
 * Retry title generation for failed attempts
 * Can be called manually from UI if title generation fails
 */
export async function retryTitleGeneration(conversationId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/conversations/${conversationId}/title`, {
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
    showLoading: titleStatus === 'pending' && title === 'New chat',
    showError: titleStatus === 'error',
    isReady: titleStatus === 'ready',
    shouldRetry: titleStatus === 'error'
  }
}

/**
 * Determines if we should trigger title generation after a message
 * Should trigger after first assistant response in a new conversation
 * This function is now used server-side in the chat API
 */
export function shouldTriggerTitleGeneration(
  titleStatus: string,
  messageCount: number
): boolean {
  // Only generate title for conversations with exactly 2 messages (1 user + 1 assistant)
  // and title status is still 'pending'
  return messageCount === 2 && titleStatus === 'pending'
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
