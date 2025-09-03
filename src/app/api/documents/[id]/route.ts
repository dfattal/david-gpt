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

    // Check user role - members can view, admin can see all details
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const userRole = profile?.role || "guest";

    const { id: documentId } = await params;

    // Fetch document
    const { data: document, error } = await supabase
      .from("documents")
      .select(
        userRole === "admin"
          ? "*"
          : "id,title,doc_type,status,created_at,updated_at"
      )
      .eq("id", documentId)
      .single();

    if (error || !document) {
      throw new AppError("Document not found", 404);
    }

    return NextResponse.json({ document });
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

    // Check user role - only admin can update documents
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      throw new AppError("Admin access required", 403);
    }

    const { id: documentId } = await params;
    const updates = await req.json();

    // Validate allowed updates
    const allowedFields = [
      "title",
      "status",
      "doi",
      "url",
      "processing_status",
    ];
    const sanitizedUpdates = Object.keys(updates)
      .filter((key) => allowedFields.includes(key))
      .reduce((obj: any, key) => {
        obj[key] = updates[key];
        return obj;
      }, {});

    if (Object.keys(sanitizedUpdates).length === 0) {
      throw new AppError("No valid fields to update", 400);
    }

    sanitizedUpdates.updated_at = new Date().toISOString();

    // Update document
    const { data: document, error } = await supabase
      .from("documents")
      .update(sanitizedUpdates)
      .eq("id", documentId)
      .select()
      .single();

    if (error || !document) {
      console.error("Failed to update document:", error);
      throw new AppError("Failed to update document", 500);
    }

    return NextResponse.json({ document });
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

    // Check user role - only admin can delete documents
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      throw new AppError("Admin access required", 403);
    }

    const { id: documentId } = await params;

    // Get document to find file path
    const { data: document } = await supabase
      .from("documents")
      .select("file_path")
      .eq("id", documentId)
      .single();

    // Delete file from storage if it exists
    if (document?.file_path) {
      const { error: storageError } = await supabase.storage
        .from("documents")
        .remove([document.file_path]);

      if (storageError) {
        console.error("Failed to delete file from storage:", storageError);
        // Continue with document deletion even if file deletion fails
      }
    }

    // Delete document (related records will be deleted by cascade)
    const { error } = await supabase
      .from("documents")
      .delete()
      .eq("id", documentId);

    if (error) {
      console.error("Failed to delete document:", error);
      throw new AppError("Failed to delete document", 500);
    }

    return NextResponse.json({ message: "Document deleted successfully" });
  } catch (error) {
    return handleApiError(error);
  }
}
