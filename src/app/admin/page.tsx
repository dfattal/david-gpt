/**
 * Admin Landing Page
 * Central dashboard for navigation to admin sections and system overview
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminStatsCard } from '@/components/admin/AdminStatsCard';
import { Button } from '@/components/ui/button';
import {
  Database,
  Users,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  Activity,
  ArrowRight,
  Home,
} from 'lucide-react';

interface AdminStats {
  documents: {
    total: number;
    extracted: number;
    ingested: number;
    failed: number;
  };
  personas: {
    total: number;
  };
  jobs: {
    last24h: number;
    pending: number;
    failed: number;
  };
}

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/admin/stats');
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch stats');
        }

        setStats(data.stats);
      } catch (err) {
        console.error('Error fetching admin stats:', err);
        setError(err instanceof Error ? err.message : 'Failed to load statistics');
      } finally {
        setIsLoading(false);
      }
    }

    fetchStats();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        {/* Breadcrumb Navigation */}
        <div className="mb-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">
              <Home className="h-4 w-4 mr-2" />
              Back to Home
            </Link>
          </Button>
        </div>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Manage your RAG knowledge base, personas, and system configuration
          </p>
        </div>

        {/* Statistics Overview */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="space-y-2">
                  <div className="h-4 bg-muted rounded w-1/2"></div>
                </CardHeader>
                <CardContent>
                  <div className="h-8 bg-muted rounded w-1/3"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card className="mb-8 border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Error Loading Statistics</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        ) : stats ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
            <AdminStatsCard
              title="Total Documents"
              description={`${stats.documents.ingested} ingested, ${stats.documents.extracted} pending ingestion`}
              value={stats.documents.total}
              icon={FileText}
              iconColor="text-blue-600"
            />
            <AdminStatsCard
              title="Personas"
              description="Active AI personas"
              value={stats.personas.total}
              icon={Users}
              iconColor="text-purple-600"
            />
            <AdminStatsCard
              title="Jobs (24h)"
              description={`${stats.jobs.pending} pending, ${stats.jobs.failed} failed`}
              value={stats.jobs.last24h}
              icon={Activity}
              iconColor="text-green-600"
            />
            <AdminStatsCard
              title="Ingestion Rate"
              description={`${stats.documents.failed} failed documents`}
              value={
                stats.documents.total > 0
                  ? `${Math.round((stats.documents.ingested / stats.documents.total) * 100)}%`
                  : '0%'
              }
              icon={CheckCircle}
              iconColor="text-emerald-600"
            />
          </div>
        ) : null}

        {/* Navigation Cards */}
        <div className="grid gap-6 md:grid-cols-3 mb-8">
          {/* RAG Management Card */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <Database className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle>RAG Document Management</CardTitle>
                  <CardDescription>
                    Upload, extract, and manage knowledge base documents
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span>Extract from PDFs, URLs, and markdown files</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                  <span>Preview and edit before ingestion</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>Async job processing with progress tracking</span>
                </div>
              </div>
              <Button className="w-full" asChild>
                <Link href="/admin/rag">
                  Manage Documents
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Persona Management Card */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
                  <Users className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <CardTitle>Persona Management</CardTitle>
                  <CardDescription>
                    Create and configure AI personas with custom knowledge
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>Create personas from definition files</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                  <span>Configure retrieval settings and topics</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span>Assign documents to multiple personas</span>
                </div>
              </div>
              <Button className="w-full" asChild>
                <Link href="/admin/personas">
                  Manage Personas
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Job Queue Management Card */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
                  <Activity className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <CardTitle>Job Queue Management</CardTitle>
                  <CardDescription>
                    View job history, monitor progress, and debug failures
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span>View complete job history with filtering</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                  <span>Track extraction and ingestion progress</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                  <span>Debug failed jobs with detailed error logs</span>
                </div>
              </div>
              <Button className="w-full" asChild>
                <Link href="/admin/jobs">
                  View Job History
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* System Status */}
        {stats && (
          <Card>
            <CardHeader>
              <CardTitle>System Status</CardTitle>
              <CardDescription>Current state of the RAG system</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm font-medium">Ingested Documents</p>
                    <p className="text-2xl font-bold">{stats.documents.ingested}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-yellow-600" />
                  <div>
                    <p className="text-sm font-medium">Pending Ingestion</p>
                    <p className="text-2xl font-bold">{stats.documents.extracted}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <XCircle className="h-5 w-5 text-red-600" />
                  <div>
                    <p className="text-sm font-medium">Failed</p>
                    <p className="text-2xl font-bold">{stats.documents.failed}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
