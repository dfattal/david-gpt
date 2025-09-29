import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AppError, handleApiError } from "@/lib/utils";
import { generateConversationTitle } from "@/lib/title-generation";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get the authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new AppError("Authentication required", 401);
    }

    // Get query parameters
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Fetch conversations ordered by last message time
    const { data: conversations, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", user.id)
      .order("last_message_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Failed to fetch conversations:", error);
      throw new AppError("Failed to fetch conversations", 500);
    }

    return NextResponse.json({ conversations });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get the authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new AppError("Authentication required", 401);
    }

    // Authenticated users can save conversations

    const {
      title,
      firstMessage,
    }: {
      title?: string;
      firstMessage?: string;
    } = await req.json();

    // Create new conversation with default "New Chat" title
    const { data: conversation, error } = await supabase
      .from("conversations")
      .insert({
        user_id: user.id,
        title: title || "New Chat",
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create conversation:", error);
      throw new AppError("Failed to create conversation", 500);
    }

    // If there's a first message, save it and trigger title generation
    if (firstMessage) {
      console.log(`💬 Saving first message for conversation ${conversation.id}: "${firstMessage.substring(0, 50)}..."`);

      const { error: messageError } = await supabase.from("messages").insert({
        conversation_id: conversation.id,
        role: "user",
        content: firstMessage,
      });

      if (messageError) {
        console.error("❌ Failed to save first message:", messageError);
        // Don't fail the conversation creation if message save fails
      } else {
        console.log(`✅ First message saved successfully`);
      }

      // Trigger async title generation (non-blocking)
      // Don't await this - let it happen in background
      console.log(`🚀 Triggering title generation for conversation ${conversation.id}`);
      generateConversationTitle(conversation.id, firstMessage, user.id)
        .then((result) => {
          if (result.success) {
            console.log(`✅ Title generation completed: "${result.title}"`);
          } else {
            console.error(`❌ Title generation failed: ${result.error}`);
          }
        })
        .catch((error) => {
          console.error("❌ Failed to trigger title generation:", error);
          // Don't fail the conversation creation if title generation fails
        });
    } else {
      console.log(`⚠️ No first message provided for conversation ${conversation.id}`);
    }

    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
