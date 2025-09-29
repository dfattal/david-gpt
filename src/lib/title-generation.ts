import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { createClient } from "@/lib/supabase/server";
import { broadcastTitleUpdate } from "@/lib/sse-broadcaster";

export async function generateConversationTitle(
  conversationId: string,
  firstMessage: string,
  userId: string
): Promise<{ success: boolean; title?: string; error?: string }> {
  try {
    console.log(`🎯 Starting title generation for conversation ${conversationId}, user ${userId}, message: "${firstMessage.substring(0, 50)}..."`);

    if (!firstMessage || firstMessage.trim().length === 0) {
      console.log(`⚠️ No first message provided, using default title`);
      return { success: true, title: "New Conversation" };
    }

    console.log(`🤖 Calling OpenAI for title generation...`);
    const result = await generateText({
      model: openai("gpt-4o-mini"),
      prompt: `Generate a concise, descriptive title (max 6 words) for this conversation:\n\nuser: ${firstMessage}`,
      temperature: 0.3,
      maxTokens: 20,
    });

    const title = result.text.trim().replace(/['"]/g, "");
    console.log(`📝 Generated title: "${title}"`);

    // Update the conversation title in the database
    console.log(`💾 Updating conversation ${conversationId} with title: "${title}"`);
    const supabase = await createClient();
    const { error: updateError } = await supabase
      .from("conversations")
      .update({ title })
      .eq("id", conversationId)
      .eq("user_id", userId); // Ensure user owns this conversation

    if (updateError) {
      console.error("❌ Failed to update conversation title:", updateError);
      return { success: false, error: "Failed to update title in database" };
    }

    console.log(`✅ Successfully generated and saved title: "${title}"`);

    // Broadcast the title update via SSE
    console.log(`📡 Broadcasting title update via SSE for user ${userId}`);
    broadcastTitleUpdate(userId, conversationId, title);

    return { success: true, title };
  } catch (error) {
    console.error("❌ Title generation failed with error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error) || "Unknown error";
    return { success: false, error: errorMessage };
  }
}