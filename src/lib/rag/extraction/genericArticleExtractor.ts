/**
 * Generic Article Extractor
 * Extracts content from any web URL using EXA MCP with Gemini fallback
 * Automatically detects paywalls and skips EXA when appropriate
 */

/**
 * Known paywall domains that should skip EXA extraction
 */
const KNOWN_PAYWALL_DOMAINS = [
  'forbes.com',
  'wsj.com',
  'nytimes.com',
  'ft.com',
  'economist.com',
  'bloomberg.com',
  'washingtonpost.com',
  'wired.com',
  'theatlantic.com',
  'medium.com', // Medium has member-only articles
];

/**
 * Check if a domain is known to have paywalls
 */
function isKnownPaywallDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return KNOWN_PAYWALL_DOMAINS.some(domain => hostname.includes(domain));
  } catch {
    return false;
  }
}

/**
 * Detect paywall indicators in extracted content
 */
function hasPaywallIndicators(content: string, url: string): boolean {
  const paywallKeywords = [
    'subscribe to read',
    'subscription required',
    'become a member',
    'sign up to continue reading',
    'this article is for subscribers',
    'premium content',
    'members only',
    'paywall',
    'login to read more',
    'register to continue',
  ];

  const lowerContent = content.toLowerCase();
  const hasKeyword = paywallKeywords.some(keyword => lowerContent.includes(keyword));

  // Check if content is suspiciously short (less than 1000 chars might indicate truncated content)
  const isSuspiciouslyShort = content.length < 1000;

  return hasKeyword || isSuspiciouslyShort;
}

export interface GenericArticle {
  title: string;
  abstract?: string;
  content: string;
  authors: Array<{
    name: string;
    affiliation?: string;
  }>;
  sections: Array<{
    title: string;
    content: string;
  }>;
  metadata: {
    source_url: string;
    domain: string;
    dates?: {
      published?: string;
      updated?: string;
    };
    authors: Array<{
      name: string;
      role: string;
      affiliation?: string;
    }>;
    summary?: string;
    key_terms?: string;
  };
}

/**
 * Extract article using EXA API directly
 */
async function extractWithExa(url: string): Promise<Partial<GenericArticle>> {
  console.log('  🔍 Attempting EXA API extraction...');

  // Use EXA API to crawl the URL
  const exaApiKey = process.env.EXA_API_KEY || '4cee82ba-f0e2-4d53-bb16-f6920696c862';

  const exaResult = await fetch('https://api.exa.ai/contents', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': exaApiKey
    },
    body: JSON.stringify({
      urls: [url],
      text: {
        maxCharacters: 10000,
        includeHtmlTags: false
      }
    })
  });

  if (!exaResult.ok) {
    const errorText = await exaResult.text();
    throw new Error(`EXA API failed: ${exaResult.status} - ${errorText}`);
  }

  const exaData = await exaResult.json();

  // Check for valid results
  if (!exaData.results || exaData.results.length === 0) {
    throw new Error('EXA API returned no results');
  }

  const result = exaData.results[0];

  // Validate content quality
  if (!result.text || result.text.length < 500) {
    throw new Error('EXA API returned insufficient content');
  }

  // Extract domain
  const domain = new URL(url).hostname.replace(/^www\./, '');

  return {
    title: result.title || '',
    content: result.text || '',
    authors: result.author ? [{ name: result.author }] : [],
    metadata: {
      source_url: url,
      domain,
      dates: {
        published: result.publishedDate || undefined
      },
      authors: result.author ? [{ name: result.author, role: 'author' }] : []
    }
  };
}

/**
 * Extract article using Gemini as fallback
 */
async function extractWithGemini(url: string, geminiApiKey: string): Promise<Partial<GenericArticle>> {
  console.log('  🤖 Attempting Gemini 2.5 Flash extraction...');

  const prompt = `You are an article extraction expert. Analyze this web URL and extract the complete article content.

IMPORTANT INSTRUCTIONS:
1. Extract the article title, author(s), publication date, and main content
2. Preserve article structure with sections and subsections
3. Use ## for main sections and ### for subsections
4. Remove navigation elements, ads, cookie notices, and other page artifacts
5. Clean the content but preserve article formatting and links
6. Generate 8-12 key technical terms related to the article's main topics
7. Generate a concise 1-2 sentence summary (under 200 chars, no line breaks)

Return ONLY valid JSON in this exact format:
{
  "title": "Article title",
  "abstract": "Article summary/lead paragraph (if available)",
  "content": "Complete article content with ## Section headers and ### Subsection headers",
  "authors": [{"name": "Author Name", "affiliation": "Publication or org"}],
  "published": "2024-05-15 (if available)",
  "updated": "2024-06-01 (if available)",
  "summary": "Brief intelligent summary here",
  "key_terms": "term1, term2, term3, term4, term5, term6, term7, term8"
}

URL to analyze: ${url}`;

  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 32768, // Flash has lower max tokens than Pro
          responseMimeType: 'application/json'
        }
      })
    }
  );

  if (!geminiResponse.ok) {
    throw new Error(`Gemini API error: ${geminiResponse.status} ${geminiResponse.statusText}`);
  }

  const geminiData = await geminiResponse.json();
  const extractedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!extractedText) {
    throw new Error('No response from Gemini API');
  }

  const articleData = JSON.parse(extractedText);

  // Extract domain
  const domain = new URL(url).hostname.replace(/^www\./, '');

  return {
    title: articleData.title || '',
    abstract: articleData.abstract,
    content: articleData.content || '',
    authors: articleData.authors || [],
    metadata: {
      source_url: url,
      domain,
      dates: {
        published: articleData.published,
        updated: articleData.updated
      },
      authors: (articleData.authors || []).map((a: any) => ({
        name: a.name,
        role: 'author',
        affiliation: a.affiliation
      })),
      summary: articleData.summary || '',
      key_terms: articleData.key_terms || ''
    }
  };
}

/**
 * Extract sections from content
 */
function extractSections(content: string): Array<{ title: string; content: string }> {
  const sections: Array<{ title: string; content: string }> = [];
  const lines = content.split('\n');

  let currentSection: { title: string; content: string } | null = null;

  for (const line of lines) {
    const sectionMatch = line.match(/^##\s+(.+)$/);

    if (sectionMatch) {
      // Save previous section
      if (currentSection) {
        sections.push(currentSection);
      }

      // Start new section
      currentSection = {
        title: sectionMatch[1].trim(),
        content: ''
      };
    } else if (currentSection) {
      currentSection.content += line + '\n';
    }
  }

  // Save last section
  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Enrich extracted content with Gemini (clean, summarize, extract key terms)
 */
async function enrichWithGemini(
  articleData: Partial<GenericArticle>,
  geminiApiKey: string
): Promise<Partial<GenericArticle>> {
  console.log('  🤖 Enriching with Gemini (cleaning, summary, key terms)...');

  const prompt = `You are an article processing expert. Clean and enrich this article content.

IMPORTANT INSTRUCTIONS:
1. CLEAN the content: Remove navigation elements, ads, cookie notices, page artifacts, duplicate titles
2. Preserve the article structure with sections and subsections
3. Use ## for main sections and ### for subsections
4. Keep the main article content and formatting
5. Generate 8-12 key technical terms related to the article's main topics
6. Generate a concise 1-2 sentence summary (under 200 chars, no line breaks)
7. If there's an abstract or lead paragraph at the beginning, extract it separately

Return ONLY valid JSON in this exact format:
{
  "title": "${articleData.title}",
  "abstract": "Article summary/lead paragraph (if available, otherwise empty string)",
  "content": "Cleaned article content with ## Section headers and ### Subsection headers",
  "summary": "Brief intelligent summary here",
  "key_terms": "term1, term2, term3, term4, term5, term6, term7, term8"
}

Content to clean and enrich:
${articleData.content}`;

  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 32768,
          responseMimeType: 'application/json'
        }
      })
    }
  );

  if (!geminiResponse.ok) {
    console.log(`  ⚠️  Gemini enrichment failed, using original content`);
    return articleData;
  }

  const geminiData = await geminiResponse.json();
  const extractedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!extractedText) {
    console.log(`  ⚠️  Gemini enrichment returned no data, using original content`);
    return articleData;
  }

  const enrichedData = JSON.parse(extractedText);

  return {
    ...articleData,
    abstract: enrichedData.abstract || articleData.abstract,
    content: enrichedData.content || articleData.content,
    metadata: {
      ...articleData.metadata!,
      summary: enrichedData.summary || '',
      key_terms: enrichedData.key_terms || ''
    }
  };
}

/**
 * Extract generic article from URL
 * Uses EXA API as primary method with Gemini as fallback
 * Automatically detects paywalls and skips EXA when appropriate
 * Then enriches with Gemini for summary and key terms
 */
export async function extractGenericArticle(
  url: string,
  geminiApiKey: string
): Promise<GenericArticle> {
  console.log(`\n📄 Extracting article from: ${url}`);

  let articleData: Partial<GenericArticle>;
  let extractionMethod = 'exa';

  // Check if this is a known paywall domain
  const isPaywallDomain = isKnownPaywallDomain(url);
  if (isPaywallDomain) {
    console.log(`  🚧 Known paywall domain detected, skipping EXA and using Gemini directly`);

    try {
      articleData = await extractWithGemini(url, geminiApiKey);
      extractionMethod = 'gemini';
      console.log(`  ✓ Gemini extraction successful`);
    } catch (geminiError) {
      console.error(`  ✗ Gemini extraction failed: ${geminiError instanceof Error ? geminiError.message : 'Unknown error'}`);
      throw new Error(`Gemini extraction failed for ${url}`);
    }
  } else {
    // Try EXA first for non-paywall domains
    try {
      articleData = await extractWithExa(url);
      console.log(`  ✓ EXA extraction successful`);

      // Check if extracted content has paywall indicators
      if (hasPaywallIndicators(articleData.content || '', url)) {
        console.log(`  🚧 Paywall indicators detected in EXA content, retrying with Gemini`);
        throw new Error('Paywall detected in EXA content');
      }

      // Enrich with Gemini (clean content, add summary/key terms)
      articleData = await enrichWithGemini(articleData, geminiApiKey);
    } catch (exaError) {
      console.log(`  ⚠️  EXA failed: ${exaError instanceof Error ? exaError.message : 'Unknown error'}`);
      console.log(`  ↻ Falling back to Gemini full extraction...`);

      try {
        // Fallback to Gemini (already includes summary/key terms)
        articleData = await extractWithGemini(url, geminiApiKey);
        extractionMethod = 'gemini';
        console.log(`  ✓ Gemini extraction successful`);
      } catch (geminiError) {
        console.error(`  ✗ Gemini also failed: ${geminiError instanceof Error ? geminiError.message : 'Unknown error'}`);
        throw new Error(`Both EXA and Gemini extraction failed for ${url}`);
      }
    }
  }

  // Extract sections from content
  const sections = extractSections(articleData.content || '');

  // Build complete article object
  const article: GenericArticle = {
    title: articleData.title || 'Untitled Article',
    abstract: articleData.abstract,
    content: articleData.content || '',
    authors: articleData.authors || [],
    sections,
    metadata: {
      source_url: url,
      domain: articleData.metadata?.domain || new URL(url).hostname.replace(/^www\./, ''),
      dates: articleData.metadata?.dates || {},
      authors: articleData.metadata?.authors || [],
      summary: articleData.metadata?.summary || '',
      key_terms: articleData.metadata?.key_terms || ''
    }
  };

  console.log(`  ✓ Extracted: ${article.title}`);
  console.log(`  ✓ Method: ${extractionMethod}`);
  console.log(`  ✓ Authors: ${article.authors.length}`);
  console.log(`  ✓ Content: ${article.content.length.toLocaleString()} chars`);
  console.log(`  ✓ Sections: ${sections.length}`);
  console.log(`  ✓ Summary: ${article.metadata.summary}`);

  return article;
}
