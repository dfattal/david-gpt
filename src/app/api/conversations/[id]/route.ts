import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AppError, handleApiError } from "@/lib/utils";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: conversationId } = await params;

    console.log(`🔍 Fetching conversation: ${conversationId} for user: ${user.id}`);

    // Fetch conversation with messages
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .single();

    if (convError || !conversation) {
      console.log(`❌ Conversation not found: ${conversationId} for user ${user.id}. Error:`, convError);
      throw new AppError("Conversation not found", 404);
    }

    // Fetch messages for this conversation (including metadata for citations and RAG weight)
    const { data: messages, error: msgError } = await supabase
      .from("messages")
      .select("id, conversation_id, role, content, created_at, metadata, rag_weight, rag_weight_breakdown")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (msgError) {
      console.error("Failed to fetch messages:", msgError);
      throw new AppError("Failed to fetch messages", 500);
    }

    return NextResponse.json({
      conversation,
      messages,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: conversationId } = await params;
    const { title }: { title: string } = await req.json();

    if (!title?.trim()) {
      throw new AppError("Title is required", 400);
    }

    // Update conversation title
    const { data: conversation, error } = await supabase
      .from("conversations")
      .update({
        title: title.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error || !conversation) {
      console.error("Failed to update conversation:", error);
      throw new AppError("Failed to update conversation", 500);
    }

    return NextResponse.json({ conversation });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: conversationId } = await params;

    // Delete conversation (messages will be deleted by cascade)
    const { error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", conversationId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Failed to delete conversation:", error);
      throw new AppError("Failed to delete conversation", 500);
    }

    return NextResponse.json({ message: "Conversation deleted successfully" });
  } catch (error) {
    return handleApiError(error);
  }
}
