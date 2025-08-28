import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export interface TagSuggestion {
  tag: string
  category: 'technology' | 'company' | 'concept' | 'person' | 'product' | 'domain' | 'methodology'
  confidence: number
  reasoning: string
}

export interface TagCategorizationResult {
  suggestedTags: TagSuggestion[]
  normalizedExistingTags: string[]
  processingTime: number
}

export class TagCategorizationService {
  private static readonly PREDEFINED_CATEGORIES = {
    technology: ['AI', 'Machine Learning', 'Deep Learning', 'Neural Networks', 'Computer Vision', 'NLP', 'Robotics', '3D', 'VR', 'AR', 'Spatial Computing'],
    company: ['OpenAI', 'Google', 'Meta', 'Apple', 'Microsoft', 'World Labs', 'Leia Inc', 'DeepMind'],
    concept: ['Spatial Intelligence', 'AGI', 'Multimodality', 'Reasoning', 'Planning', 'Understanding'],
    person: ['Fei-Fei Li', 'Yann LeCun', 'Geoffrey Hinton', 'David Ha', 'Jürgen Schmidhuber'],
    product: ['GPT', 'DALL-E', 'ChatGPT', 'Genie', 'JEPA', 'Large World Models', 'LWM'],
    domain: ['Research', 'Academia', 'Industry', 'Startup', 'Enterprise', 'Gaming', 'Simulation'],
    methodology: ['Self-Supervised Learning', 'Supervised Learning', 'Reinforcement Learning', 'Transfer Learning']
  }

  async categorizeAndSuggestTags(
    content: string,
    existingTags: string[] = [],
    options: {
      maxSuggestions?: number
      includePredefined?: boolean
      confidenceThreshold?: number
    } = {}
  ): Promise<TagCategorizationResult> {
    const startTime = performance.now()
    const { maxSuggestions = 8, includePredefined = true, confidenceThreshold = 0.6 } = options

    try {
      // Build context for AI
      let predefinedContext = ''
      if (includePredefined) {
        predefinedContext = `\nHere are some predefined high-quality tags by category:
Technology: ${TagCategorizationService.PREDEFINED_CATEGORIES.technology.join(', ')}
Company: ${TagCategorizationService.PREDEFINED_CATEGORIES.company.join(', ')}
Concept: ${TagCategorizationService.PREDEFINED_CATEGORIES.concept.join(', ')}
Person: ${TagCategorizationService.PREDEFINED_CATEGORIES.person.join(', ')}
Product: ${TagCategorizationService.PREDEFINED_CATEGORIES.product.join(', ')}
Domain: ${TagCategorizationService.PREDEFINED_CATEGORIES.domain.join(', ')}
Methodology: ${TagCategorizationService.PREDEFINED_CATEGORIES.methodology.join(', ')}

Prefer using these predefined tags when they match the content.`
      }

      const prompt = `You are an expert AI librarian tasked with analyzing document content and suggesting high-quality, standardized tags for knowledge management.

CONTENT TO ANALYZE:
${content.substring(0, 2000)}${content.length > 2000 ? '...' : ''}

EXISTING TAGS: ${existingTags.join(', ') || 'None'}${predefinedContext}

INSTRUCTIONS:
1. Suggest ${maxSuggestions} high-quality tags that would help categorize and find this content
2. Prioritize predefined tags when they accurately describe the content
3. For each tag, provide:
   - The exact tag name (use proper capitalization)
   - Category: technology, company, concept, person, product, domain, or methodology
   - Confidence (0.0 to 1.0)
   - Brief reasoning

4. Focus on:
   - Key technologies, methodologies, and concepts discussed
   - Important people, companies, and products mentioned
   - Domain areas and research fields covered
   - Avoid overly broad tags like "AI" unless it's the main focus

5. Also provide normalized versions of existing tags (fix capitalization, spelling)

Respond with valid JSON only:
{
  "suggestedTags": [
    {
      "tag": "Spatial Intelligence",
      "category": "concept",
      "confidence": 0.95,
      "reasoning": "Central theme of the document"
    }
  ],
  "normalizedExistingTags": ["Spatial AI", "Large World Models"]
}`

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1500
      })

      const content_text = response.choices[0]?.message?.content?.trim()
      if (!content_text) {
        throw new Error('No response from OpenAI')
      }

      // Clean and parse JSON response
      let cleanedContent = content_text.trim()
      
      // Remove markdown code block markers if present
      if (cleanedContent.startsWith('```json')) {
        cleanedContent = cleanedContent.replace(/^```json\s*/g, '').replace(/\s*```$/g, '')
      } else if (cleanedContent.startsWith('```')) {
        cleanedContent = cleanedContent.replace(/^```\s*/g, '').replace(/\s*```$/g, '')
      }
      
      const parsed = JSON.parse(cleanedContent)
      
      // Filter by confidence threshold
      const filteredSuggestions = parsed.suggestedTags.filter(
        (tag: TagSuggestion) => tag.confidence >= confidenceThreshold
      )

      const processingTime = performance.now() - startTime

      return {
        suggestedTags: filteredSuggestions,
        normalizedExistingTags: parsed.normalizedExistingTags || existingTags,
        processingTime
      }

    } catch (error) {
      console.error('Tag categorization failed:', error)
      
      // Fallback: basic keyword extraction
      const fallbackTags = this.extractBasicKeywords(content, maxSuggestions)
      const processingTime = performance.now() - startTime

      return {
        suggestedTags: fallbackTags.map(tag => ({
          tag,
          category: 'concept' as const,
          confidence: 0.5,
          reasoning: 'Extracted via keyword analysis (AI failed)'
        })),
        normalizedExistingTags: existingTags,
        processingTime
      }
    }
  }

  private extractBasicKeywords(content: string, maxSuggestions: number): string[] {
    // Simple keyword extraction as fallback
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)

    const wordCounts = new Map<string, number>()
    words.forEach(word => {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1)
    })

    // Get most frequent words, excluding common words
    const commonWords = new Set(['that', 'this', 'with', 'from', 'they', 'were', 'been', 'have', 'their', 'would', 'there', 'could', 'other'])
    
    return Array.from(wordCounts.entries())
      .filter(([word]) => !commonWords.has(word))
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxSuggestions)
      .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1))
  }

  /**
   * Normalize a tag by checking against predefined categories and fixing common issues
   */
  normalizeTag(tag: string): string {
    const trimmed = tag.trim()
    
    // Check against predefined tags (case-insensitive)
    for (const [category, tags] of Object.entries(TagCategorizationService.PREDEFINED_CATEGORIES)) {
      for (const predefinedTag of tags) {
        if (trimmed.toLowerCase() === predefinedTag.toLowerCase()) {
          return predefinedTag // Return the canonical form
        }
      }
    }

    // Basic normalization
    return trimmed.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  /**
   * Find potential duplicates or similar tags that should be merged
   */
  findSimilarTags(tags: string[]): Array<{ canonical: string, variants: string[] }> {
    const groups = new Map<string, string[]>()
    
    tags.forEach(tag => {
      const normalized = this.normalizeTag(tag)
      const existing = groups.get(normalized.toLowerCase()) || []
      existing.push(tag)
      groups.set(normalized.toLowerCase(), existing)
    })

    return Array.from(groups.entries())
      .filter(([_, variants]) => variants.length > 1)
      .map(([canonical, variants]) => ({
        canonical: this.normalizeTag(variants[0]),
        variants
      }))
  }
}

export const tagCategorizationService = new TagCategorizationService()