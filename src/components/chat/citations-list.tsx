"use client";

import * as React from "react";
import { Citation, buildCitationUrl } from "@/lib/rag/citations/parser";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";

interface CitationsListProps {
  citations: Citation[];
}

/**
 * Renders a list of citations/sources at the bottom of assistant messages
 */
export function CitationsList({ citations }: CitationsListProps) {
  if (citations.length === 0) {
    return null;
  }

  return (
    <Card className="mt-4 border-l-4 border-l-blue-500 bg-muted/30">
      <CardContent className="py-3 px-4">
        <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
          Sources
        </div>
        <div className="space-y-2">
          {citations.map((citation) => (
            <div
              key={citation.id}
              id={`citation-${citation.number}`}
              className="text-sm flex items-start gap-2 scroll-mt-4"
            >
              <span className="font-mono text-xs text-muted-foreground shrink-0 pt-0.5">
                [{citation.number}]
              </span>
              <div className="flex-1 min-w-0">
                <span className="font-medium text-foreground">
                  {citation.docTitle || citation.docId}
                </span>
                <span className="text-muted-foreground">, §{citation.sectionPath}</span>
                {citation.sourceUrl && (
                  <a
                    href={buildCitationUrl(citation.sourceUrl, citation.sectionPath)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                  >
                    <span className="text-xs">View source</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}