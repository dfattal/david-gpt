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
    <div className="mt-4 pt-3 border-t border-border/40">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {citations.map((citation) => (
          <div
            key={citation.id}
            id={`citation-${citation.number}`}
            className="text-xs flex items-baseline gap-1.5 scroll-mt-4"
          >
            <span className="font-mono text-[10px] text-muted-foreground/50">
              [{citation.number}]
            </span>
            {citation.sourceUrl ? (
              <a
                href={buildCitationUrl(citation.sourceUrl, citation.sectionPath)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-0.5 group"
              >
                <span className="group-hover:underline">
                  {citation.docTitle || citation.docId}
                </span>
                <span className="text-muted-foreground/40">, §{citation.sectionPath}</span>
                <ExternalLink className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100 transition-opacity" />
              </a>
            ) : (
              <>
                <span className="text-muted-foreground">
                  {citation.docTitle || citation.docId}
                </span>
                <span className="text-muted-foreground/40">, §{citation.sectionPath}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}