/**
 * Failed Queries Table Component
 * Displays conversations with low RAG weight in an expandable table
 */

'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, MessageSquare, Link as LinkIcon } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  rag_weight: number | null;
  created_at: string;
  citation_count: number;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  messages: Message[];
  avg_rag_weight: number | null;
  total_citations: number;
}

interface FailedQueriesTableProps {
  conversations: Conversation[];
}

export function FailedQueriesTable({ conversations }: FailedQueriesTableProps) {
  const [expandedConvs, setExpandedConvs] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'rag_weight' | 'date'>('rag_weight');

  const toggleExpanded = (convId: string) => {
    setExpandedConvs(prev => {
      const next = new Set(prev);
      if (next.has(convId)) {
        next.delete(convId);
      } else {
        next.add(convId);
      }
      return next;
    });
  };

  const getRagWeightColor = (weight: number | null) => {
    if (weight === null) return 'bg-gray-500';
    if (weight >= 0.7) return 'bg-green-500';
    if (weight >= 0.4) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getRagWeightLabel = (weight: number | null) => {
    if (weight === null) return 'N/A';
    return `${Math.round(weight * 100)}%`;
  };

  const sortedConversations = [...conversations].sort((a, b) => {
    if (sortBy === 'rag_weight') {
      const aWeight = a.avg_rag_weight ?? 1;
      const bWeight = b.avg_rag_weight ?? 1;
      return aWeight - bWeight;
    } else {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });

  if (conversations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Low RAG Weight Conversations</CardTitle>
          <CardDescription>
            No conversations found with low RAG weight (&lt; 0.4)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            Great! All conversations have good RAG coverage.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Low RAG Weight Conversations</CardTitle>
            <CardDescription>
              {conversations.length} conversations with RAG weight &lt; 0.4
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant={sortBy === 'rag_weight' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSortBy('rag_weight')}
            >
              Sort by RAG Weight
            </Button>
            <Button
              variant={sortBy === 'date' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSortBy('date')}
            >
              Sort by Date
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {sortedConversations.map((conv) => {
            const isExpanded = expandedConvs.has(conv.id);
            const userMessages = conv.messages.filter((m) => m.role === 'user');

            return (
              <div
                key={conv.id}
                className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
              >
                <div
                  className="flex items-start justify-between cursor-pointer"
                  onClick={() => toggleExpanded(conv.id)}
                >
                  <div className="flex items-start gap-3 flex-1">
                    <button className="mt-1">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    <div className="flex-1">
                      <h3 className="font-medium text-sm">{conv.title || 'Untitled Conversation'}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(conv.created_at).toLocaleDateString()} · {userMessages.length} messages
                      </p>
                      {userMessages.length > 0 && !isExpanded && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                          {userMessages[0].content}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <div className="flex items-center gap-1">
                      <LinkIcon className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{conv.total_citations}</span>
                    </div>
                    <Badge
                      variant="outline"
                      className={`${getRagWeightColor(conv.avg_rag_weight)} text-white border-0`}
                    >
                      {getRagWeightLabel(conv.avg_rag_weight)}
                    </Badge>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 ml-7 space-y-3 border-l-2 border-muted pl-4">
                    {conv.messages.map((msg) => (
                      <div key={msg.id} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={msg.role === 'user' ? 'default' : 'secondary'} className="text-xs">
                            {msg.role}
                          </Badge>
                          {msg.role === 'assistant' && msg.rag_weight !== null && (
                            <Badge
                              variant="outline"
                              className={`text-xs ${getRagWeightColor(msg.rag_weight)} text-white border-0`}
                            >
                              RAG: {getRagWeightLabel(msg.rag_weight)}
                            </Badge>
                          )}
                          {msg.role === 'assistant' && msg.citation_count > 0 && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <LinkIcon className="h-3 w-3" />
                              {msg.citation_count}
                            </span>
                          )}
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
