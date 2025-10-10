/**
 * Admin Jobs Page
 * Job history and monitoring interface with filtering
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { JobHistoryTable } from '@/components/admin/JobHistoryTable';
import { JobDetailsModal } from '@/components/admin/JobDetailsModal';
import { Filter, X } from 'lucide-react';

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

export default function AdminJobsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // State
  const [jobs, setJobs] = useState<Job[]>([]);
  const [totalJobs, setTotalJobs] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  // Filters from URL
  const jobType = searchParams.get('job_type') || 'all';
  const status = searchParams.get('status') || 'all';
  const dateRange = searchParams.get('date_range') || '7d';
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = 50;

  // Update URL with new filter
  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.set('page', '1'); // Reset to page 1 on filter change
    router.push(`/admin/jobs?${params.toString()}`);
  };

  // Clear all filters
  const clearFilters = () => {
    router.push('/admin/jobs');
  };

  // Fetch jobs
  useEffect(() => {
    async function fetchJobs() {
      try {
        setIsLoading(true);
        setError(null);

        // Build query params
        const params = new URLSearchParams();
        if (jobType !== 'all') params.set('job_type', jobType);
        if (status !== 'all') params.set('status', status);
        params.set('limit', pageSize.toString());
        params.set('offset', ((page - 1) * pageSize).toString());

        // Add date range filter
        if (dateRange !== 'all') {
          const now = new Date();
          let startDate = new Date();

          switch (dateRange) {
            case '24h':
              startDate.setHours(now.getHours() - 24);
              break;
            case '7d':
              startDate.setDate(now.getDate() - 7);
              break;
            case '30d':
              startDate.setDate(now.getDate() - 30);
              break;
          }

          params.set('start_date', startDate.toISOString());
        }

        const response = await fetch(`/api/admin/jobs?${params.toString()}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch jobs');
        }

        setJobs(data.jobs);
        setTotalJobs(data.total);
      } catch (err) {
        console.error('Error fetching jobs:', err);
        setError(err instanceof Error ? err.message : 'Failed to load jobs');
      } finally {
        setIsLoading(false);
      }
    }

    fetchJobs();
  }, [jobType, status, dateRange, page]);

  const hasActiveFilters = jobType !== 'all' || status !== 'all' || dateRange !== '7d';

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Job History & Monitoring</h1>
          <p className="text-muted-foreground mt-2">
            View and monitor all extraction and ingestion jobs
          </p>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                <CardTitle>Filters</CardTitle>
              </div>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-2" />
                  Clear Filters
                </Button>
              )}
            </div>
            <CardDescription>Filter jobs by type, status, and date range</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {/* Job Type Filter */}
              <div>
                <label className="text-sm font-medium mb-2 block">Job Type</label>
                <Select value={jobType} onValueChange={(value) => updateFilter('job_type', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="url_single">URL Extraction</SelectItem>
                    <SelectItem value="url_batch">Batch URL</SelectItem>
                    <SelectItem value="pdf">PDF Extraction</SelectItem>
                    <SelectItem value="markdown_single">Markdown Extraction</SelectItem>
                    <SelectItem value="markdown_batch">Batch Markdown</SelectItem>
                    <SelectItem value="reingest">Re-ingestion</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Status Filter */}
              <div>
                <label className="text-sm font-medium mb-2 block">Status</label>
                <Select value={status} onValueChange={(value) => updateFilter('status', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date Range Filter */}
              <div>
                <label className="text-sm font-medium mb-2 block">Date Range</label>
                <Select value={dateRange} onValueChange={(value) => updateFilter('date_range', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">Last 24 Hours</SelectItem>
                    <SelectItem value="7d">Last 7 Days</SelectItem>
                    <SelectItem value="30d">Last 30 Days</SelectItem>
                    <SelectItem value="all">All Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error Display */}
        {error && (
          <Card className="mb-6 border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Error Loading Jobs</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* Job History Table */}
        <Card>
          <CardHeader>
            <CardTitle>Job History</CardTitle>
            <CardDescription>
              {isLoading ? 'Loading...' : `${totalJobs} total jobs`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <JobHistoryTable
              jobs={jobs}
              isLoading={isLoading}
              onViewDetails={setSelectedJobId}
              totalJobs={totalJobs}
              currentPage={page}
              pageSize={pageSize}
              onPageChange={(newPage) => {
                const params = new URLSearchParams(searchParams.toString());
                params.set('page', newPage.toString());
                router.push(`/admin/jobs?${params.toString()}`);
              }}
            />
          </CardContent>
        </Card>

        {/* Job Details Modal */}
        {selectedJobId && (
          <JobDetailsModal
            jobId={selectedJobId}
            isOpen={!!selectedJobId}
            onClose={() => setSelectedJobId(null)}
          />
        )}
      </div>
    </div>
  );
}
