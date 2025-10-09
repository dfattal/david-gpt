"use client";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Database } from "lucide-react";

interface RagWeightBadgeProps {
  ragWeight?: number; // 0.0-1.0
  ragWeightBreakdown?: {
    citation_presence: number;
    factual_density: number;
    token_overlap: number;
    search_quality: number;
  };
}

/**
 * Display RAG weight as a percentage badge with color coding and detailed breakdown
 */
export function RagWeightBadge({ ragWeight, ragWeightBreakdown }: RagWeightBadgeProps) {
  if (ragWeight === undefined || ragWeight === null) {
    return null;
  }

  const percentage = Math.round(ragWeight * 100);

  // Color coding based on RAG weight
  const getColor = (weight: number): string => {
    if (weight >= 0.7) return "text-green-600 bg-green-50 border-green-200";
    if (weight >= 0.4) return "text-yellow-600 bg-yellow-50 border-yellow-200";
    return "text-gray-600 bg-gray-50 border-gray-200";
  };

  const getLabel = (weight: number): string => {
    if (weight >= 0.7) return "Primarily from knowledge base";
    if (weight >= 0.4) return "Mixed knowledge base & general knowledge";
    return "Primarily from general knowledge";
  };

  const formatPercentage = (value: number): string => {
    return `${Math.round(value * 100)}%`;
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`${getColor(ragWeight)} flex items-center gap-1 cursor-help`}
          >
            <Database className="w-3 h-3" />
            {percentage}% from knowledge base
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-2">
            <p className="font-semibold text-sm">{getLabel(ragWeight)}</p>
            {ragWeightBreakdown && (
              <div className="text-xs space-y-1 text-muted-foreground">
                <p className="font-medium text-foreground">Breakdown:</p>
                <ul className="space-y-0.5">
                  <li>• Has citations: {ragWeightBreakdown.citation_presence === 1 ? 'Yes' : 'No'} (60% weight)</li>
                  <li>• Factual density: {formatPercentage(ragWeightBreakdown.factual_density)} (25% weight)</li>
                  <li>• Token overlap: {formatPercentage(ragWeightBreakdown.token_overlap)} (10% weight)</li>
                  <li>• Search quality: {formatPercentage(ragWeightBreakdown.search_quality)} (5% weight)</li>
                </ul>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
