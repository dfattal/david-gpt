import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { createClient } from "@/lib/supabase/server";

export async function generateConversationTitle(
  conversationId: string,
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  try {
    if (messages.length === 0) {
      return "New Conversation";
    }

    // Get the first few messages to generate a title
    const contextMessages = messages.slice(0, 3);
    const messageText = contextMessages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n");

    const result = await generateText({
      model: openai("gpt-4o-mini"),
      prompt: `Generate a concise, descriptive title (max 6 words) for this conversation:\n\n${messageText}`,
      temperature: 0.3,
      maxTokens: 20,
    });

    const title = result.text.trim().replace(/['"]/g, "");

    // Update the conversation title in the database
    const supabase = await createClient();
    await supabase
      .from("conversations")
      .update({ title })
      .eq("id", conversationId);

    return title;
  } catch (error) {
    console.error("Failed to generate conversation title:", error);
    return "New Conversation";
  }
}