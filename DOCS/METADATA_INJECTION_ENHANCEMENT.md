# Metadata Injection Enhancement for RAG Quality

## Current State Analysis

The existing chunking system (`chunking.ts` and `semantic-chunking.ts`) has basic metadata handling but lacks comprehensive metadata injection that would significantly improve RAG retrieval accuracy.

### Current Limitations:
1. **Missing Document Context**: Chunks don't include key document metadata (authors, dates, document type)
2. **No Metadata-Aware Chunking**: Chunking doesn't consider document structure metadata
3. **Limited Retrieval Enhancement**: Metadata isn't embedded in content for better matching

## Enhanced Metadata Injection Strategy

### Phase 3.1: Core Metadata Injection Improvements

#### 1. Enhanced DocumentChunk Metadata Structure
```typescript
interface EnhancedChunkMetadata {
  // Document-level metadata (ALWAYS included)
  document_title: string;
  document_type: 'paper' | 'patent' | 'press-article' | 'url' | 'note';
  authors?: string[];
  publication_date?: string;
  venue?: string;

  // Technical metadata (from extraction strategy)
  oem?: string;
  model?: string;
  display_type?: string;
  leia_features?: string[];

  // Content-specific metadata
  section_title?: string;
  section_type?: 'abstract' | 'introduction' | 'methods' | 'results' | 'claims' | 'references';
  chunk_type: 'content' | 'metadata' | 'citation' | 'technical_spec';

  // Processing metadata
  extraction_strategy: 'complete' | 'structured' | 'strategic';
  extraction_quality: 'high' | 'medium' | 'low';
  source_url: string;

  // Enhanced retrieval metadata
  searchable_context: string; // Metadata summary for better matching
  temporal_context?: string; // "2023 Samsung Odyssey 3D monitor research"
  technical_context?: string; // "Leia lightfield display technology patent"
}
```

#### 2. Metadata-Enhanced Content Injection
```typescript
// Inject key metadata directly into chunk content for better retrieval
function enhanceChunkWithMetadata(
  chunk: DocumentChunk,
  documentMetadata: DocumentMetadata
): DocumentChunk {
  const metadataPrefix = buildMetadataPrefix(documentMetadata);
  const enhancedContent = `${metadataPrefix}\n\n${chunk.content}`;

  return {
    ...chunk,
    content: enhancedContent,
    token_count: estimateTokens(enhancedContent),
    metadata: {
      ...chunk.metadata,
      ...buildEnhancedMetadata(documentMetadata, chunk)
    }
  };
}

function buildMetadataPrefix(metadata: DocumentMetadata): string {
  const parts: string[] = [];

  // Document identification
  if (metadata.title) parts.push(`Title: ${metadata.title}`);
  if (metadata.authors?.length) parts.push(`Authors: ${metadata.authors.join(', ')}`);
  if (metadata.publication_date) parts.push(`Date: ${metadata.publication_date}`);

  // Technical context
  if (metadata.oem) parts.push(`Manufacturer: ${metadata.oem}`);
  if (metadata.model) parts.push(`Product: ${metadata.model}`);
  if (metadata.display_type) parts.push(`Technology: ${metadata.display_type}`);

  // Document type context
  const typeContext = getDocumentTypeContext(metadata.docType);
  if (typeContext) parts.push(typeContext);

  return parts.join(' | ');
}
```

#### 3. Section-Aware Metadata Enhancement
```typescript
// Enhanced section detection with metadata injection
function enhanceChunkWithSectionMetadata(
  chunk: DocumentChunk,
  sectionInfo: DocumentSection,
  documentMetadata: DocumentMetadata
): DocumentChunk {

  // Determine section type for better categorization
  const sectionType = classifySectionType(sectionInfo.title);

  // Build section-specific context
  const sectionContext = buildSectionContext(sectionType, sectionInfo, documentMetadata);

  return {
    ...chunk,
    metadata: {
      ...chunk.metadata,
      section_title: sectionInfo.title,
      section_type: sectionType,
      searchable_context: sectionContext,
      chunk_type: inferChunkType(sectionType, chunk.content)
    }
  };
}

function classifySectionType(title: string): string {
  const titleLower = title.toLowerCase();

  if (/abstract|summary/.test(titleLower)) return 'abstract';
  if (/introduction|background/.test(titleLower)) return 'introduction';
  if (/method|approach|implementation/.test(titleLower)) return 'methods';
  if (/result|finding|data|analysis/.test(titleLower)) return 'results';
  if (/claim|patent claim/.test(titleLower)) return 'claims';
  if (/reference|citation|bibliography/.test(titleLower)) return 'references';
  if (/conclusion|discussion/.test(titleLower)) return 'conclusion';

  return 'content';
}
```

#### 4. Specialized Metadata Injection by Document Type

**Academic Papers:**
```typescript
function enhancePaperChunk(chunk: DocumentChunk, metadata: PaperMetadata): DocumentChunk {
  const academicContext = [
    metadata.venue && `Published in ${metadata.venue}`,
    metadata.publication_year && `(${metadata.publication_year})`,
    metadata.doi && `DOI: ${metadata.doi}`,
    metadata.keywords?.length && `Keywords: ${metadata.keywords.join(', ')}`
  ].filter(Boolean).join(' | ');

  return enhanceChunkWithContext(chunk, academicContext, 'academic');
}
```

**Patents:**
```typescript
function enhancePatentChunk(chunk: DocumentChunk, metadata: PatentMetadata): DocumentChunk {
  const patentContext = [
    metadata.patent_no && `Patent ${metadata.patent_no}`,
    metadata.inventors?.length && `Inventors: ${metadata.inventors.join(', ')}`,
    metadata.assignees?.length && `Assignee: ${metadata.assignees.join(', ')}`,
    metadata.filing_date && `Filed: ${metadata.filing_date}`,
    metadata.grant_date && `Granted: ${metadata.grant_date}`
  ].filter(Boolean).join(' | ');

  return enhanceChunkWithContext(chunk, patentContext, 'patent');
}
```

**Press Articles:**
```typescript
function enhanceArticleChunk(chunk: DocumentChunk, metadata: ArticleMetadata): DocumentChunk {
  const articleContext = [
    metadata.outlet && `Source: ${metadata.outlet}`,
    metadata.journalist?.length && `By: ${metadata.journalist.join(', ')}`,
    metadata.published_date && `Published: ${metadata.published_date}`,
    metadata.oem && `Company: ${metadata.oem}`,
    metadata.model && `Product: ${metadata.model}`
  ].filter(Boolean).join(' | ');

  return enhanceChunkWithContext(chunk, articleContext, 'press');
}
```

#### 5. Implementation in Current Chunking Pipeline
```typescript
// Enhanced chunkDocument method with metadata injection
async chunkDocument(
  text: string,
  documentId: string,
  documentMetadata: DocumentMetadata,
  extractionStrategy: 'complete' | 'structured' | 'strategic' = 'complete'
): Promise<DocumentChunk[]> {

  // Standard chunking process
  const baseChunks = await this.standardChunkingProcess(text, documentId);

  // Enhanced metadata injection
  const enhancedChunks = baseChunks.map(chunk => {
    // 1. Add document-level metadata
    let enhancedChunk = this.injectDocumentMetadata(chunk, documentMetadata);

    // 2. Add section-specific metadata if available
    if (chunk.sectionTitle) {
      enhancedChunk = this.injectSectionMetadata(enhancedChunk, documentMetadata);
    }

    // 3. Add document-type-specific metadata
    enhancedChunk = this.injectTypeSpecificMetadata(enhancedChunk, documentMetadata);

    // 4. Add extraction strategy context
    enhancedChunk = this.injectExtractionContext(enhancedChunk, extractionStrategy);

    // 5. Generate searchable context for better retrieval
    enhancedChunk = this.generateSearchableContext(enhancedChunk, documentMetadata);

    return enhancedChunk;
  });

  return enhancedChunks;
}
```

### Expected Improvements

#### 1. Enhanced Retrieval Accuracy
- **Metadata-aware matching**: Queries can match against author names, dates, companies
- **Contextual relevance**: Chunks include document context for better semantic matching
- **Temporal filtering**: Date-based metadata enables time-sensitive queries

#### 2. Better Citation Generation
- **Complete attribution**: All chunks include full document attribution
- **Section-specific citations**: Can cite specific paper sections or patent claims
- **Source traceability**: Enhanced URL and extraction metadata

#### 3. Improved Query Routing
- **Document type awareness**: Route technical queries to papers/patents, news queries to articles
- **Section targeting**: Direct methodology questions to methods sections
- **Company/product filtering**: Filter by OEM, product model, technology type

#### 4. Quality Preservation
- **Extraction strategy tracking**: Know which chunks used strategic vs complete extraction
- **Quality indicators**: Flag chunks based on extraction quality
- **Source verification**: Maintain full traceability to original sources

### Implementation Priority

1. **Phase 3.1**: Core metadata injection in chunking pipeline
2. **Phase 3.2**: Document hierarchy awareness in retrieval system
3. **Phase 3.3**: Fallback to full document when summary insufficient
4. **Phase 3.4**: Quality metrics for extraction assessment

This enhancement maintains the citation-first approach while significantly improving retrieval accuracy through comprehensive metadata injection.