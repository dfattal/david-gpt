-- Migration: Processing Jobs Table
-- Description: Creates table for tracking document processing jobs
-- Date: 2025-01-27

-- Create processing jobs table
CREATE TABLE IF NOT EXISTS rag_processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id UUID NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL CHECK (job_type IN ('chunking', 'embedding', 'entity_extraction', 'full_processing')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
    progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    error_message TEXT,
    estimated_completion TIMESTAMPTZ,
    processing_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    CONSTRAINT valid_timestamps CHECK (
        (started_at IS NULL OR started_at >= created_at) AND
        (completed_at IS NULL OR completed_at >= COALESCE(started_at, created_at))
    )
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_processing_jobs_doc_id ON rag_processing_jobs(doc_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON rag_processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_job_type ON rag_processing_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_created_at ON rag_processing_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_priority_status ON rag_processing_jobs(priority, status);

-- Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status_type_created ON rag_processing_jobs(status, job_type, created_at DESC);

-- Add RLS (Row Level Security)
ALTER TABLE rag_processing_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: Admin users can see all jobs
CREATE POLICY "Admin users can view all processing jobs" ON rag_processing_jobs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.email IN ('dfattal@gmail.com')
        )
    );

-- Policy: Admin users can manage all jobs
CREATE POLICY "Admin users can manage all processing jobs" ON rag_processing_jobs
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.email IN ('dfattal@gmail.com')
        )
    );

-- Function to automatically update progress when status changes
CREATE OR REPLACE FUNCTION update_job_progress()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-set progress based on status
    IF NEW.status = 'completed' AND NEW.progress_percentage < 100 THEN
        NEW.progress_percentage := 100;
    END IF;
    
    IF NEW.status = 'failed' AND NEW.completed_at IS NULL THEN
        NEW.completed_at := NOW();
    END IF;
    
    IF NEW.status = 'cancelled' AND NEW.completed_at IS NULL THEN
        NEW.completed_at := NOW();
    END IF;
    
    -- Set started_at when job begins processing
    IF NEW.status = 'processing' AND OLD.status = 'pending' THEN
        NEW.started_at := NOW();
    END IF;
    
    -- Set completed_at when job finishes
    IF NEW.status IN ('completed', 'failed', 'cancelled') AND NEW.completed_at IS NULL THEN
        NEW.completed_at := NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic progress updates
DROP TRIGGER IF EXISTS trigger_update_job_progress ON rag_processing_jobs;
CREATE TRIGGER trigger_update_job_progress
    BEFORE UPDATE ON rag_processing_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_job_progress();

-- Create function to get job statistics
CREATE OR REPLACE FUNCTION get_job_stats()
RETURNS TABLE (
    total_jobs BIGINT,
    pending_jobs BIGINT,
    processing_jobs BIGINT,
    completed_jobs BIGINT,
    failed_jobs BIGINT,
    avg_processing_time_seconds NUMERIC,
    success_rate NUMERIC,
    jobs_last_hour BIGINT,
    jobs_last_24h BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) as total_jobs,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_jobs,
        COUNT(*) FILTER (WHERE status = 'processing') as processing_jobs,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_jobs,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs,
        COALESCE(
            AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (
                WHERE status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL
            ),
            0
        ) as avg_processing_time_seconds,
        CASE 
            WHEN COUNT(*) > 0 THEN 
                ROUND((COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC / COUNT(*)) * 100, 2)
            ELSE 0
        END as success_rate,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour') as jobs_last_hour,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as jobs_last_24h
    FROM rag_processing_jobs;
END;
$$ LANGUAGE plpgsql;

-- Insert some sample jobs for testing (optional)
-- This would normally be handled by the application processing system
/*
INSERT INTO rag_processing_jobs (doc_id, job_type, status, priority, processing_metadata)
SELECT 
    id,
    'full_processing',
    'completed',
    'normal',
    jsonb_build_object(
        'chunks_total', 10,
        'chunks_processed', 10,
        'embeddings_generated', 10,
        'processing_time_ms', 5000
    )
FROM rag_documents 
LIMIT 3;
*/

-- Comments for documentation
COMMENT ON TABLE rag_processing_jobs IS 'Tracks document processing and ingestion jobs';
COMMENT ON COLUMN rag_processing_jobs.job_type IS 'Type of processing: chunking, embedding, entity_extraction, or full_processing';
COMMENT ON COLUMN rag_processing_jobs.status IS 'Current status: pending, processing, completed, failed, or cancelled';
COMMENT ON COLUMN rag_processing_jobs.priority IS 'Job priority: low, normal, or high';
COMMENT ON COLUMN rag_processing_jobs.processing_metadata IS 'JSON metadata about processing progress and statistics';
COMMENT ON FUNCTION update_job_progress() IS 'Automatically updates job timestamps and progress based on status changes';
COMMENT ON FUNCTION get_job_stats() IS 'Returns comprehensive statistics about processing jobs';