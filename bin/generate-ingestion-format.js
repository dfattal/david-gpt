#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

// Configuration
const PERSONA_DIR = process.argv[2];
const FORCE_MODE = process.argv.includes('--force');

if (!PERSONA_DIR) {
  console.error('Usage: node generate-ingestion-format.js <persona-path> [--force]');
  console.error('Example: node generate-ingestion-format.js personas/david --force');
  process.exit(1);
}

const PERSONA_NAME = path.basename(PERSONA_DIR);
const CONTRACT_FILE = path.join(PERSONA_DIR, 'contract.yaml');
const INGESTION_FORMAT_FILE = path.join(PERSONA_DIR, 'ingestion-format.yaml');

// Utility functions
function loadYamlFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  try {
    return yaml.parse(content);
  } catch (err) {
    throw new Error(`Invalid YAML in ${filePath}: ${err.message}`);
  }
}

// Core ingestion format generation
function generateIngestionFormat(contract) {
  const format = {
    schema_version: 1,
    persona: contract.persona_name,
    generated_at: new Date().toISOString(),
    generated_from_contract: contract.provenance?.inputs_hash || 'unknown',

    // Global processing rules from contract
    global: {
      ...contract.global,
      validation_rules: {
        yaml_frontmatter_required: true,
        markdown_content_required: true,
        minimum_word_count: 50,
        require_title_as_h1: true
      }
    },

    // Document type specifications
    doc_types: {},

    // Format validation rules
    validation: {
      required_frontmatter_format: 'yaml',
      array_format_preference: 'inline', // ["item1", "item2"] preferred over block format
      forbidden_field_names: ['doc_type', 'author', 'authorsAffiliations', 'publication'], // Common mistakes
      date_formats: ['YYYY-MM-DD', 'YYYY-MM-DDTHH:mm:ss.sssZ'],
      content_structure_rules: {
        title_as_h1_required: true,
        proper_heading_hierarchy: true,
        no_empty_sections: true
      }
    },

    // Processing hints from contract vocabulary
    vocab_hints: contract.vocab_hints || {},

    // Metadata enhancement patterns
    metadata_enhancement: {
      entity_extraction: contract.kg?.entity_kinds || [],
      relationship_extraction: (contract.kg?.edge_types || []).map(edge => edge.type),
      auto_populate_fields: generateAutoPopulateRules(contract)
    }
  };

  // Generate format specifications for each document type in contract
  Object.entries(contract.doc_types || {}).forEach(([docType, docConfig]) => {
    format.doc_types[docType] = generateDocTypeFormat(docType, docConfig, contract);
  });

  return format;
}

function generateDocTypeFormat(docType, docConfig, contract) {
  // Base required fields for all documents
  const baseFields = {
    title: {
      type: 'string',
      required: true,
      description: 'Document title for search and display',
      example: '"Document Title"'
    },
    docType: {
      type: 'string',
      required: true,
      fixed_value: docType,
      description: `Must be exactly "${docType}"`,
      example: `"${docType}"`
    },
    url: {
      type: 'string',
      required: true,
      description: 'Source URL or file path',
      example: '"https://example.com/document"'
    },
    scraped_at: {
      type: 'string',
      format: 'iso_datetime',
      required: true,
      description: 'ISO timestamp of extraction',
      example: '"2025-01-18T20:30:00.000Z"'
    },
    word_count: {
      type: 'integer',
      required: true,
      description: 'Approximate word count of content',
      example: '1200'
    },
    extraction_quality: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
      required: true,
      description: 'Quality assessment of extraction',
      example: '"high"'
    }
  };

  // Document type specific fields
  const specificFields = generateSpecificFields(docType, docConfig);

  // Combine all fields
  const allFields = { ...baseFields, ...specificFields };

  // Generate sections order and content requirements
  const sectionsOrder = docConfig.sections_order || ['summary', 'content'];
  const contentRequirements = generateContentRequirements(docType, docConfig);

  return {
    description: docConfig.notes || `${docType} documents`,
    yaml_frontmatter: {
      required_fields: Object.fromEntries(
        Object.entries(allFields).filter(([, config]) => config.required)
      ),
      optional_fields: Object.fromEntries(
        Object.entries(allFields).filter(([, config]) => !config.required)
      )
    },
    content_structure: {
      sections_order: sectionsOrder,
      metadata_section: docConfig.metadata_section || 'summary',
      required_sections: docConfig.must_include || [],
      ...contentRequirements
    },
    validation_rules: generateValidationRules(docType, docConfig),
    example_frontmatter: generateExampleFrontmatter(docType, allFields)
  };
}

function generateSpecificFields(docType, docConfig) {
  const fields = {};

  switch (docType) {
    case 'patents':
      return {
        patentNo: {
          type: 'string',
          required: true,
          description: 'Primary patent number',
          example: '"US11,234,567"'
        },
        patentFamily: {
          type: 'array',
          format: 'inline',
          required: false,
          description: 'All family member patent numbers',
          example: '["US11234567", "WO2023123456", "EP1234567"]'
        },
        inventors: {
          type: 'array',
          format: 'inline',
          required: true,
          description: 'Inventor names',
          example: '["John Smith", "Jane Doe"]'
        },
        assignees: {
          type: 'array',
          format: 'inline',
          required: true,
          description: 'Current assignee(s)',
          example: '["Company Inc."]'
        },
        filedDate: {
          type: 'string',
          format: 'date',
          required: true,
          description: 'Filing date (YYYY-MM-DD)',
          example: '"2021-03-15"'
        },
        grantedDate: {
          type: 'string',
          format: 'date',
          required: false,
          description: 'Grant date (YYYY-MM-DD)',
          example: '"2023-06-20"'
        },
        priorityDate: {
          type: 'string',
          format: 'date',
          required: false,
          description: 'Priority date (YYYY-MM-DD)',
          example: '"2020-12-01"'
        }
      };

    case 'papers':
      return {
        authors: {
          type: 'object_array',
          format: 'block',
          required: true,
          description: 'Author names with affiliations',
          structure: {
            name: { type: 'string', required: true },
            affiliation: { type: 'string', required: false }
          },
          example: `authors:
  - name: "First Author"
    affiliation: "University of Example"
  - name: "Second Author"`
        },
        venue: {
          type: 'string',
          required: true,
          description: 'Journal or conference name',
          example: '"Nature Photonics"'
        },
        publicationYear: {
          type: 'integer',
          required: true,
          description: 'Publication year as integer',
          example: '2023'
        },
        doi: {
          type: 'string',
          required: false,
          description: 'DOI identifier',
          example: '"10.1038/s41566-023-12345-6"'
        },
        arxivId: {
          type: 'string',
          required: false,
          description: 'arXiv ID',
          example: '"2301.12345"'
        },
        abstract: {
          type: 'string',
          required: true,
          description: 'Paper abstract',
          example: '"Brief abstract text..."'
        },
        keywords: {
          type: 'array',
          format: 'inline',
          required: true,
          description: 'Research keywords',
          example: '["optics", "displays", "3D"]'
        },
        technologies: {
          type: 'array',
          format: 'inline',
          required: true,
          description: 'Technologies mentioned',
          example: '["Photonics", "ML", "CV"]'
        }
      };

    case 'press-articles':
      return {
        authors: {
          type: 'object_array',
          format: 'block',
          required: false,
          description: 'Article authors',
          structure: {
            name: { type: 'string', required: true }
          },
          example: `authors:
  - name: "Reporter Name"
  - name: "Co-Author"`
        },
        outlet: {
          type: 'string',
          required: true,
          description: 'Publication outlet',
          example: '"TechCrunch"'
        },
        published_date: {
          type: 'string',
          format: 'iso_datetime',
          required: true,
          description: 'Publication date',
          example: '"2025-01-15T00:00:00.000Z"'
        },
        oem: {
          type: 'string',
          required: false,
          description: 'Original Equipment Manufacturer',
          example: '"Samsung"'
        },
        model: {
          type: 'string',
          required: false,
          description: 'Product model',
          example: '"Odyssey 3D G90XF"'
        },
        keywords: {
          type: 'array',
          format: 'inline',
          required: false,
          description: 'Article keywords',
          example: '["gaming", "3D display"]'
        }
      };

    case 'notes':
      return {
        authors: {
          type: 'object_array',
          format: 'block',
          required: false,
          description: 'Note authors',
          structure: {
            name: { type: 'string', required: true }
          },
          example: `authors:
  - name: "David Fattal"`
        },
        updated_at: {
          type: 'string',
          format: 'iso_datetime',
          required: true,
          description: 'Last update timestamp',
          example: '"2025-01-18T20:30:00.000Z"'
        },
        keywords: {
          type: 'array',
          format: 'inline',
          required: false,
          description: 'Note keywords',
          example: '["research", "analysis"]'
        },
        technologies: {
          type: 'array',
          format: 'inline',
          required: false,
          description: 'Technologies mentioned',
          example: '["lightfield", "3D display"]'
        }
      };

    case 'urls':
      return {
        domain: {
          type: 'string',
          required: true,
          description: 'Source domain',
          example: '"example.com"'
        },
        authors: {
          type: 'object_array',
          format: 'block',
          required: false,
          description: 'Content authors',
          structure: {
            name: { type: 'string', required: true }
          },
          example: `authors:
  - name: "Author Name"`
        },
        published_date: {
          type: 'string',
          format: 'date',
          required: false,
          description: 'Publication date',
          example: '"2025-01-15"'
        },
        extraction_method: {
          type: 'string',
          enum: ['exa', 'gemini', 'manual'],
          required: true,
          description: 'Method used for extraction',
          example: '"exa"'
        }
      };

    case 'books':
      return {
        authors: {
          type: 'object_array',
          format: 'block',
          required: true,
          description: 'Book authors',
          structure: {
            name: { type: 'string', required: true },
            affiliation: { type: 'string', required: false }
          },
          example: `authors:
  - name: "Author Name"
    affiliation: "Institution"`
        },
        venue: {
          type: 'string',
          required: true,
          description: 'Publisher name',
          example: '"Publisher Name"'
        },
        publicationYear: {
          type: 'integer',
          required: true,
          description: 'Publication year',
          example: '2023'
        },
        isbn: {
          type: 'string',
          required: false,
          description: 'ISBN identifier',
          example: '"978-0123456789"'
        },
        chapter: {
          type: 'string',
          required: false,
          description: 'Specific chapter if applicable',
          example: '"Chapter 5: Advanced Topics"'
        }
      };

    default:
      return {
        keywords: {
          type: 'array',
          format: 'inline',
          required: false,
          description: 'Document keywords',
          example: '["keyword1", "keyword2"]'
        }
      };
  }
}

function generateContentRequirements(docType, docConfig) {
  const baseRequirements = {
    title_as_h1: true,
    proper_heading_hierarchy: true,
    minimum_sections: 2
  };

  switch (docType) {
    case 'patents':
      return {
        ...baseRequirements,
        required_sections: ['Abstract', 'Claims'],
        claims_verbatim_required: true,
        minimum_word_count: 1000,
        special_requirements: [
          'All patent claims must be extracted verbatim',
          'Claims section must be numbered (1., 2., etc.)',
          'Include complete background and detailed description',
          'Preserve all technical terminology and legal language'
        ]
      };

    case 'papers':
      return {
        ...baseRequirements,
        required_sections: ['Abstract', 'Introduction', 'Methods', 'Results', 'Conclusions'],
        minimum_word_count: 500,
        special_requirements: [
          'Abstract must be complete and comprehensive',
          'Include complete methodology and results',
          'Preserve mathematical notation and technical details',
          'Include references section if available'
        ]
      };

    case 'press-articles':
      return {
        ...baseRequirements,
        required_sections: ['Summary'],
        minimum_word_count: 200,
        special_requirements: [
          'Extract OEM and product information where applicable',
          'Include publication date and author information',
          'Preserve quotes and source attribution'
        ]
      };

    default:
      return baseRequirements;
  }
}

function generateValidationRules(docType, docConfig) {
  const baseRules = {
    yaml_frontmatter_valid: true,
    required_fields_present: true,
    no_empty_required_fields: true,
    proper_array_format: true
  };

  // Add document-specific validation rules
  if (docType === 'patents') {
    baseRules.claims_section_present = true;
    baseRules.claims_not_placeholder = true;
    baseRules.patent_number_format = true;
  }

  if (docType === 'papers') {
    baseRules.authors_structured_format = true;
    baseRules.publication_year_integer = true;
    baseRules.abstract_present = true;
  }

  return baseRules;
}

function generateExampleFrontmatter(docType, fields) {
  const example = ['---'];

  // Add required fields first
  Object.entries(fields).forEach(([fieldName, fieldConfig]) => {
    if (fieldConfig.required) {
      if (fieldConfig.type === 'object_array') {
        example.push(`${fieldName}:`);
        example.push(`  - name: "Example Name"`);
        if (fieldConfig.structure?.affiliation) {
          example.push(`    affiliation: "Example Institution"`);
        }
      } else {
        example.push(`${fieldName}: ${fieldConfig.example || `"example_${fieldName}"`}`);
      }
    }
  });

  // Add some optional fields as examples
  Object.entries(fields).slice(0, 3).forEach(([fieldName, fieldConfig]) => {
    if (!fieldConfig.required) {
      if (fieldConfig.type === 'array') {
        example.push(`${fieldName}: ${fieldConfig.example || '["item1", "item2"]'}`);
      } else if (fieldConfig.type !== 'object_array') {
        example.push(`${fieldName}: ${fieldConfig.example || `"example_${fieldName}"`}`);
      }
    }
  });

  example.push('---');
  return example.join('\n');
}

function generateAutoPopulateRules(contract) {
  const rules = [];

  if (contract.vocab_hints) {
    if (contract.vocab_hints.technologies) {
      rules.push({
        field: 'technologies',
        source: 'content_matching',
        patterns: contract.vocab_hints.technologies,
        confidence_threshold: 0.7
      });
    }

    if (contract.vocab_hints.oems) {
      rules.push({
        field: 'oem',
        source: 'content_matching',
        patterns: contract.vocab_hints.oems,
        confidence_threshold: 0.8
      });
    }
  }

  return rules;
}

// Main execution
function main() {
  console.log(`🔄 Generating ingestion format for persona: ${PERSONA_NAME}`);

  // Check if ingestion format already exists
  if (fs.existsSync(INGESTION_FORMAT_FILE) && !FORCE_MODE) {
    console.log('✅ Ingestion format already exists (use --force to regenerate)');
    const existing = loadYamlFile(INGESTION_FORMAT_FILE);
    console.log(`📋 Document types: ${Object.keys(existing.doc_types || {}).length}`);
    return existing;
  }

  // Load contract
  const contract = loadYamlFile(CONTRACT_FILE);
  console.log(`✅ Loaded contract: ${Object.keys(contract.doc_types || {}).length} doc types`);

  // Generate ingestion format
  const ingestionFormat = generateIngestionFormat(contract);

  // Write ingestion format
  const formatYaml = yaml.stringify(ingestionFormat, {
    indent: 2,
    lineWidth: 0
  });

  fs.writeFileSync(INGESTION_FORMAT_FILE, formatYaml);

  // Report results
  console.log(`\n✅ Ingestion format generated: ${INGESTION_FORMAT_FILE}`);
  console.log(`📋 Document types: ${Object.keys(ingestionFormat.doc_types).length}`);
  console.log(`🎯 Supported formats: ${Object.keys(ingestionFormat.doc_types).join(', ')}`);
  console.log(`📝 Vocab hints: ${Object.values(ingestionFormat.vocab_hints).flat().length} total`);

  Object.entries(ingestionFormat.doc_types).forEach(([docType, config]) => {
    const requiredFields = Object.keys(config.yaml_frontmatter.required_fields).length;
    const optionalFields = Object.keys(config.yaml_frontmatter.optional_fields).length;
    console.log(`   ${docType}: ${requiredFields} required + ${optionalFields} optional fields`);
  });

  return ingestionFormat;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`❌ Failed to generate ingestion format: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { main, generateIngestionFormat };