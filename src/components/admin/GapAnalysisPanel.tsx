/**
 * Gap Analysis Panel Component
 * Displays AI-powered recommendations for filling knowledge gaps
 */

'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, TrendingUp, FileText, AlertCircle, Loader2, ExternalLink } from 'lucide-react';

interface SuggestedDocument {
  type: 'paper' | 'patent' | 'blog' | 'technical_doc';
  keywords: string[];
  rationale: string;
}

interface Gap {
  topic: string;
  description: string;
  failed_query_count: number;
  priority: 'high' | 'medium' | 'low';
  suggested_documents: SuggestedDocument[];
}

interface GapAnalysisData {
  gaps: Gap[];
  overall_assessment: string;
  off_topic_query_count: number;
  total_queries_analyzed?: number;
  relevant_queries_count?: number;
}

interface GapAnalysisPanelProps {
  personaSlug: string;
  conversations: any[];
}

export function GapAnalysisPanel({ personaSlug, conversations }: GapAnalysisPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [analysisData, setAnalysisData] = useState<GapAnalysisData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyzeGaps = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/analytics/gap-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          persona_slug: personaSlug,
          failed_conversations: conversations,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze gaps');
      }

      setAnalysisData(data.data);
    } catch (err) {
      console.error('Gap analysis error:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyze knowledge gaps');
    } finally {
      setIsLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-500 text-white';
      case 'medium':
        return 'bg-yellow-500 text-white';
      case 'low':
        return 'bg-blue-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const getDocTypeIcon = (type: string) => {
    switch (type) {
      case 'paper':
        return '📄';
      case 'patent':
        return '⚖️';
      case 'blog':
        return '📝';
      case 'technical_doc':
        return '📚';
      default:
        return '📑';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              AI Knowledge Gap Analysis
            </CardTitle>
            <CardDescription>
              Gemini-powered recommendations for improving RAG coverage
            </CardDescription>
          </div>
          <Button onClick={analyzeGaps} disabled={isLoading || conversations.length === 0}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Analyze Gaps
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {!analysisData && !error && !isLoading && (
          <div className="text-center py-8">
            <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">
              Click "Analyze Gaps" to get AI-powered recommendations for improving knowledge coverage
            </p>
          </div>
        )}

        {analysisData && (
          <div className="space-y-6">
            {/* Overall Assessment */}
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <h3 className="text-sm font-semibold text-purple-900 mb-2">Overall Assessment</h3>
              <p className="text-sm text-purple-800">{analysisData.overall_assessment}</p>
              <div className="flex gap-4 mt-3 text-xs text-purple-700">
                <span>Total queries: {analysisData.total_queries_analyzed || 0}</span>
                <span>Relevant: {analysisData.relevant_queries_count || 0}</span>
                <span>Off-topic filtered: {analysisData.off_topic_query_count}</span>
              </div>
            </div>

            {/* Knowledge Gaps */}
            {analysisData.gaps.length === 0 ? (
              <div className="text-center py-8">
                <TrendingUp className="h-12 w-12 text-green-600 mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">
                  No significant knowledge gaps identified. RAG coverage is good!
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Identified Knowledge Gaps ({analysisData.gaps.length})</h3>
                {analysisData.gaps.map((gap, index) => (
                  <div key={index} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-medium text-sm">{gap.topic}</h4>
                          <Badge className={getPriorityColor(gap.priority)}>
                            {gap.priority.toUpperCase()}
                          </Badge>
                          <Badge variant="outline">
                            {gap.failed_query_count} failed {gap.failed_query_count === 1 ? 'query' : 'queries'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{gap.description}</p>
                      </div>
                    </div>

                    {/* Suggested Documents */}
                    <div className="space-y-2">
                      <h5 className="text-xs font-semibold text-muted-foreground uppercase">
                        Suggested Documents to Ingest
                      </h5>
                      {gap.suggested_documents.map((doc, docIndex) => (
                        <div key={docIndex} className="bg-muted/50 rounded p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{getDocTypeIcon(doc.type)}</span>
                            <Badge variant="secondary" className="text-xs">
                              {doc.type.replace('_', ' ')}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{doc.rationale}</p>
                          <div className="flex flex-wrap gap-1">
                            <span className="text-xs text-muted-foreground">Keywords:</span>
                            {doc.keywords.map((keyword, kwIndex) => (
                              <Badge key={kwIndex} variant="outline" className="text-xs">
                                {keyword}
                              </Badge>
                            ))}
                          </div>
                          <div className="flex gap-2 mt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              onClick={() => {
                                const searchQuery = doc.keywords.join(' ');
                                window.open(
                                  `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`,
                                  '_blank'
                                );
                              }}
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              Search Google
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              onClick={() => {
                                const searchQuery = doc.keywords.join(' ');
                                window.open(
                                  `https://scholar.google.com/scholar?q=${encodeURIComponent(searchQuery)}`,
                                  '_blank'
                                );
                              }}
                            >
                              <FileText className="h-3 w-3 mr-1" />
                              Google Scholar
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
