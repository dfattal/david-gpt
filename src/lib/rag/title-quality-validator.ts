/**
 * Title Quality Validation and Scoring System
 * Validates and scores document titles to prevent junk data
 */

export interface TitleQualityScore {
  score: number; // 0-100, higher is better
  isAcceptable: boolean; // true if score >= threshold
  issues: string[]; // List of quality issues detected
  suggestions?: string[]; // Potential improvements
}

export class TitleQualityValidator {
  private static readonly MINIMUM_SCORE = 60;
  private static readonly PLATFORM_NAMES = new Set([
    'forbes', 'wired', 'techcrunch', 'reuters', 'bloomberg', 'cnn', 'bbc',
    'nature', 'science', 'medium', 'linkedin', 'twitter', 'facebook',
    'youtube', 'google', 'microsoft', 'apple', 'amazon', 'netflix',
    'github', 'stackoverflow', 'reddit', 'wikipedia', 'arxiv'
  ]);

  private static readonly JUNK_PATTERNS = [
    /^<[^>]*>.*<\/[^>]*>$/, // HTML/XML tags
    /^[0-9]+$/, // Pure numbers
    /^[^a-zA-Z]*$/, // No letters
    /^(the|a|an|and|or|but|in|on|at|to|for|of|with|by)$/i, // Common words only
    /^(home|page|index|main|default|untitled)$/i, // Generic page names
    /^[a-z]{1,3}$/i, // Very short abbreviations
    /^error|404|not found|page not found$/i // Error messages
  ];

  static validateTitle(title: string): TitleQualityScore {
    if (!title || typeof title !== 'string') {
      return {
        score: 0,
        isAcceptable: false,
        issues: ['Title is missing or invalid'],
        suggestions: ['Provide a valid title string']
      };
    }

    const cleanTitle = title.trim();
    let score = 100;
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Length validation
    if (cleanTitle.length < 3) {
      score -= 40;
      issues.push('Title is too short (< 3 characters)');
      suggestions.push('Use a more descriptive title');
    } else if (cleanTitle.length < 10) {
      score -= 20;
      issues.push('Title is quite short (< 10 characters)');
    } else if (cleanTitle.length > 200) {
      score -= 15;
      issues.push('Title is very long (> 200 characters)');
      suggestions.push('Consider shortening the title');
    }

    // Junk pattern detection
    for (const pattern of this.JUNK_PATTERNS) {
      if (pattern.test(cleanTitle)) {
        score -= 50;
        issues.push(`Title matches junk pattern: ${pattern.source}`);
        suggestions.push('Use a meaningful, descriptive title');
        break;
      }
    }

    // Platform name detection
    const lowerTitle = cleanTitle.toLowerCase();
    if (this.PLATFORM_NAMES.has(lowerTitle)) {
      score -= 35;
      issues.push('Title is just a platform/company name');
      suggestions.push('Include specific content description');
    }

    // Word count and diversity
    const words = cleanTitle.split(/\s+/).filter(word => word.length > 0);
    if (words.length === 1) {
      score -= 25;
      issues.push('Title contains only one word');
      suggestions.push('Use a multi-word descriptive title');
    } else if (words.length < 3) {
      score -= 15;
      issues.push('Title has very few words');
    }

    // Check for meaningful content
    const meaningfulWords = words.filter(word =>
      word.length > 3 &&
      !['the', 'and', 'for', 'with', 'from', 'that', 'this', 'they', 'have', 'been'].includes(word.toLowerCase())
    );

    if (meaningfulWords.length === 0) {
      score -= 30;
      issues.push('Title lacks meaningful content words');
      suggestions.push('Include specific, descriptive terms');
    } else if (meaningfulWords.length === 1) {
      score -= 15;
      issues.push('Title has only one meaningful word');
    }

    // Special characters and formatting
    const specialCharCount = (cleanTitle.match(/[^a-zA-Z0-9\s\-.,():]/g) || []).length;
    if (specialCharCount > cleanTitle.length * 0.2) {
      score -= 20;
      issues.push('Title contains excessive special characters');
      suggestions.push('Reduce special characters for better readability');
    }

    // XML/HTML remnants
    if (cleanTitle.includes('<') || cleanTitle.includes('>') || cleanTitle.includes('&')) {
      score -= 30;
      issues.push('Title contains HTML/XML remnants');
      suggestions.push('Clean title of markup tags');
    }

    // Capitalization patterns
    if (cleanTitle === cleanTitle.toUpperCase() && cleanTitle.length > 10) {
      score -= 10;
      issues.push('Title is entirely uppercase');
      suggestions.push('Use proper title case');
    } else if (cleanTitle === cleanTitle.toLowerCase() && cleanTitle.length > 10) {
      score -= 5;
      issues.push('Title is entirely lowercase');
      suggestions.push('Capitalize appropriately');
    }

    // Repetitive patterns
    const repeatedPattern = this.detectRepeatedPatterns(cleanTitle);
    if (repeatedPattern) {
      score -= 25;
      issues.push(`Title contains repeated pattern: "${repeatedPattern}"`);
      suggestions.push('Remove repetitive content');
    }

    // Ensure score is within bounds
    score = Math.max(0, Math.min(100, score));

    return {
      score,
      isAcceptable: score >= this.MINIMUM_SCORE,
      issues,
      suggestions: suggestions.length > 0 ? suggestions : undefined
    };
  }

  private static detectRepeatedPatterns(title: string): string | null {
    // Look for repeated words or phrases
    const words = title.toLowerCase().split(/\s+/);

    // Check for repeated consecutive words
    for (let i = 0; i < words.length - 1; i++) {
      if (words[i] === words[i + 1] && words[i].length > 2) {
        return words[i];
      }
    }

    // Check for repeated phrases (2-3 words)
    for (let phraseLen = 2; phraseLen <= 3; phraseLen++) {
      for (let i = 0; i <= words.length - phraseLen * 2; i++) {
        const phrase1 = words.slice(i, i + phraseLen).join(' ');
        const phrase2 = words.slice(i + phraseLen, i + phraseLen * 2).join(' ');

        if (phrase1 === phrase2) {
          return phrase1;
        }
      }
    }

    return null;
  }

  /**
   * Validates multiple titles and returns quality statistics
   */
  static validateTitles(titles: string[]): {
    acceptable: number;
    unacceptable: number;
    averageScore: number;
    commonIssues: Map<string, number>;
  } {
    const results = titles.map(title => this.validateTitle(title));

    const acceptable = results.filter(r => r.isAcceptable).length;
    const unacceptable = results.length - acceptable;
    const averageScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

    const commonIssues = new Map<string, number>();
    results.forEach(result => {
      result.issues.forEach(issue => {
        commonIssues.set(issue, (commonIssues.get(issue) || 0) + 1);
      });
    });

    return {
      acceptable,
      unacceptable,
      averageScore,
      commonIssues
    };
  }

  /**
   * Suggests improved title based on quality issues
   */
  static suggestImprovedTitle(title: string, metadata?: {
    url?: string;
    content?: string;
    doi?: string;
    authors?: string[];
  }): string | null {
    const quality = this.validateTitle(title);

    if (quality.isAcceptable) {
      return null; // Title is already acceptable
    }

    // Try to extract better title from metadata
    if (metadata?.url) {
      const urlTitle = this.extractTitleFromUrl(metadata.url);
      if (urlTitle && this.validateTitle(urlTitle).score > quality.score) {
        return urlTitle;
      }
    }

    if (metadata?.content) {
      const contentTitle = this.extractTitleFromContent(metadata.content);
      if (contentTitle && this.validateTitle(contentTitle).score > quality.score) {
        return contentTitle;
      }
    }

    // Basic cleanup if no better alternative found
    let improved = title.trim();

    // Remove HTML/XML tags
    improved = improved.replace(/<[^>]*>/g, '');

    // Clean up HTML entities
    improved = improved.replace(/&[a-zA-Z0-9#]+;/g, '');

    // Fix spacing
    improved = improved.replace(/\s+/g, ' ').trim();

    // Return improved version only if it's actually better
    const improvedQuality = this.validateTitle(improved);
    return improvedQuality.score > quality.score ? improved : null;
  }

  private static extractTitleFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const pathSegments = urlObj.pathname.split('/').filter(seg =>
        seg &&
        seg.length > 5 &&
        !seg.match(/^[0-9]+$/) &&
        !seg.match(/^(index|home|page|main)$/i)
      );

      if (pathSegments.length > 0) {
        const segment = pathSegments[pathSegments.length - 1];
        return segment
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, l => l.toUpperCase())
          .trim();
      }
    } catch (error) {
      // Invalid URL, ignore
    }

    return null;
  }

  private static extractTitleFromContent(content: string): string | null {
    // Look for title-like patterns in content
    const lines = content.split('\n').slice(0, 10); // Check first 10 lines

    for (const line of lines) {
      const cleaned = line.trim();
      if (cleaned.length > 10 && cleaned.length < 150) {
        const quality = this.validateTitle(cleaned);
        if (quality.score > 70) {
          return cleaned;
        }
      }
    }

    return null;
  }
}