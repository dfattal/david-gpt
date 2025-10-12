/**
 * Admin Analytics Dashboard
 * Per-persona RAG quality insights and AI-powered gap analysis
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AnalyticsOverview } from '@/components/admin/AnalyticsOverview';
import { FailedQueriesTable } from '@/components/admin/FailedQueriesTable';
import { GapAnalysisPanel } from '@/components/admin/GapAnalysisPanel';
import { Home, Loader2, AlertCircle } from 'lucide-react';

interface Persona {
  slug: string;
  name: string;
  expertise: string;
}

interface AnalyticsData {
  persona: {
    slug: string;
    name: string;
    expertise: string;
    content: string;
    config_json: any;
  };
  stats: {
    total_conversations: number;
    avg_rag_weight: number | null;
    total_citations: number;
    low_rag_messages: number;
    total_assistant_messages: number;
    citation_rate: number;
  };
  conversations: any[];
  documents: {
    count: number;
    types: string[];
  };
}

export default function AnalyticsPage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<string>('');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPersonas, setIsLoadingPersonas] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch personas on mount
  useEffect(() => {
    async function fetchPersonas() {
      try {
        const response = await fetch('/api/admin/personas');
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch personas');
        }

        setPersonas(data.personas || []);

        // Auto-select first persona
        if (data.personas && data.personas.length > 0) {
          setSelectedPersona(data.personas[0].slug);
        }
      } catch (err) {
        console.error('Error fetching personas:', err);
        setError(err instanceof Error ? err.message : 'Failed to load personas');
      } finally {
        setIsLoadingPersonas(false);
      }
    }

    fetchPersonas();
  }, []);

  // Fetch analytics data when persona changes
  useEffect(() => {
    if (!selectedPersona) return;

    async function fetchAnalytics() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/admin/analytics?persona_slug=${selectedPersona}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch analytics');
        }

        setAnalyticsData(data.data);
      } catch (err) {
        console.error('Error fetching analytics:', err);
        setError(err instanceof Error ? err.message : 'Failed to load analytics data');
      } finally {
        setIsLoading(false);
      }
    }

    fetchAnalytics();
  }, [selectedPersona]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        {/* Breadcrumb Navigation */}
        <div className="mb-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin">
              <Home className="h-4 w-4 mr-2" />
              Back to Admin
            </Link>
          </Button>
        </div>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">RAG Analytics Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Analyze RAG quality and identify knowledge gaps per persona
          </p>
        </div>

        {/* Persona Selector */}
        <div className="mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Select Persona</CardTitle>
              <CardDescription>Choose a persona to analyze RAG performance</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingPersonas ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Loading personas...</span>
                </div>
              ) : personas.length === 0 ? (
                <p className="text-sm text-muted-foreground">No personas found</p>
              ) : (
                <Select value={selectedPersona} onValueChange={setSelectedPersona}>
                  <SelectTrigger className="w-full md:w-[400px]">
                    <SelectValue placeholder="Select a persona" />
                  </SelectTrigger>
                  <SelectContent>
                    {personas.map((persona) => (
                      <SelectItem key={persona.slug} value={persona.slug}>
                        <div>
                          <p className="font-medium">{persona.name}</p>
                          <p className="text-xs text-muted-foreground">{persona.expertise}</p>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Error State */}
        {error && (
          <Card className="mb-8 border-destructive">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <CardTitle className="text-destructive">Error Loading Analytics</CardTitle>
              </div>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Loading analytics data...</span>
          </div>
        )}

        {/* Analytics Content */}
        {analyticsData && !isLoading && (
          <div className="space-y-8">
            {/* Overview Stats */}
            <div>
              <h2 className="text-xl font-semibold mb-4">Overview</h2>
              <AnalyticsOverview stats={analyticsData.stats} />
            </div>

            {/* Failed Queries Table */}
            <div>
              <h2 className="text-xl font-semibold mb-4">Low RAG Weight Conversations</h2>
              <FailedQueriesTable conversations={analyticsData.conversations} />
            </div>

            {/* Gap Analysis Panel */}
            <div>
              <h2 className="text-xl font-semibold mb-4">Knowledge Gap Analysis</h2>
              <GapAnalysisPanel
                personaSlug={selectedPersona}
                conversations={analyticsData.conversations}
              />
            </div>

            {/* Document Coverage Summary */}
            <div>
              <Card>
                <CardHeader>
                  <CardTitle>Current Knowledge Base</CardTitle>
                  <CardDescription>Documents ingested for this persona</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-8">
                    <div>
                      <p className="text-2xl font-bold">{analyticsData.documents.count}</p>
                      <p className="text-sm text-muted-foreground">Total documents</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-2">Document Types:</p>
                      <div className="flex flex-wrap gap-2">
                        {analyticsData.documents.types.length > 0 ? (
                          analyticsData.documents.types.map((type) => (
                            <span
                              key={type}
                              className="px-2 py-1 bg-muted text-muted-foreground text-xs rounded"
                            >
                              {type}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">No documents yet</span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
