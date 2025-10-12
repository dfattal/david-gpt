/**
 * Analytics Overview Component
 * Displays key statistics for persona RAG performance
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus, FileText, MessageSquare, Link as LinkIcon, AlertCircle } from 'lucide-react';

interface AnalyticsStats {
  total_conversations: number;
  avg_rag_weight: number | null;
  total_citations: number;
  low_rag_messages: number;
  total_assistant_messages: number;
  citation_rate: number;
}

interface AnalyticsOverviewProps {
  stats: AnalyticsStats;
}

export function AnalyticsOverview({ stats }: AnalyticsOverviewProps) {
  const avgRagWeight = stats.avg_rag_weight ?? 0;
  const avgRagWeightPercent = Math.round(avgRagWeight * 100);

  // Determine RAG weight trend icon and color
  const getRagWeightStatus = (weight: number) => {
    if (weight >= 0.7) {
      return {
        icon: TrendingUp,
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        label: 'Excellent',
      };
    } else if (weight >= 0.4) {
      return {
        icon: Minus,
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100',
        label: 'Good',
      };
    } else {
      return {
        icon: TrendingDown,
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        label: 'Needs Improvement',
      };
    }
  };

  const ragWeightStatus = getRagWeightStatus(avgRagWeight);
  const RagWeightIcon = ragWeightStatus.icon;

  // Calculate knowledge gap score (inverse of avg RAG weight, 0-100 scale)
  const knowledgeGapScore = Math.round((1 - avgRagWeight) * 100);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Average RAG Weight */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg RAG Weight</CardTitle>
          <div className={`p-2 ${ragWeightStatus.bgColor} rounded-lg`}>
            <RagWeightIcon className={`h-4 w-4 ${ragWeightStatus.color}`} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{avgRagWeightPercent}%</div>
          <p className={`text-xs ${ragWeightStatus.color}`}>
            {ragWeightStatus.label}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Based on {stats.total_assistant_messages} assistant messages
          </p>
        </CardContent>
      </Card>

      {/* Citation Rate */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Citation Rate</CardTitle>
          <div className="p-2 bg-blue-100 rounded-lg">
            <LinkIcon className="h-4 w-4 text-blue-600" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{Math.round(stats.citation_rate)}%</div>
          <p className="text-xs text-muted-foreground">
            {stats.total_citations} citations total
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Citations per response
          </p>
        </CardContent>
      </Card>

      {/* Low RAG Weight Messages */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Low RAG Responses</CardTitle>
          <div className="p-2 bg-orange-100 rounded-lg">
            <AlertCircle className="h-4 w-4 text-orange-600" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.low_rag_messages}</div>
          <p className="text-xs text-muted-foreground">
            RAG weight {'<'} 0.4
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {stats.total_assistant_messages > 0
              ? `${Math.round((stats.low_rag_messages / stats.total_assistant_messages) * 100)}%`
              : '0%'}{' '}
            of all responses
          </p>
        </CardContent>
      </Card>

      {/* Knowledge Gap Score */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Knowledge Gap Score</CardTitle>
          <div className={`p-2 ${knowledgeGapScore > 50 ? 'bg-red-100' : 'bg-green-100'} rounded-lg`}>
            <FileText className={`h-4 w-4 ${knowledgeGapScore > 50 ? 'text-red-600' : 'text-green-600'}`} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{knowledgeGapScore}</div>
          <p className={`text-xs ${knowledgeGapScore > 50 ? 'text-red-600' : 'text-green-600'}`}>
            {knowledgeGapScore > 50 ? 'Significant gaps' : 'Well covered'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Lower is better (0-100 scale)
          </p>
        </CardContent>
      </Card>

      {/* Total Conversations */}
      <Card className="md:col-span-2 lg:col-span-4">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Conversations Analyzed</CardTitle>
          <CardDescription>
            Total conversations with this persona: {stats.total_conversations}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium">{stats.total_assistant_messages}</p>
                <p className="text-xs text-muted-foreground">Assistant messages</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium">{stats.total_citations}</p>
                <p className="text-xs text-muted-foreground">Total citations</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-sm font-medium">{stats.low_rag_messages}</p>
                <p className="text-xs text-muted-foreground">Low RAG weight</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
