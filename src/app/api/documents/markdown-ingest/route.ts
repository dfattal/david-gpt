import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AppError, handleApiError } from '@/lib/utils';
import {
  DocumentFormatValidator,
  type ValidationResult,
} from '@/lib/validation/document-format-validator';
import {
  unifiedIngestionService,
  type SingleIngestionRequest,
} from '@/lib/rag/ingestion-service';
import type { DocumentType } from '@/lib/rag/types';

/**
 * Markdown-First Document Ingestion API
 *
 * Accepts single markdown files with YAML frontmatter validation.
 * Provides detailed validation feedback and suggestions for format improvements.
 * Replaces legacy ingestion methods with a standardized markdown-first approach.
 */
export async function POST(req: NextRequest) {
  try {
    // Check for service role bypass (for testing only)
    const authHeader = req.headers.get('Authorization');
    const isServiceRoleRequest = authHeader?.includes(
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let supabase;
    let user;

    if (isServiceRoleRequest) {
      // Use admin client for service role requests
      const { createOptimizedAdminClient } = await import(
        '@/lib/supabase/server'
      );
      supabase = createOptimizedAdminClient();
      user = {
        id: 'b349bd11-bd69-4582-9713-3ada0ba58fcf',
        email: 'dfattal@gmail.com',
      };
      console.log(
        '🔑 Using service role authentication for markdown ingestion'
      );
    } else {
      // Standard authentication
      supabase = await createClient();
      const {
        data: { user: authUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !authUser) {
        throw new AppError('Authentication required', 401);
      }
      user = authUser;
    }

    const contentType = req.headers.get('content-type') || '';
    let body: any;
    let markdownContent: string | null = null;
    let fileName: string | undefined;

    if (contentType.includes('multipart/form-data')) {
      // Handle FormData (file upload)
      const formData = await req.formData();

      // Extract markdown file if present
      const file = formData.get('file') as File | null;
      if (file) {
        if (!file.name.endsWith('.md') && !file.name.endsWith('.markdown')) {
          throw new AppError(
            'Only markdown files (.md, .markdown) are accepted',
            400
          );
        }

        const arrayBuffer = await file.arrayBuffer();
        markdownContent = Buffer.from(arrayBuffer).toString('utf-8');
        fileName = file.name;
      }

      // Extract other form fields
      body = {
        content: (formData.get('content') as string) || markdownContent,
        validateOnly: formData.get('validateOnly') === 'true',
        strictValidation: formData.get('strictValidation') === 'true',
      };
    } else {
      // Handle JSON request
      body = await req.json();
      markdownContent = body.content;
      fileName = body.fileName;
    }

    const { content, validateOnly = false, strictValidation = false } = body;

    // Validation
    if (!content && !markdownContent) {
      throw new AppError(
        'Markdown content is required (either as content field or file upload)',
        400
      );
    }

    const finalContent = content || markdownContent;
    if (!finalContent) {
      throw new AppError('No markdown content provided', 400);
    }

    console.log(`📝 Processing markdown document ingestion:`, {
      fileName,
      contentLength: finalContent.length,
      validateOnly,
      strictValidation,
    });

    // Comprehensive validation
    const validation = DocumentFormatValidator.validateDocument(
      finalContent,
      fileName
    );

    // For validation-only requests, return validation results
    if (validateOnly) {
      return NextResponse.json(
        {
          validation,
          message: validation.isValid
            ? 'Document format is valid and ready for ingestion'
            : 'Document has validation issues that need to be addressed',
        },
        {
          status: validation.isValid ? 200 : 400,
        }
      );
    }

    // Check if validation meets requirements
    if (!validation.isValid) {
      const errorMessage = `Document validation failed. ${validation.errors.length} errors found.`;

      return NextResponse.json(
        {
          error: errorMessage,
          validation,
          canProceed: false,
          suggestion:
            'Fix validation errors and try again, or use validateOnly=true to preview issues',
        },
        { status: 400 }
      );
    }

    // For strict validation, also check warnings
    if (strictValidation && validation.warnings.length > 0) {
      return NextResponse.json(
        {
          error: `Strict validation failed. ${validation.warnings.length} warnings found.`,
          validation,
          canProceed: false,
          suggestion:
            'Address warnings for optimal document quality, or disable strictValidation',
        },
        { status: 400 }
      );
    }

    // Extract metadata from frontmatter for processing
    const { frontmatter } = parseFrontmatter(finalContent);

    if (!frontmatter.title || !frontmatter.docType) {
      throw new AppError(
        'Document must have title and docType in frontmatter',
        400
      );
    }

    // Create ingestion request with validated content
    const ingestionRequest: SingleIngestionRequest = {
      type: 'single',
      title: frontmatter.title,
      content: finalContent,
      docType: frontmatter.docType as DocumentType,
      metadata: {
        sourceType: 'markdown-upload',
        fileName: fileName,
        validationScore: validation.qualityScore,
        validationWarnings: validation.warnings.length,
        ...frontmatter,
      },
      userId: user.id,
    };

    // Process through unified ingestion service
    const result = await unifiedIngestionService.ingestDocuments(
      ingestionRequest,
      { supabase, user }
    );

    if (!result.success) {
      throw new AppError(result.error || 'Markdown ingestion failed', 500);
    }

    return NextResponse.json(
      {
        documentId: result.documentId,
        jobId: result.jobId,
        message: result.message,
        validation: {
          qualityScore: validation.qualityScore,
          warningsCount: validation.warnings.length,
          suggestionsCount: validation.suggestions.length,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET endpoint for validation schema information
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const docType = searchParams.get('docType');
    const action = searchParams.get('action');

    if (action === 'supported-types') {
      return NextResponse.json({
        supportedTypes: DocumentFormatValidator.getSupportedDocTypes(),
        message: 'List of supported document types for markdown ingestion',
      });
    }

    if (action === 'required-fields' && docType) {
      const requiredFields = DocumentFormatValidator.getRequiredFields(docType);
      const schema = DocumentFormatValidator.getSchemaForDocType(docType);

      return NextResponse.json({
        docType,
        requiredFields,
        schemaAvailable: !!schema,
        message: `Required fields for document type: ${docType}`,
      });
    }

    if (action === 'validate-example' && docType) {
      // Generate example markdown with proper frontmatter for the document type
      const example = generateExampleMarkdown(docType);
      const validation = DocumentFormatValidator.validateDocument(example);

      return NextResponse.json({
        docType,
        exampleMarkdown: example,
        validation,
        message: `Example markdown document for type: ${docType}`,
      });
    }

    // Default: return API information
    return NextResponse.json({
      endpoint: '/api/documents/markdown-ingest',
      methods: ['POST', 'GET'],
      description:
        'Markdown-first document ingestion with comprehensive validation',
      usage: {
        POST: {
          contentTypes: ['application/json', 'multipart/form-data'],
          requiredFields: ['content'],
          optionalFields: ['validateOnly', 'strictValidation', 'fileName'],
          example: {
            content:
              '---\\ntitle: "Example Document"\\ndocType: "note"\\n...\\n---\\n\\n# Content here',
          },
        },
        GET: {
          queryParams: {
            action: ['supported-types', 'required-fields', 'validate-example'],
            docType:
              'Required for required-fields and validate-example actions',
          },
        },
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Parse frontmatter from markdown content
 */
function parseFrontmatter(content: string): {
  frontmatter: any;
  content: string;
  hasFrontmatter: boolean;
} {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return {
      frontmatter: {},
      content: content,
      hasFrontmatter: false,
    };
  }

  try {
    const yaml = require('js-yaml');
    const frontmatter = yaml.load(match[1]) as any;
    return {
      frontmatter: frontmatter || {},
      content: match[2],
      hasFrontmatter: true,
    };
  } catch (error) {
    throw new Error(
      `Invalid YAML frontmatter: ${error instanceof Error ? error.message : 'Parse error'}`
    );
  }
}

/**
 * Generate example markdown for document types
 */
function generateExampleMarkdown(docType: string): string {
  const timestamp = new Date().toISOString();

  const examples = {
    note: `---
title: "Example Personal Note"
docType: "note"
persona: "david"
scraped_at: "${timestamp}"
word_count: 150
extraction_quality: "high"
---

# Example Personal Note

This is an example of a personal note document. It contains thoughts, observations, or documentation that doesn't fit into other categories.

## Key Points

- Simple structure with clear headings
- Minimal metadata requirements
- Suitable for personal documentation

The note format is the simplest document type in the system.`,

    paper: `---
title: "Example Research Paper Title"
docType: "paper"
persona: "david"
scraped_at: "${timestamp}"
word_count: 2500
extraction_quality: "high"
authorsAffiliations:
  - name: "Dr. Sarah Chen"
    affiliation: "MIT"
  - name: "Prof. John Smith"
    affiliation: "Stanford University"
venue: "Journal of Advanced AI"
publicationYear: 2024
doi: "10.1000/example.2024.12345"
abstract: "This paper presents novel findings in the field of artificial intelligence..."
keywords: ["artificial intelligence", "machine learning", "neural networks"]
---

# Example Research Paper Title

## Abstract

This paper presents novel findings in the field of artificial intelligence, demonstrating significant improvements in neural network architectures.

## Introduction

The field of AI has seen remarkable progress...

## Methodology

Our approach involves...

## Results

The experimental results show...

## Conclusion

In conclusion, this work contributes...`,

    patent: `---
title: "System and Method for Advanced Display Technology"
docType: "patent"
persona: "david"
scraped_at: "${timestamp}"
word_count: 5000
extraction_quality: "high"
patentNo: "US1234567A1"
inventors: ["David Fattal", "Jane Inventor"]
assignees: ["Leia Inc."]
filedDate: "2024-01-15"
grantedDate: "2024-06-20"
patentFamily: ["EP1234567A1", "JP1234567A1"]
---

# System and Method for Advanced Display Technology

## Abstract

The present invention relates to a system and method for implementing advanced display technology that enables three-dimensional visual experiences.

## Field of the Invention

This invention relates generally to display technologies...

## Background

Traditional display systems have limitations...

## Summary of the Invention

The present invention provides a novel approach...

## Detailed Description

Referring to Figure 1, the system comprises...`,
  };

  return examples[docType as keyof typeof examples] || examples.note;
}
