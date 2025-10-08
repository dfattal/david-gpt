# Paywall & Anti-Scraping Handling

## Overview

Some premium news and publication websites use paywalls and anti-scraping measures that prevent automated content extraction. This document explains the limitations and recommended workarounds for admins.

## Affected Websites

The following domains are known to have paywalls or anti-scraping measures that interfere with automated extraction:

- **Forbes** (forbes.com)
- **Wall Street Journal** (wsj.com)
- **New York Times** (nytimes.com)
- **Financial Times** (ft.com)
- **The Economist** (economist.com)
- **Bloomberg** (bloomberg.com)
- **Washington Post** (washingtonpost.com)
- **Wired** (wired.com)
- **The Atlantic** (theatlantic.com)
- **Medium** (medium.com) - member-only articles

## Symptoms

When attempting to extract content from these sites, you may experience:

1. **Wrong article content** - The extraction returns a different article from the same publication
2. **Truncated content** - Only the first few paragraphs are extracted before hitting the paywall
3. **Generic paywall message** - The extracted content is just "Subscribe to continue reading..."
4. **Related content** - A different article about a similar topic is returned instead

## Why This Happens

### Forbes-Specific Issue

Forbes is particularly problematic because:
- It has multiple articles about similar topics
- It serves different content to automated scrapers vs. human browsers
- Both EXA and Gemini APIs may receive different articles than what you see in your browser
- The URL is correct, but the content returned is for a different article

**Example**: When extracting `https://www.forbes.com/sites/charliefink/2020/02/26/how-light-field-makes-holograms-happen`:
- Your browser shows: Article about David Fattal and Leia Inc.
- EXA extracts: Article about Looking Glass Factory
- Gemini extracts: Article about Light Field Labs
- **All three are different articles!**

### General Paywall Issues

Other sites may:
- Return HTTP 402/403 errors
- Redirect to subscription pages
- Return truncated content with paywall notices
- Serve cached or summarized versions to bots

## Recommended Workarounds

### Option 1: Print to PDF (Recommended)

1. Open the article in your browser (bypasses paywall with your subscription)
2. Use browser's "Print to PDF" function (Cmd+P / Ctrl+P)
3. Upload the PDF through the admin UI
4. The system will extract the full content from the PDF

**Benefits**:
- Preserves exact formatting
- Includes images and figures
- Most reliable method

### Option 2: Copy-Paste as Markdown

1. Open the article in your browser
2. Copy the article content (text only)
3. Format as markdown with proper structure:
   ```markdown
   ---
   title: "Article Title"
   author: "Author Name"
   published: "YYYY-MM-DD"
   source_url: "https://..."
   ---

   # Article Title

   Article content here...
   ```
4. Save as `.md` file
5. Upload through the admin UI

**Benefits**:
- Quick and simple
- Good control over structure
- No PDF conversion needed

### Option 3: Browser Extensions

Some browser extensions can help:
- **Pocket** - Save articles for later, then export
- **Instapaper** - Similar to Pocket
- **PrintFriendly** - Clean article view, export as PDF

## System Behavior

### Automatic Detection

The system now includes automatic paywall detection:

1. **Known Domain Check** - Forbes, WSJ, NYT, etc. skip EXA and try Gemini first
2. **Content Validation** - Checks for paywall keywords like "subscribe to read"
3. **Length Validation** - Flags suspiciously short content (< 1000 chars)
4. **Automatic Fallback** - If EXA fails, automatically retries with Gemini

### Worker Logs

When processing paywall sites, you'll see:
```
🚧 Known paywall domain detected, skipping EXA and using Gemini directly
```

Or if paywall detected after extraction:
```
🚧 Paywall indicators detected in EXA content, retrying with Gemini
```

## Implementation Details

See `src/lib/rag/extraction/genericArticleExtractor.ts`:
- `KNOWN_PAYWALL_DOMAINS` - Domain blacklist
- `isKnownPaywallDomain()` - Domain detection
- `hasPaywallIndicators()` - Content validation

## Best Practices

1. **For Forbes articles**: Always use PDF or manual extraction
2. **For other paywalled sites**: Try automated extraction first, but be prepared to use PDF fallback
3. **Verify content**: After extraction, check that the correct article was retrieved
4. **Use browser access**: If you have a subscription, always prefer PDF export
5. **Keep metadata accurate**: When manually extracting, ensure URLs, dates, and authors are correct

## Future Improvements

Potential enhancements (not yet implemented):
- Browser automation with Playwright for authenticated extraction
- Integration with Pocket/Instapaper APIs
- Manual article paste interface in admin UI
- Automatic content validation against user-provided article snippets
