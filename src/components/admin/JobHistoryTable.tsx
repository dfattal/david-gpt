/**
 * JobHistoryTable Component
 * Displays paginated job history with status badges and action buttons
 */

'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Link as LinkIcon,
  FileCode,
  Upload,
  Eye,
  Loader2,
} from 'lucide-react';

interface Job {
  id: string;
  job_type: string;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  progress: {
    current: number;
    total: number;
    message: string;
  } | null;
  result_data: {
    docId?: string;
    title?: string;
  } | null;
  error: string | null;
}

interface JobHistoryTableProps {
  jobs: Job[];
  isLoading: boolean;
  onViewDetails: (jobId: string) => void;
  totalJobs: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function JobHistoryTable({
  jobs,
  isLoading,
  onViewDetails,
  totalJobs,
  currentPage,
  pageSize,
  onPageChange,
}: JobHistoryTableProps) {
  // Get job type icon and label
  const getJobTypeInfo = (jobType: string) => {
    const types: Record<string, { icon: any; label: string; color: string }> = {
      url_single: { icon: LinkIcon, label: 'URL Extraction', color: 'text-blue-600' },
      url_batch: { icon: LinkIcon, label: 'Batch URL', color: 'text-blue-600' },
      pdf: { icon: FileText, label: 'PDF Extraction', color: 'text-red-600' },
      markdown_single: { icon: FileCode, label: 'Markdown Extraction', color: 'text-green-600' },
      markdown_batch: { icon: FileCode, label: 'Batch Markdown', color: 'text-green-600' },
      reingest: { icon: Upload, label: 'Re-ingestion', color: 'text-purple-600' },
    };
    return types[jobType] || { icon: FileText, label: jobType, color: 'text-gray-600' };
  };

  // Get status badge variant
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-600">Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'processing':
        return <Badge variant="default" className="bg-blue-600">Processing</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Calculate duration
  const getDuration = (job: Job) => {
    if (!job.started_at) return '-';
    const endTime = job.completed_at ? new Date(job.completed_at) : new Date();
    const startTime = new Date(job.started_at);
    const durationMs = endTime.getTime() - startTime.getTime();
    const seconds = Math.floor(durationMs / 1000);

    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  const totalPages = Math.ceil(totalJobs / pageSize);
  const startIndex = (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalJobs);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">No jobs found</h3>
        <p className="text-sm text-muted-foreground">
          Try adjusting your filters or wait for new extraction/ingestion jobs to run.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => {
              const typeInfo = getJobTypeInfo(job.job_type);
              const Icon = typeInfo.icon;

              return (
                <TableRow key={job.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => onViewDetails(job.id)}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${typeInfo.color}`} />
                      <span className="font-medium">{typeInfo.label}</span>
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(job.status)}</TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{getDuration(job)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewDetails(job.id);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Details
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-2">
        <div className="text-sm text-muted-foreground">
          Showing {startIndex}-{endIndex} of {totalJobs} jobs
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <div className="text-sm">
            Page {currentPage} of {totalPages}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
