/**
 * JobDetailsModal Component
 * Displays detailed job information including input, output, and error data
 */

'use client';

import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, ExternalLink, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface JobDetails {
  id: string;
  job_type: string;
  status: string;
  progress: any;
  input_data: any;
  result_data: any;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  user_id: string;
  duration_ms: number | null;
}

interface JobDetailsModalProps {
  jobId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function JobDetailsModal({ jobId, isOpen, onClose }: JobDetailsModalProps) {
  const [job, setJob] = useState<JobDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!isOpen || !jobId) return;

    async function fetchJobDetails() {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/admin/jobs/${jobId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch job details');
        }

        setJob(data.job);
      } catch (err) {
        console.error('Error fetching job details:', err);
        setError(err instanceof Error ? err.message : 'Failed to load job details');
      } finally {
        setIsLoading(false);
      }
    }

    fetchJobDetails();
  }, [jobId, isOpen]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied to clipboard',
      description: `${label} copied successfully`,
    });
  };

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

  const formatDuration = (ms: number | null) => {
    if (ms === null) return '-';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Job Details</DialogTitle>
          <DialogDescription>
            Detailed information about job execution
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Error Loading Job</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        ) : job ? (
          <div className="space-y-4">
            {/* Job Info Card */}
            <Card>
              <CardHeader>
                <CardTitle>Job Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Job ID</div>
                    <div className="flex items-center gap-2">
                      <code className="text-sm">{job.id}</code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(job.id, 'Job ID')}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Job Type</div>
                    <div className="text-sm font-mono">{job.job_type}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Status</div>
                    <div>{getStatusBadge(job.status)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Duration</div>
                    <div className="text-sm">{formatDuration(job.duration_ms)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Created</div>
                    <div className="text-sm">
                      {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Started</div>
                    <div className="text-sm">
                      {job.started_at
                        ? formatDistanceToNow(new Date(job.started_at), { addSuffix: true })
                        : '-'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabs for detailed data */}
            <Tabs defaultValue="input" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="input">Input Data</TabsTrigger>
                <TabsTrigger value="result">Result Data</TabsTrigger>
                {job.error && <TabsTrigger value="error">Error</TabsTrigger>}
              </TabsList>

              <TabsContent value="input">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Input Data</CardTitle>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(JSON.stringify(job.input_data, null, 2), 'Input data')}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy JSON
                      </Button>
                    </div>
                    <CardDescription>Parameters passed to the job</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto max-h-96">
                      {JSON.stringify(job.input_data, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="result">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Result Data</CardTitle>
                      <div className="flex gap-2">
                        {job.result_data?.docId && (
                          <Button
                            variant="outline"
                            size="sm"
                            asChild
                          >
                            <a href={`/admin/rag?doc=${job.result_data.docId}`} target="_blank">
                              <ExternalLink className="h-4 w-4 mr-2" />
                              View Document
                            </a>
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(JSON.stringify(job.result_data, null, 2), 'Result data')}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Copy JSON
                        </Button>
                      </div>
                    </div>
                    <CardDescription>Data returned by the job</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {job.result_data ? (
                      <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto max-h-96">
                        {JSON.stringify(job.result_data, null, 2)}
                      </pre>
                    ) : (
                      <div className="text-sm text-muted-foreground py-4 text-center">
                        No result data available
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {job.error && (
                <TabsContent value="error">
                  <Card className="border-destructive">
                    <CardHeader>
                      <CardTitle className="text-destructive">Error Details</CardTitle>
                      <CardDescription>Error message from failed job</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-xs bg-destructive/10 p-4 rounded-lg overflow-x-auto max-h-96 text-destructive">
                        {job.error}
                      </pre>
                    </CardContent>
                  </Card>
                </TabsContent>
              )}
            </Tabs>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
