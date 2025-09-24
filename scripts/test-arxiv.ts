#!/usr/bin/env tsx

import { execSync } from 'child_process';

// Load environment variables
require('dotenv').config({ path: '/Users/david.fattal/Documents/GitHub/david-gpt/.env.local' });

interface DocumentEntry {
  source_uri: string;
  document_type: string;
  extraction_tool: string;
  extraction_strategy: string;
  status: string;
  metadata_enhancements: string[];
}

class ArxivTester {
  private extractArxivId(url: string): string | null {
    // Extract arXiv ID from URLs like:
    // https://arxiv.org/pdf/2405.10314.pdf
    // https://arxiv.org/abs/2405.10314
    const match = url.match(/arxiv\.org\/(?:pdf|abs)\/([^\/]+?)(?:\.pdf)?$/);
    return match ? match[1] : null;
  }

  private async fetchArxivMetadata(arxivId: string): Promise<any> {
    const apiUrl = `http://export.arxiv.org/api/query?id_list=${arxivId}`;

    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`arXiv API request failed: ${response.statusText}`);
      }

      const xmlText = await response.text();
      return this.parseArxivXML(xmlText);
    } catch (error) {
      throw new Error(`Failed to fetch arXiv metadata: ${error}`);
    }
  }

  private parseArxivXML(xmlText: string): any {
    // Enhanced XML parsing for arXiv API response
    const entryMatch = xmlText.match(/<entry[^>]*>([\s\S]*?)<\/entry>/);
    const entryContent = entryMatch ? entryMatch[1] : xmlText;

    const titleMatch = entryContent.match(/<title[^>]*>([^<]+)<\/title>/);
    const summaryMatch = entryContent.match(/<summary[^>]*>([\s\S]*?)<\/summary>/);
    const publishedMatch = entryContent.match(/<published[^>]*>([^<]+)<\/published>/);
    const updatedMatch = entryContent.match(/<updated[^>]*>([^<]+)<\/updated>/);

    // Extract authors (skip feed-level authors)
    const authorMatches = [...entryContent.matchAll(/<author[^>]*>[\s\S]*?<name[^>]*>([^<]+)<\/name>[\s\S]*?<\/author>/g)];
    const authors = authorMatches.map(match => match[1].trim()).filter(author => author && !author.includes('ArXiv'));

    // Extract categories
    const categoryMatches = [...entryContent.matchAll(/<category[^>]*term="([^"]*)"[^>]*>/g)];
    const categories = categoryMatches.map(match => match[1]);

    // Extract DOI and journal reference if available
    const doiMatch = entryContent.match(/<arxiv:doi[^>]*>([^<]+)<\/arxiv:doi>/);
    const journalMatch = entryContent.match(/<arxiv:journal_ref[^>]*>([^<]+)<\/arxiv:journal_ref>/);
    const commentMatch = entryContent.match(/<arxiv:comment[^>]*>([^<]+)<\/arxiv:comment>/);

    return {
      title: titleMatch ? titleMatch[1].trim() : 'Unknown Title',
      summary: summaryMatch ? summaryMatch[1].trim().replace(/\s+/g, ' ') : '',
      authors: authors.length > 0 ? authors : ['Unknown Author'],
      published: publishedMatch ? publishedMatch[1].trim() : '',
      updated: updatedMatch ? updatedMatch[1].trim() : '',
      categories: categories,
      doi: doiMatch ? doiMatch[1].trim() : null,
      journal_ref: journalMatch ? journalMatch[1].trim() : null,
      comment: commentMatch ? commentMatch[1].trim() : null,
      arxivId: null // Will be set by caller
    };
  }

  private cleanMarkdownCodeFences(content: string): string {
    return content
      .replace(/^```markdown\s*/i, '')
      .replace(/^```\s*/m, '')
      .replace(/\s*```\s*$/m, '')
      .trim();
  }

  private async extractPdfWithGemini(pdfUrl: string, metadata: any): Promise<string> {
    const prompt = `Extract and format this arXiv paper into a complete markdown document with proper YAML frontmatter.

Known metadata from arXiv API:
- Title: ${metadata.title}
- Authors: ${metadata.authors.join(', ')}
- Published: ${metadata.published}
- Categories: ${metadata.categories.join(', ')}
- Abstract: ${metadata.summary}
- arXiv ID: ${metadata.arxivId}
- PDF URL: ${pdfUrl}

Please download and analyze the PDF at: ${pdfUrl}

Requirements:
1. Create complete YAML frontmatter with:
   - title: "${metadata.title}"
   - url: "${pdfUrl}"
   - author: "${metadata.authors.join(', ')}"
   - published_date: "${metadata.published.split('T')[0]}"
   - doc_type: "technical_paper"
   - abstract: (use the abstract from metadata)
   - keywords: (extract from content and categories)
   - technologies: (extract relevant technologies mentioned)
   - venue: "arXiv"
   - arxiv_id: "${metadata.arxivId}"
   - categories: [${metadata.categories.map(c => `"${c}"`).join(', ')}]

2. Extract and include the complete paper content:
   - Full abstract (from metadata)
   - Introduction section
   - All methodology/technical sections
   - Results and conclusions
   - References section

3. Maintain academic formatting and mathematical notation
4. Preserve all figures, tables, and equations as described in text
5. Include author affiliations if available in the PDF

IMPORTANT: Return ONLY the raw markdown content starting with YAML frontmatter (---). Do NOT wrap in code blocks or add markdown formatting markers.`;

    try {
      const command = `gemini -y "${prompt.replace(/"/g, '\\"')}"`;
      const output = execSync(command, {
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024 * 20 // 20MB buffer for full papers
      });

      return this.cleanMarkdownCodeFences(output.trim());
    } catch (error) {
      throw new Error(`Gemini PDF extraction failed: ${error}`);
    }
  }

  async testArxivAPI(testUrl: string): Promise<void> {
    console.log(`🧪 Testing arXiv API with: ${testUrl}\n`);

    try {
      // Extract arXiv ID
      const arxivId = this.extractArxivId(testUrl);
      if (!arxivId) {
        throw new Error('Could not extract arXiv ID from URL');
      }
      console.log(`📄 arXiv ID: ${arxivId}`);

      // Fetch metadata
      console.log('📡 Fetching metadata from arXiv API...');
      const metadata = await this.fetchArxivMetadata(arxivId);
      metadata.arxivId = arxivId;

      console.log('📋 Metadata retrieved:');
      console.log(`   Title: ${metadata.title}`);
      console.log(`   Authors: ${metadata.authors.join(', ')}`);
      console.log(`   Published: ${metadata.published}`);
      console.log(`   Categories: ${metadata.categories.join(', ')}`);
      console.log(`   Abstract: ${metadata.summary.substring(0, 150)}...`);

      // Extract PDF content
      console.log('\n📥 Extracting PDF content with Gemini...');
      const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
      const markdownContent = await this.extractPdfWithGemini(pdfUrl, metadata);

      // Show results
      const wordCount = markdownContent.split(/\s+/).length;
      console.log(`\n✅ Extraction complete!`);
      console.log(`   Content length: ${markdownContent.length} characters`);
      console.log(`   Word count: ${wordCount} words`);
      console.log(`   First 500 characters:`);
      console.log('   ' + '-'.repeat(50));
      console.log(markdownContent.substring(0, 500) + (markdownContent.length > 500 ? '...' : ''));
      console.log('   ' + '-'.repeat(50));

    } catch (error) {
      console.error(`❌ Test failed: ${error}`);
    }
  }
}

// Run test
const testUrl = process.argv[2] || 'https://arxiv.org/pdf/2405.10314.pdf';
const tester = new ArxivTester();
tester.testArxivAPI(testUrl);