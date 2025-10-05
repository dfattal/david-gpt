/**
 * Global document summary and key terms generation
 * Uses Gemini API to analyze full document context for rich metadata
 */

import { DocumentType } from '../ingestion/geminiProcessor';
import { NormalizedPage } from './textNormalizer';

export interface DocumentSummary {
  summary: string;
  keyTerms: string[];
  alsoKnownAs: string[];
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

/**
 * Generate document summary and key terms using Gemini API
 */
export async function generateDocumentSummary(
  pages: NormalizedPage[],
  docType: DocumentType,
  apiKey: string
): Promise<DocumentSummary> {
  console.log('  Generating document summary and key terms...');

  // Use first 10 pages or ~15k chars (fits comfortably in Gemini context)
  const contentPages = pages.slice(0, 10);
  const content = contentPages
    .map(p => `[Page ${p.pageNumber}]\n${p.normalizedText}`)
    .join('\n\n');

  const truncatedContent = content.substring(0, 15000);

  const prompt = generateSummaryPrompt(truncatedContent, docType);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = (await response.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('No text in Gemini response');
    }

    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not extract JSON from response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    console.log('  ✓ Summary and key terms generated successfully');

    return {
      summary: parsed.summary || 'Document summary not available',
      keyTerms: Array.isArray(parsed.keyTerms) ? parsed.keyTerms : [],
      alsoKnownAs: Array.isArray(parsed.alsoKnownAs) ? parsed.alsoKnownAs : [],
    };
  } catch (error) {
    console.warn(
      `  ⚠ Failed to generate summary: ${error instanceof Error ? error.message : String(error)}`
    );

    // Return fallback
    return {
      summary: 'Document summary not available',
      keyTerms: [],
      alsoKnownAs: [],
    };
  }
}

/**
 * Generate document-type-specific summary prompt
 */
function generateSummaryPrompt(content: string, docType: DocumentType): string {
  const basePrompt = `Analyze the following document excerpt and extract metadata in JSON format.

Document Type: ${docType}

Content:
${content}

---

Extract the following and return as JSON:

{
  "summary": "One concise sentence (max 200 chars) capturing the document's main purpose and contribution",
  "keyTerms": ["array", "of", "technical", "terms", "acronyms", "and", "key", "concepts"],
  "alsoKnownAs": ["array", "of", "alternative", "names", "synonyms", "abbreviations"]
}

`;

  // Document-type-specific instructions
  const typeInstructions: Record<DocumentType, string> = {
    arxiv: `
For academic papers:
- summary: Focus on the research problem, approach, and main contribution
- keyTerms: Include domain-specific terms, method names, acronyms, datasets, metrics
- alsoKnownAs: Include paper abbreviations, related terms, domain synonyms

Example:
{
  "summary": "This survey reviews the evolution of Monocular Metric Depth Estimation (MMDE), from geometry-based methods to state-of-the-art deep models, with emphasis on datasets that drive progress.",
  "keyTerms": ["Monocular Depth Estimation (MDE)", "Monocular Metric Depth Estimation (MMDE)", "Relative Depth Estimation (RDE)", "Computer Vision", "SLAM", "3D Reconstruction", "Deep Learning", "CNN", "Vision Transformers", "Zero-shot Learning", "Diffusion Models", "KITTI", "NYU-D", "Autonomous Driving"],
  "alsoKnownAs": ["MDE", "MMDE", "RDE", "depth prediction", "metric depth"]
}`,

    patent: `
For patents:
- summary: Focus on the invention's purpose and technical innovation
- keyTerms: Include technical components, method steps, key innovations, application domains
- alsoKnownAs: Include patent classifications, related technologies, alternative implementations

Example:
{
  "summary": "A light field display system using directional backlight and multi-view rendering for glasses-free 3D visualization.",
  "keyTerms": ["Light Field Display", "Directional Backlight", "Multi-view Rendering", "Autostereoscopic Display", "3D Visualization", "Lenticular Lens", "View Mapping", "GPU Acceleration"],
  "alsoKnownAs": ["LFD", "autostereo display", "glasses-free 3D", "parallax barrier display"]
}`,

    release_notes: `
For release notes:
- summary: Focus on version, release date, and major improvements
- keyTerms: Include version numbers, feature names, component names, bug categories
- alsoKnownAs: Include product abbreviations, codenames, related versions

Example:
{
  "summary": "LeiaSR version 1.34.6 released on March 2024 with performance improvements and bug fixes for 3D content rendering.",
  "keyTerms": ["LeiaSR", "v1.34.6", "3D Rendering", "Performance Optimization", "Bug Fixes", "Content Pipeline", "GPU Acceleration"],
  "alsoKnownAs": ["LeiaSR 1.34.6", "release 1.34.6", "SR v1.34"]
}`,

    spec: `
For specifications:
- summary: Focus on what the spec defines and its scope
- keyTerms: Include technical standards, data formats, protocols, parameters
- alsoKnownAs: Include spec abbreviations, standard numbers, related specifications

Example:
{
  "summary": "Technical specification for the Leia Image Format (LIF), defining data structures for multi-view 3D image storage and metadata.",
  "keyTerms": ["Leia Image Format", "LIF", "Multi-view Image", "3D Image Storage", "Metadata Schema", "View Array", "Disparity Map", "File Format"],
  "alsoKnownAs": ["LIF", "LIF v1.0", "Leia format", "multi-view container"]
}`,

    technical_note: `
For technical notes:
- summary: Focus on the technical topic and key information
- keyTerms: Include technical concepts, components, methodologies
- alsoKnownAs: Include abbreviations, alternative terms

Example:
{
  "summary": "Technical overview of the Leia Video Format (LVF) for storing and streaming multi-view 3D video content.",
  "keyTerms": ["Leia Video Format", "LVF", "Multi-view Video", "3D Video Streaming", "View Synthesis", "Compression", "Metadata"],
  "alsoKnownAs": ["LVF", "Leia video", "multi-view container"]
}`,

    blog: `
For blog posts:
- summary: Focus on the main topic and key message
- keyTerms: Include main concepts, technologies discussed, key points
- alsoKnownAs: Include related terms, trending hashtags

Example:
{
  "summary": "Exploring the future of 3D displays and their applications in gaming, entertainment, and professional visualization.",
  "keyTerms": ["3D Displays", "Autostereoscopic", "Gaming", "Entertainment", "Professional Visualization", "Light Field", "Immersive Technology"],
  "alsoKnownAs": ["3D screens", "glasses-free 3D", "volumetric displays"]
}`,

    press: `
For press releases:
- summary: Focus on the announcement and its significance
- keyTerms: Include company names, product names, key announcements
- alsoKnownAs: Include product abbreviations, related brands

Example:
{
  "summary": "Leia Inc. announces breakthrough in light field display technology enabling realistic 3D experiences on mobile devices.",
  "keyTerms": ["Leia Inc.", "Light Field Display", "Mobile 3D", "Breakthrough Technology", "3D Experience", "Product Launch"],
  "alsoKnownAs": ["Leia", "LFD technology", "mobile 3D display"]
}`,

    faq: `
For FAQs:
- summary: Focus on the product/topic and question scope
- keyTerms: Include product names, common topics, key features
- alsoKnownAs: Include product abbreviations, related terms

Example:
{
  "summary": "Frequently asked questions about LeiaSR 3D rendering software, covering installation, configuration, and troubleshooting.",
  "keyTerms": ["LeiaSR", "3D Rendering", "Installation", "Configuration", "Troubleshooting", "FAQ", "Support"],
  "alsoKnownAs": ["SR FAQ", "LeiaSR help", "rendering FAQ"]
}`,

    other: `
For general documents:
- summary: Capture the main purpose and content
- keyTerms: Extract key concepts, technical terms, important topics
- alsoKnownAs: Include abbreviations, alternative names

Example:
{
  "summary": "Technical documentation covering system architecture, implementation details, and best practices.",
  "keyTerms": ["System Architecture", "Implementation", "Best Practices", "Technical Documentation"],
  "alsoKnownAs": ["tech doc", "system guide", "implementation guide"]
}`,
  };

  return basePrompt + typeInstructions[docType] + '\n\nOutput ONLY valid JSON, no other text.';
}
