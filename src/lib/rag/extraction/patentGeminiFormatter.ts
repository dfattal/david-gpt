/**
 * Patent Gemini Formatter - Simplified
 * Just applies markdown template to Gemini-extracted data
 */

import { PatentExtractedData } from './patentGeminiExtractor';

/**
 * Format patent data as markdown (summary and key terms already from Gemini)
 * @param userKeyTerms - Optional user-provided key terms to merge with Gemini-extracted terms
 * @param userAlsoKnownAs - Optional user-provided "also known as" name
 */
export async function formatPatentMarkdown(
  patentData: PatentExtractedData,
  personaSlugs: string[],
  geminiApiKey: string,
  userKeyTerms?: string[],
  userAlsoKnownAs?: string,
  sourceUrl?: string
): Promise<string> {
  console.log(`\n📝 Formatting patent markdown...`);

  // Summary and key terms already extracted by Gemini in single pass
  const summary = patentData.metadata.summary || patentData.abstract.split(/[.!?]\s/)[0].substring(0, 200);

  // Merge Gemini-extracted key terms with user-provided ones
  const geminiKeyTerms = patentData.metadata.key_terms || '';
  let finalKeyTerms = geminiKeyTerms;

  if (userKeyTerms && userKeyTerms.length > 0) {
    const userTermsStr = userKeyTerms.join(',');
    finalKeyTerms = geminiKeyTerms
      ? `${geminiKeyTerms},${userTermsStr}`
      : userTermsStr;
  }

  // Build frontmatter
  const frontmatter = generateFrontmatter(patentData, personaSlugs, summary, sourceUrl);

  // Build sections
  const sections: string[] = [frontmatter];

  // Key terms
  sections.push(`**Key Terms**: ${finalKeyTerms}`);

  // Also Known As
  const alsoKnownAs = userAlsoKnownAs || '';
  sections.push(`**Also Known As**: ${alsoKnownAs}\n`);

  // Title with metadata
  sections.push(`# ${patentData.title}\n`);
  sections.push(formatMetadataTable(patentData));

  // Abstract - REQUIRED
  if (patentData.abstract) {
    let abstractText = cleanSection(patentData.abstract);
    abstractText = abstractText.replace(/^Abstract\s*/i, '');
    sections.push(`## Abstract\n\n${abstractText}\n`);
  }

  // Description - REQUIRED (Gemini already formatted with ## subheadings)
  if (patentData.detailedDescription && patentData.detailedDescription.trim().length > 10) {
    sections.push(`${cleanSection(patentData.detailedDescription)}\n`);
  }

  // Claims
  if (patentData.claims && patentData.claims.length > 0) {
    sections.push(`## Claims\n`);
    patentData.claims.forEach(claim => {
      let claimText = claim.text.trim();
      if (claimText.match(/^\d+\.\s+/)) {
        claimText = claimText.replace(/^\d+\.\s+/, '');
      }
      sections.push(`${claim.number}. ${claimText}\n`);
    });
  }

  const markdown = sections.join('\n');
  console.log(`  ✓ Formatted markdown (${markdown.length.toLocaleString()} chars)`);

  return markdown;
}

/**
 * Generate YAML frontmatter
 */
function generateFrontmatter(
  patent: PatentExtractedData,
  personaSlugs: string[],
  summary: string,
  sourceUrl?: string
): string {
  const lines: string[] = ['---'];

  // ID and title
  const patentId = patent.metadata.identifiers?.patent_number?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'patent';
  lines.push(`id: ${patentId}`);
  lines.push(`title: ${patent.title}`);
  lines.push(`type: patent`);
  lines.push(`personas: [${personaSlugs.join(', ')}]`);

  // Dates
  if (patent.metadata.dates?.publication) {
    lines.push(`date: ${patent.metadata.dates.publication}`);
  }

  // Source URL (Google Patents link)
  if (sourceUrl) {
    lines.push(`source_url: ${sourceUrl}`);
  }

  // Summary
  lines.push(`summary: ${summary}`);

  // Identifiers
  if (patent.metadata.identifiers) {
    lines.push(`identifiers:`);
    const ids = patent.metadata.identifiers;
    if (ids.patent_number) lines.push(`  patent_number: "${ids.patent_number}"`);
    if (ids.publication_number) lines.push(`  publication_number: "${ids.publication_number}"`);
    if (ids.application_number) lines.push(`  application_number: "${ids.application_number}"`);
    if (ids.patent_family && ids.patent_family.length > 0) {
      lines.push(`  patent_family:`);
      ids.patent_family.forEach(ref => lines.push(`    - "${ref}"`));
    }
  }

  // Dates
  if (patent.metadata.dates) {
    lines.push(`dates:`);
    const dates = patent.metadata.dates;
    if (dates.priority) lines.push(`  priority: "${dates.priority}"`);
    if (dates.filing) lines.push(`  filing: "${dates.filing}"`);
    if (dates.publication) lines.push(`  publication: "${dates.publication}"`);
    if (dates.granted) lines.push(`  granted: "${dates.granted}"`);
    if (dates.expiration) lines.push(`  expiration: "${dates.expiration}"`);
  }

  // Actors
  if (patent.metadata.actors && patent.metadata.actors.length > 0) {
    lines.push(`actors:`);
    patent.metadata.actors.forEach(actor => {
      lines.push(`  - name: "${actor.name}"`);
      lines.push(`    role: "${actor.role}"`);
    });
  }

  lines.push('---');
  return lines.join('\n');
}

/**
 * Format metadata as a table
 */
function formatMetadataTable(patent: PatentExtractedData): string {
  const lines: string[] = [];

  if (patent.metadata.identifiers?.patent_number) {
    lines.push(`**Patent Number**: ${patent.metadata.identifiers.patent_number}  `);
  }
  if (patent.metadata.identifiers?.publication_number) {
    lines.push(`**Publication Number**: ${patent.metadata.identifiers.publication_number}  `);
  }
  if (patent.metadata.identifiers?.application_number) {
    lines.push(`**Application Number**: ${patent.metadata.identifiers.application_number}  `);
  }

  // Inventors
  const inventors = patent.metadata.actors?.filter(a => a.role === 'inventor') || [];
  if (inventors.length > 0) {
    lines.push(`**Inventors**: ${inventors.map(i => i.name).join(', ')}  `);
  }

  // Assignees
  const currentAssignee = patent.metadata.actors?.find(a => a.role === 'current_assignee');
  if (currentAssignee) {
    lines.push(`**Current Assignee**: ${currentAssignee.name}  `);
  }

  const originalAssignee = patent.metadata.actors?.find(a => a.role === 'original_assignee');
  if (originalAssignee) {
    lines.push(`**Original Assignee**: ${originalAssignee.name}  `);
  }

  // Dates
  if (patent.metadata.dates?.priority) {
    lines.push(`**Priority Date**: ${patent.metadata.dates.priority}  `);
  }
  if (patent.metadata.dates?.filing) {
    lines.push(`**Filing Date**: ${patent.metadata.dates.filing}  `);
  }
  if (patent.metadata.dates?.publication) {
    lines.push(`**Publication Date**: ${patent.metadata.dates.publication}  `);
  }
  if (patent.metadata.dates?.granted) {
    lines.push(`**Grant Date**: ${patent.metadata.dates.granted}  `);
  }
  if (patent.metadata.dates?.expiration) {
    lines.push(`**Expiration Date**: ${patent.metadata.dates.expiration}`);
  }

  return lines.join('\n') + '\n';
}

/**
 * Clean section text - remove excessive whitespace, normalize
 */
function cleanSection(text: string): string {
  return text
    .replace(/\n{3,}/g, '\n\n') // Normalize multiple newlines
    .replace(/[ \t]+/g, ' ') // Normalize spaces
    .trim();
}
