#!/usr/bin/env node

/**
 * Enhanced Article Scraping Agent
 *
 * Implements comprehensive fallback logic:
 * EXA MCP → Gemini MCP → Playwright MCP
 *
 * Features:
 * - Quality validation at each step
 * - Rate limiting with delays
 * - Structured markdown output
 * - Comprehensive error handling
 * - Cost tracking
 */

const fs = require('fs');
const path = require('path');

// Target URLs for processing
const TARGET_URLS = [
    "https://www.businesswire.com/news/home/20170907005038/en/Red-Digital-Cinema-and-Leia-Inc.-Announce-Strategic-Partnership-to-Bring-Disruptive-Lightfield-Holographic-Smartphone-to-the-Consumer-Market",
    "https://www.theverge.com/24036574/leia-glasses-free-3d-ces-2024",
    "https://news.samsung.com/global/samsung-launches-next-gen-odyssey-gaming-monitors-that-showcase-immersive-3d-and-oled-excellence",
    "https://news.samsung.com/my/interview-transforming-the-monitor-experience-expanding-the-boundaries-with-odyssey-3d",
    "https://www.wired.com/story/3d-is-back/",
    "https://www.wired.com/review/samsung-odyssey-3d-27-inch-g90xf/",
    "https://news.samsung.com/global/gamescom-2025-samsung-odyssey-brings-fans-closer-to-the-games-they-love",
    "https://www.forbes.com/sites/charliefink/2020/02/28/leia-the-display-of-the-future/#65a058242270",
    "https://www.forbes.com/sites/charliefink/2020/02/26/how-light-field-makes-holograms-happen/#37710e0a1936",
    "https://www.forbes.com/sites/moorinsights/2023/04/05/leia-lume-pad-2-review-the-definitive-3-d-content-creation-and-consumption-tablet/",
    "https://www.zte.com.cn/global/about/news/zte-nubia-first-3d-ai-tablet-offers-eyewear-free-immersive-3d-experiences-content-creation.html",
    "https://www.digitaltrends.com/phones/zte-nubia-pad-3d-ii-crazy-android-tablet-mwc-2024-news/",
    "https://www.zte.com.cn/global/about/news/zte-launches-the-worlds-first-5g-ai-eyewear-free-3d-tablet-nubia-pad-3d-II-at-mwc-2024.html"
];

class EnhancedArticleScraper {
    constructor() {
        this.results = [];
        this.costs = {
            exa: 0.001, // per extraction
            gemini: 0,  // free
            playwright: 0 // local processing
        };
        this.stats = {
            total: 0,
            exa_success: 0,
            gemini_success: 0,
            playwright_success: 0,
            failures: 0
        };
    }

    // Quality validation
    validateContent(content, title = '') {
        if (!content || typeof content !== 'string') {
            return { valid: false, reason: 'No content' };
        }

        const cleanContent = content.trim();
        const wordCount = cleanContent.split(/\s+/).filter(w => w.length > 0).length;

        // Check minimum length requirements
        if (cleanContent.length < 500) {
            return { valid: false, reason: 'Content too short (< 500 chars)' };
        }

        if (wordCount < 50) {
            return { valid: false, reason: 'Content too short (< 50 words)' };
        }

        // Check for common error indicators
        const errorIndicators = [
            'access denied',
            'forbidden',
            '404 not found',
            'page not found',
            'error occurred',
            'try again later',
            'temporarily unavailable',
            'subscription required'
        ];

        const lowerContent = cleanContent.toLowerCase();
        for (const indicator of errorIndicators) {
            if (lowerContent.includes(indicator)) {
                return { valid: false, reason: `Contains error indicator: ${indicator}` };
            }
        }

        // Check if content is just the URL
        if (cleanContent.startsWith('http') && cleanContent.split('\n').length < 3) {
            return { valid: false, reason: 'Content is just URL' };
        }

        return { valid: true, wordCount, quality: this.assessQuality(cleanContent, wordCount) };
    }

    assessQuality(content, wordCount) {
        if (wordCount > 500) return 'high';
        if (wordCount > 200) return 'medium';
        return 'low';
    }

    // Extract domain from URL
    getDomain(url) {
        try {
            return new URL(url).hostname;
        } catch {
            return 'unknown';
        }
    }

    // Generate filename from URL and title
    generateFilename(url, title) {
        const domain = this.getDomain(url);
        const timestamp = new Date().toISOString().split('T')[0];

        // Clean title for filename
        const cleanTitle = title
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .substring(0, 50);

        return `${timestamp}-${domain}-${cleanTitle}.md`;
    }

    // Generate markdown content with frontmatter
    generateMarkdown(result) {
        const frontmatter = `---
title: "${result.title.replace(/"/g, '\\"')}"
url: "${result.url}"
domain: "${result.domain}"
extraction_method: "${result.method}"
scraped_at: "${new Date().toISOString()}"
published_date: "${result.publishedDate || ''}"
author: "${result.author || ''}"
word_count: ${result.wordCount}
image: "${result.image || ''}"
extraction_quality: "${result.quality}"
cost_dollars: ${result.cost}
---

# ${result.title}

${result.content}`;

        return frontmatter;
    }

    // Delay function for rate limiting
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Method 1: EXA MCP Extraction
    async extractWithExa(url) {
        console.log(`  → Attempting EXA extraction for ${this.getDomain(url)}...`);

        try {
            // This would call the EXA MCP - simulating for demo
            console.log(`  → EXA extraction initiated (10000 max chars)...`);

            // Simulate EXA response structure
            const mockExaResult = {
                results: [{
                    text: "Sample extracted content that would be much longer in real implementation...",
                    title: "Sample Article Title",
                    url: url,
                    publishedDate: "2024-01-01",
                    author: "Sample Author",
                    image: "https://example.com/image.jpg"
                }]
            };

            if (mockExaResult.results && mockExaResult.results[0]) {
                const result = mockExaResult.results[0];
                const validation = this.validateContent(result.text, result.title);

                if (validation.valid) {
                    console.log(`  ✓ EXA extraction successful - ${validation.wordCount} words (${validation.quality} quality)`);
                    return {
                        success: true,
                        content: result.text,
                        title: result.title || this.generateTitleFromUrl(url),
                        publishedDate: result.publishedDate,
                        author: result.author,
                        image: result.image,
                        method: 'exa',
                        cost: this.costs.exa,
                        wordCount: validation.wordCount,
                        quality: validation.quality
                    };
                } else {
                    console.log(`  ✗ EXA content validation failed: ${validation.reason}`);
                    return { success: false, error: `EXA validation failed: ${validation.reason}` };
                }
            } else {
                console.log(`  ✗ EXA returned no content`);
                return { success: false, error: 'EXA returned no content' };
            }

        } catch (error) {
            console.log(`  ✗ EXA extraction failed: ${error.message}`);
            return { success: false, error: `EXA error: ${error.message}` };
        }
    }

    // Method 2: Gemini MCP Extraction
    async extractWithGemini(url) {
        console.log(`  → Attempting Gemini extraction for ${this.getDomain(url)}...`);

        try {
            // This would call the Gemini MCP - simulating for demo
            console.log(`  → Gemini extraction initiated (model: gemini-2.5-flash)...`);

            // Simulate Gemini response
            const mockGeminiResult = {
                content: "# Sample Article Title\n\nSample extracted content that would be much longer in real implementation..."
            };

            if (mockGeminiResult.content) {
                const content = mockGeminiResult.content;
                const titleMatch = content.match(/^#\s+(.+)$/m);
                const title = titleMatch ? titleMatch[1] : this.generateTitleFromUrl(url);

                const validation = this.validateContent(content, title);

                if (validation.valid) {
                    console.log(`  ✓ Gemini extraction successful - ${validation.wordCount} words (${validation.quality} quality)`);
                    return {
                        success: true,
                        content: content,
                        title: title,
                        method: 'gemini',
                        cost: this.costs.gemini,
                        wordCount: validation.wordCount,
                        quality: validation.quality
                    };
                } else {
                    console.log(`  ✗ Gemini content validation failed: ${validation.reason}`);
                    return { success: false, error: `Gemini validation failed: ${validation.reason}` };
                }
            } else {
                console.log(`  ✗ Gemini returned no content`);
                return { success: false, error: 'Gemini returned no content' };
            }

        } catch (error) {
            console.log(`  ✗ Gemini extraction failed: ${error.message}`);
            return { success: false, error: `Gemini error: ${error.message}` };
        }
    }

    // Method 3: Playwright MCP Extraction
    async extractWithPlaywright(url) {
        console.log(`  → Attempting Playwright extraction for ${this.getDomain(url)}...`);

        try {
            // This would use Playwright MCP - simulating for demo
            console.log(`  → Playwright navigation initiated...`);

            // Simulate Playwright content extraction
            const mockPlaywrightContent = "Sample extracted content that would be much longer in real implementation...";
            const title = this.generateTitleFromUrl(url);

            const validation = this.validateContent(mockPlaywrightContent, title);

            if (validation.valid) {
                console.log(`  ✓ Playwright extraction successful - ${validation.wordCount} words (${validation.quality} quality)`);
                return {
                    success: true,
                    content: mockPlaywrightContent,
                    title: title,
                    method: 'playwright',
                    cost: this.costs.playwright,
                    wordCount: validation.wordCount,
                    quality: validation.quality
                };
            } else {
                console.log(`  ✗ Playwright content validation failed: ${validation.reason}`);
                return { success: false, error: `Playwright validation failed: ${validation.reason}` };
            }

        } catch (error) {
            console.log(`  ✗ Playwright extraction failed: ${error.message}`);
            return { success: false, error: `Playwright error: ${error.message}` };
        }
    }

    // Generate title from URL
    generateTitleFromUrl(url) {
        try {
            const urlObj = new URL(url);
            const path = urlObj.pathname;
            const segments = path.split('/').filter(s => s.length > 0);
            const lastSegment = segments[segments.length - 1] || urlObj.hostname;

            return lastSegment
                .replace(/[-_]/g, ' ')
                .replace(/\b\w/g, l => l.toUpperCase())
                .substring(0, 100);
        } catch {
            return 'Extracted Article';
        }
    }

    // Main extraction method with fallback logic
    async extractArticle(url) {
        console.log(`\n📄 Processing: ${url}`);
        this.stats.total++;

        const domain = this.getDomain(url);
        let result = null;

        // Method 1: EXA MCP (Primary)
        result = await this.extractWithExa(url);
        if (result.success) {
            this.stats.exa_success++;
            result.url = url;
            result.domain = domain;
            return result;
        }

        // Rate limiting delay before fallback
        console.log(`  ⏳ Waiting 3 seconds before Gemini fallback...`);
        await this.delay(3000);

        // Method 2: Gemini MCP (Fallback)
        result = await this.extractWithGemini(url);
        if (result.success) {
            this.stats.gemini_success++;
            result.url = url;
            result.domain = domain;
            return result;
        }

        // Rate limiting delay before final fallback
        console.log(`  ⏳ Waiting 3 seconds before Playwright fallback...`);
        await this.delay(3000);

        // Method 3: Playwright MCP (Final fallback)
        result = await this.extractWithPlaywright(url);
        if (result.success) {
            this.stats.playwright_success++;
            result.url = url;
            result.domain = domain;
            return result;
        }

        // All methods failed
        console.log(`  ❌ All extraction methods failed for ${domain}`);
        this.stats.failures++;
        return {
            success: false,
            url: url,
            domain: domain,
            error: 'All extraction methods failed',
            attempts: [
                result?.error || 'Unknown EXA error',
                'Gemini fallback failed',
                'Playwright fallback failed'
            ]
        };
    }

    // Save successful extraction to file
    async saveArticle(result) {
        try {
            const filename = this.generateFilename(result.url, result.title);
            const filepath = path.join('/Users/david.fattal/Documents/GitHub/david-gpt/scraped-articles', filename);
            const markdown = this.generateMarkdown(result);

            fs.writeFileSync(filepath, markdown, 'utf-8');
            console.log(`  💾 Saved to: ${filename}`);

            return filepath;
        } catch (error) {
            console.log(`  ❌ Failed to save article: ${error.message}`);
            throw error;
        }
    }

    // Generate comprehensive report
    generateReport() {
        const successRate = ((this.stats.total - this.stats.failures) / this.stats.total * 100).toFixed(1);
        const totalCost = this.results.reduce((sum, r) => sum + (r.cost || 0), 0);

        const report = `
# Article Scraping Report
Generated: ${new Date().toISOString()}

## Summary Statistics
- **Total URLs processed**: ${this.stats.total}
- **Successful extractions**: ${this.stats.total - this.stats.failures}
- **Success rate**: ${successRate}%
- **Total estimated cost**: $${totalCost.toFixed(4)}

## Method Performance
- **EXA MCP success**: ${this.stats.exa_success} (${(this.stats.exa_success/this.stats.total*100).toFixed(1)}%)
- **Gemini MCP success**: ${this.stats.gemini_success} (${(this.stats.gemini_success/this.stats.total*100).toFixed(1)}%)
- **Playwright MCP success**: ${this.stats.playwright_success} (${(this.stats.playwright_success/this.stats.total*100).toFixed(1)}%)
- **Complete failures**: ${this.stats.failures} (${(this.stats.failures/this.stats.total*100).toFixed(1)}%)

## Extracted Articles
${this.results.filter(r => r.success).map((r, i) =>
`${i + 1}. **${r.title}** (${r.domain})
   - Method: ${r.method}
   - Quality: ${r.quality}
   - Words: ${r.wordCount}
   - Cost: $${r.cost.toFixed(4)}
   - File: ${this.generateFilename(r.url, r.title)}`
).join('\n')}

## Failed Extractions
${this.results.filter(r => !r.success).map((r, i) =>
`${i + 1}. **${r.domain}** - ${r.error}`
).join('\n')}

## Recommendations
- Target success rate achieved: ${successRate >= 90 ? '✓' : '✗'} (${successRate}% vs 90% target)
- Cost efficiency: EXA primary method with Gemini fallback provides optimal cost/quality balance
- Failure analysis: ${this.stats.failures > 0 ? 'Review failed URLs for pattern analysis' : 'No failures detected'}
`;

        return report;
    }

    // Main execution method
    async run() {
        console.log('🚀 Enhanced Article Scraping Agent Starting...');
        console.log(`📊 Target: ${TARGET_URLS.length} URLs to process`);
        console.log(`🎯 Success target: 90%+`);
        console.log(`🔄 Fallback sequence: EXA → Gemini → Playwright`);

        for (const url of TARGET_URLS) {
            const result = await this.extractArticle(url);

            if (result.success) {
                try {
                    await this.saveArticle(result);
                } catch (saveError) {
                    console.log(`  ❌ Save failed: ${saveError.message}`);
                    result.saveError = saveError.message;
                }
            }

            this.results.push(result);

            // Rate limiting between URLs
            if (TARGET_URLS.indexOf(url) < TARGET_URLS.length - 1) {
                console.log(`  ⏳ Waiting 3 seconds before next URL...`);
                await this.delay(3000);
            }
        }

        // Generate and save report
        const report = this.generateReport();
        const reportPath = path.join('/Users/david.fattal/Documents/GitHub/david-gpt/scraped-articles', 'extraction-report.md');
        fs.writeFileSync(reportPath, report, 'utf-8');

        console.log('\n' + '='.repeat(80));
        console.log('📈 EXTRACTION COMPLETE');
        console.log('='.repeat(80));
        console.log(report);
        console.log(`\n📄 Full report saved to: extraction-report.md`);
    }
}

// Execute if run directly
if (require.main === module) {
    const scraper = new EnhancedArticleScraper();
    scraper.run().catch(console.error);
}

module.exports = EnhancedArticleScraper;