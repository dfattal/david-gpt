import { NextRequest } from "next/server";
import { documentProcessingQueue } from "@/lib/rag/processing-queue";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    // Stop the in-memory processing loop
    documentProcessingQueue.stopProcessing();

    // Cancel queued/processing jobs in the database
    const supabase = createServiceClient();
    const nowIso = new Date().toISOString();

    const { data: cancelledRows, error } = await supabase
      .from("rag_ingest_jobs")
      .update({
        status: "error",
        updated_at: nowIso,
        error: "Cancelled by stop endpoint",
      })
      .in("status", ["queued", "processing"])
      .select("id");

    if (error) {
      return Response.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      cancelled_count: cancelledRows?.length || 0,
    });
  } catch (err) {
    return Response.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
