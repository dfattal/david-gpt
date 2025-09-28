import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { createClient } from '@/lib/supabase/server';
import { sendTitleUpdate } from '@/lib/sse-manager';

export async function generateConversationTitle(
  conversationId: string,
  firstMessage: string,
  userId: string
): Promise<{ success: boolean; title?: string; error?: string }> {
  try {
    console.log(
      `🤖 Starting title generation for conversation ${conversationId}`
    );
    console.log(`📝 First message: "${firstMessage}"`);

    // Validate OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY environment variable');
    }

    // Generate title using GPT-4o
    const result = await generateText({
      model: openai('gpt-4o'),
      system: `You are a title generator. Create a concise, descriptive title for a conversation based on the user's first message. 

Rules:
- Maximum 45 characters (strictly enforced)
- Be specific and descriptive
- Use title case
- No quotes or special formatting
- Capture the essence of the question/topic
- If it's a greeting, use a relevant topic-based title

Examples:
- "What is AI?" → "AI Fundamentals"
- "How do neural networks work?" → "Neural Network Mechanics"
- "Tell me about yourself" → "About David Fattal"
- "Can you help with React hooks?" → "React Hooks Assistance"`,
      prompt: `Generate a title for this conversation starter: "${firstMessage}"`,
      temperature: 0.3,
      maxTokens: 20,
    });

    let generatedTitle = result.text.trim();

    // Strip quotes from the title (both single and double quotes)
    generatedTitle = generatedTitle.replace(/^["']|["']$/g, '');

    // Ensure the title doesn't exceed 45 characters
    const finalTitle =
      generatedTitle.length > 45
        ? generatedTitle.substring(0, 42) + '...'
        : generatedTitle;

    console.log(`✨ Generated title: "${finalTitle}"`);

    // Update the conversation with the generated title
    const supabase = await createClient();
    const { error: updateError } = await supabase
      .from('conversations')
      .update({
        title: finalTitle,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .eq('user_id', userId);

    if (updateError) {
      console.error('Failed to update conversation title:', updateError);
      throw new Error('Failed to update conversation title');
    }

    console.log(`💾 Updated conversation ${conversationId} in database`);

    // Send real-time update to connected client
    console.log(`📡 Sending SSE update to user: ${userId}`);
    const sseSuccess = sendTitleUpdate(userId, {
      conversationId,
      title: finalTitle,
    });

    if (!sseSuccess) {
      console.warn(`⚠️ SSE update failed for user ${userId}`);
    } else {
      console.log(`✅ SSE update sent successfully`);
    }

    return { success: true, title: finalTitle };
  } catch (error) {
    console.error('❌ Title generation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
