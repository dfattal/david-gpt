/**
 * Job Status Chip Component
 * Displays real-time job status for extraction/ingestion operations
 */

'use client';

import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type JobStatus = 'extracting' | 'ingesting' | 'completed' | 'failed' | null;

interface JobStatusChipProps {
  status: JobStatus;
  progress?: {
    current: number;
    total: number;
    message: string;
  };
  timestamp?: string; // ISO timestamp for normal "last updated" display
  error?: string; // Error message for failed jobs
}

export function JobStatusChip({
  status,
  progress,
  timestamp,
  error,
}: JobStatusChipProps) {
  // No active job - show normal timestamp
  if (!status && timestamp) {
    return (
      <span className="text-sm text-muted-foreground">
        {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
      </span>
    );
  }

  // No status and no timestamp - show dash
  if (!status) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  // Calculate progress percentage
  const percentage =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  // Extracting state (blue, animated)
  if (status === 'extracting') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin" />
              Extracting {percentage > 0 && `(${percentage}%)`}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{progress?.message || 'Extracting document...'}</p>
            {progress && progress.total > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Step {progress.current} of {progress.total}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Ingesting state (purple, animated)
  if (status === 'ingesting') {
    const stepDisplay =
      progress && progress.total > 0
        ? `(${progress.current}/${progress.total})`
        : '';

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin" />
              Ingesting {stepDisplay}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{progress?.message || 'Creating chunks and embeddings...'}</p>
            {progress && progress.total > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Step {progress.current} of {progress.total}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Completed state (green checkmark)
  if (status === 'completed') {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
        <CheckCircle className="h-3 w-3" />
        Just now
      </div>
    );
  }

  // Failed state (red, shows error on hover)
  if (status === 'failed') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium cursor-help">
              <XCircle className="h-3 w-3" />
              Failed
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-xs font-medium mb-1">Error:</p>
            <p className="text-xs">{error || 'Unknown error occurred'}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return null;
}
