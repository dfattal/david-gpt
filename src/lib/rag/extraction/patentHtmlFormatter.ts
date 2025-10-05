/**
 * Patent HTML to Markdown Formatter
 * Converts extracted patent document to well-formatted markdown
 */

import { PatentDocument, PatentClaim } from './patentHtmlExtractor';
import { DocumentSummary } from './summaryGenerator';

/**
 * Format patent document as markdown
 */
export function formatPatentDocument(
  patent: PatentDocument,
  personaSlug: string,
  globalSummary?: DocumentSummary
): string {
  const sections: string[] = [];

  // Generate frontmatter
  sections.push(generateFrontmatter(patent, personaSlug, globalSummary));

  // Add key terms if available
  if (globalSummary) {
    sections.push(formatKeyTerms(globalSummary));
  }

  // Title
  sections.push(`# ${patent.title}`);

  // Patent number and basic info
  sections.push(formatBasicInfo(patent));

  // Abstract
  if (patent.abstract) {
    sections.push('## Abstract\n');
    sections.push(patent.abstract);
  }

  // Background
  if (patent.background) {
    sections.push('## Background of the Invention\n');
    sections.push(patent.background);
  }

  // Summary
  if (patent.summary) {
    sections.push('## Summary of the Invention\n');
    sections.push(patent.summary);
  }

  // Detailed Description
  if (patent.detailedDescription) {
    sections.push('## Detailed Description\n');
    sections.push(patent.detailedDescription);
  }

  // Drawings
  if (patent.drawings && patent.drawings.length > 0) {
    sections.push('## Drawings\n');
    sections.push(formatDrawings(patent));
  }

  // Claims
  if (patent.claims && patent.claims.length > 0) {
    sections.push('## Claims\n');
    sections.push(formatClaims(patent.claims));
  }

  return sections.join('\n\n');
}

/**
 * Generate YAML frontmatter
 */
function generateFrontmatter(
  patent: PatentDocument,
  personaSlug: string,
  globalSummary?: DocumentSummary
): string {
  const lines: string[] = ['---'];

  // ID (patent number in lowercase)
  const id = patent.patentNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
  lines.push(`id: ${id}`);

  // Title
  const title = patent.title || patent.patentNumber;
  lines.push(`title: ${title}`);

  // Type
  lines.push('type: patent');

  // Personas
  lines.push(`personas: [${personaSlug}]`);

  // Filing date
  if (patent.metadata.dates?.filing) {
    lines.push(`date: ${patent.metadata.dates.filing}`);
  }

  // Summary
  if (globalSummary?.summary) {
    lines.push(`summary: ${globalSummary.summary}`);
  } else if (patent.abstract) {
    // Use first sentence of abstract as summary
    const firstSentence = patent.abstract.split(/[.!?]\s/)[0];
    lines.push(`summary: ${firstSentence}`);
  }

  // Identifiers
  if (patent.metadata.identifiers && Object.keys(patent.metadata.identifiers).length > 0) {
    lines.push('identifiers:');
    for (const [key, value] of Object.entries(patent.metadata.identifiers)) {
      if (value) {
        lines.push(`  ${key}: "${value}"`);
      }
    }
  }

  // Dates
  if (patent.metadata.dates && Object.keys(patent.metadata.dates).length > 0) {
    lines.push('dates:');
    for (const [key, value] of Object.entries(patent.metadata.dates)) {
      if (value) {
        lines.push(`  ${key}: "${value}"`);
      }
    }
  }

  // Actors (inventors and assignees)
  if (patent.metadata.actors && patent.metadata.actors.length > 0) {
    lines.push('actors:');
    for (const actor of patent.metadata.actors) {
      lines.push(`  - name: "${actor.name}"`);
      lines.push(`    role: "${actor.role}"`);
    }
  }

  lines.push('---');
  return lines.join('\n');
}

/**
 * Format key terms section
 */
function formatKeyTerms(globalSummary: DocumentSummary): string {
  const parts: string[] = [];

  if (globalSummary.keyTerms.length > 0) {
    parts.push(`**Key Terms**: ${globalSummary.keyTerms.join(', ')}`);
  }

  // Always include Also Known As for consistent format (admin UI metadata editing)
  const alsoKnownAs = globalSummary.alsoKnownAs.length > 0
    ? `**Also Known As**: ${globalSummary.alsoKnownAs.join(', ')}`
    : '**Also Known As**: ';
  parts.push(alsoKnownAs);

  return parts.join('\n');
}

/**
 * Format basic patent information
 */
function formatBasicInfo(patent: PatentDocument): string {
  const parts: string[] = [];

  // Patent number
  parts.push(`**Patent Number**: ${patent.patentNumber}`);

  // Publication number
  if (patent.metadata.identifiers?.publication_number) {
    parts.push(`**Publication Number**: ${patent.metadata.identifiers.publication_number}`);
  }

  // Application number
  if (patent.metadata.identifiers?.application_number) {
    parts.push(`**Application Number**: ${patent.metadata.identifiers.application_number}`);
  }

  // Inventors
  const inventors = patent.metadata.actors?.filter(a => a.role === 'inventor');
  if (inventors && inventors.length > 0) {
    parts.push(`**Inventors**: ${inventors.map(i => i.name).join(', ')}`);
  }

  // Assignees
  const currentAssignee = patent.metadata.actors?.find(a => a.role === 'current_assignee');
  if (currentAssignee) {
    parts.push(`**Current Assignee**: ${currentAssignee.name}`);
  }

  const originalAssignee = patent.metadata.actors?.find(a => a.role === 'original_assignee');
  if (originalAssignee && originalAssignee.name !== currentAssignee?.name) {
    parts.push(`**Original Assignee**: ${originalAssignee.name}`);
  }

  // Dates
  if (patent.metadata.dates?.priority) {
    parts.push(`**Priority Date**: ${patent.metadata.dates.priority}`);
  }
  if (patent.metadata.dates?.filing) {
    parts.push(`**Filing Date**: ${patent.metadata.dates.filing}`);
  }
  if (patent.metadata.dates?.publication) {
    parts.push(`**Publication Date**: ${patent.metadata.dates.publication}`);
  }
  if (patent.metadata.dates?.granted) {
    parts.push(`**Grant Date**: ${patent.metadata.dates.granted}`);
  }
  if (patent.metadata.dates?.expiration) {
    parts.push(`**Expiration Date**: ${patent.metadata.dates.expiration}`);
  }

  return parts.join('  \n'); // Two spaces + newline for markdown line break
}

/**
 * Format claims section
 */
function formatClaims(claims: PatentClaim[]): string {
  const lines: string[] = [];

  for (const claim of claims) {
    // Format as numbered list with proper indentation
    lines.push(`${claim.number}. ${claim.text}`);
    lines.push(''); // Blank line between claims
  }

  return lines.join('\n').trim();
}

/**
 * Format drawings section
 */
function formatDrawings(patent: PatentDocument): string {
  const lines: string[] = [];

  lines.push('The patent includes the following figures:');
  lines.push('');

  for (const drawing of patent.drawings) {
    if (drawing.description) {
      lines.push(`- **Figure ${drawing.figureNumber}**: ${drawing.description}`);
    } else {
      lines.push(`- Figure ${drawing.figureNumber}`);
    }
  }

  return lines.join('\n');
}
