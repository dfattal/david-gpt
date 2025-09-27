# Document Ingestion Format Specification

This document defines the standardized markdown format required for document ingestion into expert RAG systems. All documents must be properly formatted markdown with complete metadata to ensure optimal search performance and accurate citations.

The format is designed to be extensible and persona-agnostic, supporting different expert domains (legal, medical, technical, etc.) while maintaining consistent structure and processing capabilities.

## Overview

The ingestion pipeline expects structured markdown documents with:
1. **YAML frontmatter** containing all metadata fields needed for SQL and vector search
2. **Properly formatted markdown content** with clear heading hierarchy
3. **All metadata embedded** to eliminate the need for URL parsing during ingestion

## Document Types

The system supports an extensible set of document types. Core types include:

### Base Document Types
- `paper` - Academic papers and research articles
- `patent` - Patent documents
- `book` - Books and book chapters
- `press-article` - News articles and press releases
- `url` - Web articles and blog posts
- `note` - Personal notes and documentation

### Extensible Types by Persona
Document types can be extended based on expert domain:

**Legal Persona:**
- `legal-doc` - Court documents, contracts, agreements
- `case-law` - Legal precedents and judicial decisions
- `statute` - Laws, regulations, and statutes
- `legal-brief` - Legal briefs and motions

**Medical Persona:**
- `medical-paper` - Medical research and clinical studies
- `clinical-trial` - Clinical trial reports
- `medical-guideline` - Treatment guidelines and protocols
- `case-report` - Medical case reports

**Technical Persona:**
- `technical-spec` - Technical specifications
- `api-doc` - API documentation
- `manual` - Technical manuals and guides

New document types can be registered dynamically without modifying core system files.

## YAML Frontmatter Structure

### Core Required Fields (All Documents)
```yaml
---
title: "Document Title"                    # Primary title for search and display
docType: "paper|patent|book|press-article|url|note|legal-doc|case-law|statute|medical-paper|clinical-trial|technical-spec|api-doc|manual|custom-type"
url: "https://example.com/document"        # Source URL (if applicable)
scraped_at: "2025-01-18T20:30:00.000Z"   # ISO timestamp of extraction
word_count: 1200                          # Approximate word count
extraction_quality: "high|medium|low"     # Quality assessment
persona: "david|legal|medical|technical"  # Expert persona (optional, defaults to system config)
---
```

### Extended Metadata Framework
The system supports both **core metadata** (universal across all document types) and **persona-specific metadata** (relevant to specific expert domains). Documents can include:

1. **Core fields** - Always processed and indexed
2. **Persona fields** - Processed based on active persona configuration
3. **Custom fields** - Domain-specific extensions for specialized use cases

### Patent Documents
```yaml
---
title: "Patent Title"
docType: "patent"
patentNo: "US11,234,567"                  # Primary patent number
patentFamily: ["US11234567", "WO2023123456", "EP1234567"]  # All family members
inventors: ["John Smith", "Jane Doe"]      # Full inventor names
assignees: ["Company Inc."]               # Current assignee(s)
originalAssignee: "Original Corp"         # Original assignee (if different)
filedDate: "2021-03-15"                   # Filing date (YYYY-MM-DD)
grantedDate: "2023-06-20"                 # Grant date (YYYY-MM-DD)
expirationDate: "2041-03-15"              # Estimated expiration
applicationNo: "17/123,456"               # Application number
priorityDate: "2020-12-01"                # Priority date
url: "https://patents.google.com/patent/US11234567"
scraped_at: "2025-01-18T20:30:00.000Z"
word_count: 12500
extraction_quality: "high"
---
```

### Academic Papers
```yaml
---
title: "Paper Title: Subtitle"             # REQUIRED: Paper title
docType: "paper"                          # REQUIRED: Must be "paper"
authors:                                  # REQUIRED: Author names with optional affiliations
  - name: "First Author"                  # REQUIRED: Author full name
    affiliation: "University of Example"  # Optional: Institution name
  - name: "Second Author"
    affiliation: "Research Institute"
venue: "Nature Photonics"                 # REQUIRED: Journal or conference name
publicationYear: 2023                     # REQUIRED: Publication year as integer
doi: "10.1038/s41566-023-12345-6"        # DOI identifier (null if none)
arxivId: "2301.12345"                     # arXiv ID (null if none)
citationCount: 42                         # Citation count (null if unknown)
abstract: "Brief abstract text..."         # REQUIRED: Paper abstract
keywords: ["optics", "displays", "3D"]    # REQUIRED: Array format with research keywords
technologies: ["Photonics", "ML", "CV"]   # REQUIRED: Array format with technologies mentioned
url: "https://doi.org/10.1038/s41566-023-12345-6" # REQUIRED: Source URL
scraped_at: "2025-01-18T20:30:00.000Z"   # REQUIRED: ISO timestamp
word_count: 8500                          # REQUIRED: Approximate word count
extraction_quality: "high"                # REQUIRED: "high"|"medium"|"low"
---
```

### Press Articles
```yaml
---
title: "Article Headline"
docType: "press-article"
authors:
  - name: "Reporter Name"
  - name: "Co-Author"
journalist: ["Reporter Name", "Co-Author"] # All journalists
outlet: "TechCrunch"                      # Publication outlet
published_date: "2025-01-15T00:00:00.000Z" # Publication date
oem: "Samsung"                            # Original Equipment Manufacturer
model: "Odyssey 3D G90XF"                # Product model
productCategory: "Gaming Monitor"         # Product category
displaySize: "27-inch"                    # Display size
displayType: "OLED"                       # Display technology
refreshRate: "165Hz"                      # Refresh rate
leiaFeature: ["Lenticular Lens", "Eye Tracking"] # Leia-specific features
launchYear: 2025                          # Product launch year
marketRegion: ["US", "EU", "APAC"]       # Target markets
priceRange: "$1,500-$2,000"              # Price range
domain: "techcrunch.com"                  # Source domain
image: "https://example.com/image.jpg"    # Featured image URL
cost_dollars: 0.001                       # Extraction cost
url: "https://techcrunch.com/article"
scraped_at: "2025-01-18T20:30:00.000Z"
word_count: 1500
extraction_quality: "high"
---
```

### Books
```yaml
---
title: "Book Title: Subtitle"
docType: "book"
authors:
  - name: "Author Name"
    affiliation: "Institution"            # Optional
venue: "Publisher Name"                   # Publisher
publicationYear: 2023                    # Publication year
isbn: "978-0123456789"                   # ISBN (if applicable)
chapter: "Chapter 5: Advanced Topics"    # Specific chapter (if applicable)
pageRange: "120-145"                     # Page range (if chapter)
url: "https://publisher.com/book"
scraped_at: "2025-01-18T20:30:00.000Z"
word_count: 5200
extraction_quality: "high"
---
```

### Web Articles/URLs
```yaml
---
title: "Web Article Title"
docType: "url"
authors:
  - name: "Author Name"
date: "2025-01-15"                       # Publication date
domain: "example.com"                    # Source domain
extraction_method: "exa|manual|other"    # Extraction method used
image: "https://example.com/image.jpg"   # Featured image
cost_dollars: 0.001                      # Extraction cost
url: "https://example.com/article"
scraped_at: "2025-01-18T20:30:00.000Z"
word_count: 800
extraction_quality: "medium"
---
```

## Persona-Specific Document Types

### Legal Documents
```yaml
---
title: "Document Title v. Defendant Title"
docType: "legal-doc|case-law|statute|legal-brief"
persona: "legal"

# Legal Identification
caseNumber: "21-CV-1234"                 # Court case number
courtLevel: "Supreme Court|Appeals|District|State|Federal"
jurisdiction: "US|NY|CA|Federal"         # Legal jurisdiction
legalCitation: "123 F.3d 456 (2d Cir. 2023)"  # Standard legal citation

# Case Information
caseParties:                             # Party information
  plaintiff: ["Company A", "Individual B"]
  defendant: ["Company C", "Government Agency"]
caseType: "Civil|Criminal|Constitutional|Administrative"
legalTopics: ["Contract Law", "IP Law", "Constitutional Rights"]

# Court Details
courtName: "United States District Court for the Southern District of New York"
judgeName: "Hon. John Smith"
attorneys:                               # Legal representation
  - name: "Jane Doe, Esq."
    firm: "Law Firm LLP"
    represents: "plaintiff"

# Decision Information
outcome: "Granted|Denied|Dismissed|Settled"  # Case outcome
precedential: true                       # Whether case sets precedent
appealStatus: "Final|Under Appeal|Remanded"

# Dates
filedDate: "2021-03-15"                 # Case filed date
decidedDate: "2023-06-20"               # Decision date
effectiveDate: "2023-07-01"             # When ruling takes effect

url: "https://caselaw.findlaw.com/case"
scraped_at: "2025-01-18T20:30:00.000Z"
word_count: 5200
extraction_quality: "high"
---
```

### Medical Documents
```yaml
---
title: "Clinical Study Title"
docType: "medical-paper|clinical-trial|medical-guideline|case-report"
persona: "medical"

# Medical Identification
clinicalTrialId: "NCT12345678"          # ClinicalTrials.gov ID
pubmedId: "PMID12345678"                # PubMed ID
meshTerms: ["Oncology", "Immunotherapy", "Clinical Trial"]

# Study Information
studyType: "RCT|Observational|Meta-Analysis|Case Series"
studyPhase: "Phase I|Phase II|Phase III|Phase IV"  # For clinical trials
patientPopulation: "Adults 18-65"       # Target population
sampleSize: 150                         # Number of participants

# Medical Classification
medicalSpecialty: ["Oncology", "Cardiology", "Neurology"]
interventionType: "Drug|Device|Procedure|Behavioral"
primaryEndpoint: "Overall Survival"     # Primary outcome measure
secondaryEndpoints: ["Progression-free survival", "Quality of life"]

# Regulatory Information
fdaApproval: "Approved|Pending|Denied"  # FDA approval status
regulatoryBody: ["FDA", "EMA", "Health Canada"]
guideline: "CONSORT|STROBE|PRISMA"     # Reporting guideline followed

# Clinical Context
indication: "Advanced Melanoma"          # Medical condition treated
contraindicationss: ["Pregnancy", "Severe liver disease"]
adverseEvents: ["Fatigue", "Nausea", "Rash"]

url: "https://clinicaltrials.gov/study/NCT12345678"
scraped_at: "2025-01-18T20:30:00.000Z"
word_count: 3500
extraction_quality: "high"
---
```

## Content Structure

### Markdown Content Requirements

1. **Title as H1**: Content must start with the title as an H1 heading
2. **Clear hierarchy**: Use proper heading levels (H2, H3, etc.)
3. **Abstract/Summary**: Include a clear abstract or summary section
4. **Structured content**: Use lists, tables, and formatting appropriately
5. **Citations**: Include inline citations and references where applicable

### Critical Format Rules

**Simple Arrays**: Simple arrays (strings only) MUST use inline format:
```yaml
# CORRECT - Inline format for simple arrays
keywords: ["keyword1", "keyword2", "keyword3"]
technologies: ["tech1", "tech2", "tech3"]
leiaFeature: ["Eye Tracking", "Lenticular Lens"]

# INCORRECT - Block format for simple arrays (causes inconsistency)
keywords:
  - "keyword1"
  - "keyword2"
  - "keyword3"
```

**Complex Object Arrays**: Arrays containing objects with multiple fields MUST use block format:
```yaml
# CORRECT - Block format for complex objects
authors:
  - name: "First Author"
    affiliation: "Institution" # Optional
  - name: "Second Author"

# INCORRECT - Deprecated formats
authorsAffiliations:
  - name: "First Author"
    affiliation: "Institution"
author: "First Author, Second Author"
```

**Required vs Optional Fields**:
- All REQUIRED fields must be present (use `null` for unknown values)
- Optional fields may be omitted entirely
- Never use empty strings `""` - use `null` instead

### Example Structure
```markdown
# Document Title

Brief introductory paragraph summarizing the main points.

## Abstract

Detailed abstract or summary of the document content...

## Main Content

### Subsection 1

Content with proper formatting...

### Subsection 2

More content...

## Conclusion

Summary and conclusions...

## References

[1] Citation format example
[2] Another citation
```

## Patent-Specific Requirements

### Patent Family Identifiers
Patents must include ALL family members in the `patentFamily` array:
- US patents: `US11234567`, `US11,234,567`
- International: `WO2023123456`
- European: `EP1234567`
- Chinese: `CN114567890`
- Japanese: `JP7234567`
- Korean: `KR102345678`
- German: `DE102021123456`
- And others as applicable

### Priority Chain
Include complete priority information:
```yaml
priorityDate: "2020-12-01"               # Earliest priority date
priorityChain:                           # Full priority chain
  - application: "US16/123,456"
    date: "2020-12-01"
  - application: "PCT/US2021/123456"
    date: "2021-11-30"
```

## Extensibility Framework

### Adding New Document Types

The system supports dynamic registration of new document types without modifying core files:

1. **Document Type Registration**:
```typescript
// Register new document type
registerDocumentType('financial-report', {
  persona: 'financial',
  requiredFields: ['reportType', 'fiscalYear', 'company'],
  optionalFields: ['sector', 'auditor', 'gaapCompliant'],
  metadataTemplate: 'financial-template'
});
```

2. **Metadata Template Definition**:
```typescript
// Define metadata injection template
registerMetadataTemplate('financial-template', (metadata) => {
  return `${metadata.company} ${metadata.reportType} - FY${metadata.fiscalYear}`;
});
```

3. **Detection Rules**:
```typescript
// Add detection patterns
registerDetectionRule('financial-report', {
  filePatterns: ['*annual*report*', '*10-K*', '*earnings*'],
  contentPatterns: [/annual report/i, /SEC filing/i, /GAAP/i],
  confidence: 0.8
});
```

### Persona Configuration

Each persona can define its own set of document types and processing rules:

```yaml
# personas.yaml
personas:
  legal:
    name: "Legal Expert"
    documentTypes:
      - legal-doc
      - case-law
      - statute
      - legal-brief
    searchBoosts:
      precedential: 1.5
      courtLevel: 1.2
    citationFormat: "legal"

  medical:
    name: "Medical Expert"
    documentTypes:
      - medical-paper
      - clinical-trial
      - medical-guideline
      - case-report
    searchBoosts:
      evidenceLevel: 1.8
      studyType: 1.3
    citationFormat: "medical"
```

### Custom Field Validation

The system validates custom fields based on persona configuration:

```typescript
interface PersonaConfig {
  name: string;
  documentTypes: string[];
  requiredFields: Record<string, FieldValidation>;
  optionalFields: Record<string, FieldValidation>;
  searchBoosts: Record<string, number>;
  citationFormat: string;
}

interface FieldValidation {
  type: 'string' | 'number' | 'date' | 'array' | 'enum';
  pattern?: RegExp;
  values?: string[];
  required?: boolean;
}
```

## Content Processing Notes

### Metadata Injection
The system automatically injects metadata into abstract chunks during processing:
- **Patents**: Inventor names, assignees, dates injected into abstract
- **Papers**: Author names, venue, DOI injected into abstract
- **Press Articles**: OEM, model, features injected into abstract

### Search Optimization
Metadata should include ALL terms users might search for:
- **Author/Inventor names**: Full names, common variations
- **Company names**: Official names, common abbreviations
- **Product identifiers**: Model numbers, code names
- **Technical terms**: Keywords, acronyms, specifications

### Quality Indicators
Use `extraction_quality` to indicate confidence:
- `high`: Complete extraction with verified metadata
- `medium`: Good extraction with some missing metadata
- `low`: Basic extraction with minimal metadata

## Validation Requirements

Before ingestion, documents must pass:

1. **YAML validation**: Valid frontmatter with ALL required fields
2. **Format consistency**:
   - `docType` field (not `doc_type`)
   - `authors` array (not `author` string or `authorsAffiliations`)
   - Inline arrays for `keywords` and `technologies`
   - ISO timestamps for `scraped_at`
3. **Content validation**: Proper markdown structure
4. **Metadata completeness**: All relevant fields populated with correct data types
5. **Search readiness**: Contains searchable terms and identifiers

### Common Format Errors to Avoid

❌ **Wrong field names**: `doc_type`, `author`, `authorsAffiliations`, `date`
✅ **Correct field names**: `docType`, `authors`, `publicationYear`

❌ **Inconsistent arrays**: Mix of block and inline formats
✅ **Consistent arrays**: Always use inline format `["item1", "item2"]`

❌ **Missing required fields**: `scraped_at`, `word_count`, `extraction_quality`
✅ **Complete metadata**: All required fields present with valid values

## Backward Compatibility

### Legacy Document Support
The system maintains full backward compatibility with existing David-specific document types:

```yaml
# Legacy format continues to work
---
title: "Samsung 3D Display Technology"
docType: "press-article"  # No persona field = defaults to 'david'
oem: "Samsung"
model: "Odyssey 3D"
leiaFeature: ["Eye Tracking", "Lenticular Lens"]
# ... other existing fields
---
```

### Migration Strategy
When migrating from single-persona to multi-persona:

1. **Automatic Migration**: Existing documents without `persona` field default to the original persona
2. **Gradual Migration**: New documents can specify `persona` field
3. **Metadata Preservation**: All existing metadata fields are preserved
4. **Template Compatibility**: Existing metadata templates continue to work

### Default Persona Behavior
```typescript
// System defaults
const DEFAULT_PERSONA = 'david'; // Maintains current behavior
const FALLBACK_DOCTYPE = 'url';  // For unknown types
```

## Migration and Updates

### Database Migration
When adding new personas or document types:
1. Update persona configuration files
2. Register new document types and templates
3. Run migration scripts for existing data (optional)
4. Update validation schemas

### Document Updates
When updating existing documents:
1. Preserve original metadata structure
2. Add new fields as needed
3. Update `scraped_at` timestamp
4. Maintain backward compatibility
5. Run metadata injection updates

### Performance Considerations
- **Index Compatibility**: New fields are indexed only when used
- **Search Performance**: Persona-specific boosts don't affect other personas
- **Memory Usage**: Unused persona configurations aren't loaded

## Implementation Guide

### System Configuration
```typescript
// config/personas.ts
export const PERSONA_CONFIG = {
  david: {
    name: "David's Technical Expertise",
    documentTypes: ['patent', 'paper', 'press-article', 'book', 'url', 'note'],
    defaultType: 'url',
    metadataTemplates: ['patent', 'paper', 'press-article', 'book', 'url']
  },
  legal: {
    name: "Legal Expert",
    documentTypes: ['legal-doc', 'case-law', 'statute', 'legal-brief', 'paper', 'book'],
    defaultType: 'legal-doc',
    metadataTemplates: ['legal', 'case-law', 'statute', 'paper']
  }
};
```

### Validation Pipeline
1. **Document Type Validation**: Check against persona's allowed types
2. **Field Validation**: Validate required/optional fields per persona
3. **Content Validation**: Ensure markdown structure
4. **Metadata Injection**: Apply appropriate templates
5. **Quality Assessment**: Persona-specific quality checks

This extensible format ensures optimal performance across different expert domains while maintaining full backward compatibility and providing a clear upgrade path for existing implementations.