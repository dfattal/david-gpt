/**
 * Job Queue Types and Interfaces
 * Defines types for all extraction and ingestion jobs
 */

// Job type enumeration
export type JobType =
  | 'url_single'
  | 'url_batch'
  | 'pdf'
  | 'markdown_single'
  | 'markdown_batch'
  | 'upload'
  | 'reingest';

// Job status enumeration
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

// Job progress tracking
export interface JobProgress {
  current: number;
  total: number;
  message: string;
}

// Base job data interface
export interface BaseJobData {
  userId: string;
  personaSlugs: string[]; // Changed from personaSlug - supports multi-persona assignment
}

// Single URL extraction job
export interface UrlSingleJobData extends BaseJobData {
  url: string;
  docType?: string;
  tags?: string[];
  aka?: string;
}

// Batch URL extraction job
export interface UrlBatchJobData extends BaseJobData {
  urls: Array<{
    url: string;
    docType?: string;
    tags?: string[];
    aka?: string;
  }>;
}

// PDF extraction job
export interface PdfJobData extends BaseJobData {
  pdfBase64: string; // PDF file as base64 string
  filename: string;
  docType?: string;
}

// Single RAW markdown extraction job
export interface MarkdownSingleJobData extends BaseJobData {
  content: string;
  filename: string;
}

// Batch RAW markdown extraction job
export interface MarkdownBatchJobData extends BaseJobData {
  files: Array<{
    content: string;
    filename: string;
  }>;
}

// Formatted markdown upload (ingestion) job
export interface UploadJobData extends BaseJobData {
  files: Array<{
    content: string;
    filename: string;
  }>;
  ingestImmediately: boolean;
}

// Re-ingestion job
export interface ReingestJobData extends BaseJobData {
  docId: string;
}

// Union type for all job data
export type JobData =
  | UrlSingleJobData
  | UrlBatchJobData
  | PdfJobData
  | MarkdownSingleJobData
  | MarkdownBatchJobData
  | UploadJobData
  | ReingestJobData;

// Job result data
export interface JobResult {
  success: boolean;
  docIds?: string[];
  storedDocuments?: Array<{
    docId: string;
    title: string;
    storagePath: string;
  }>;
  stats?: {
    total: number;
    successful: number;
    failed: number;
  };
  error?: string;
}

// Extraction job database record
export interface ExtractionJob {
  id: string;
  job_type: JobType;
  status: JobStatus;
  progress: JobProgress;
  input_data: JobData;
  result_data: JobResult;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  user_id: string;
  created_by: string | null;
}

// Job creation parameters
export interface CreateJobParams {
  jobType: JobType;
  inputData: JobData;
  userId: string;
}

// Job update parameters
export interface UpdateJobParams {
  status?: JobStatus;
  progress?: Partial<JobProgress>;
  resultData?: Partial<JobResult>;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

// SSE progress event
export interface ProgressEvent {
  jobId: string;
  status: JobStatus;
  progress: JobProgress;
  timestamp: string;
}
