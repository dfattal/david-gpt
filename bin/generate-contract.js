#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const crypto = require('crypto');

// Configuration
const PERSONA_DIR = process.argv[2];
const FUZZY_MODE = process.argv.includes('--fuzzy');
const FORCE_MODE = process.argv.includes('--force');

if (!PERSONA_DIR) {
  console.error('Usage: node generate-contract.js <persona-path> [--fuzzy] [--force]');
  console.error('Example: node generate-contract.js personas/david --fuzzy');
  process.exit(1);
}

const PERSONA_NAME = path.basename(PERSONA_DIR);
const PERSONA_FILE = path.join(PERSONA_DIR, 'Persona.md');
const CONSTRAINTS_FILE = path.join(PERSONA_DIR, 'constraints.yaml');
const CONTRACT_FILE = path.join(PERSONA_DIR, 'contract.yaml');
const GLOBAL_ENUMS_FILE = path.join(__dirname, '../schemas/enums.json');
const CONTRACT_TEMPLATE = path.join(__dirname, '../templates/contract.template.yaml');

// Utility functions
function generateHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function loadFile(filePath, required = true) {
  if (!fs.existsSync(filePath)) {
    if (required) {
      throw new Error(`Required file not found: ${filePath}`);
    }
    return null;
  }
  return fs.readFileSync(filePath, 'utf8');
}

function loadYamlFile(filePath, required = true) {
  const content = loadFile(filePath, required);
  if (!content) return null;

  try {
    return yaml.parse(content);
  } catch (err) {
    throw new Error(`Invalid YAML in ${filePath}: ${err.message}`);
  }
}

function loadJsonFile(filePath, required = true) {
  const content = loadFile(filePath, required);
  if (!content) return null;

  try {
    return JSON.parse(content);
  } catch (err) {
    throw new Error(`Invalid JSON in ${filePath}: ${err.message}`);
  }
}

// Contract generation functions
function buildDeterministicContract(personaContent, constraints, globalEnums) {
  const contract = {
    schema_version: 1,
    persona_name: PERSONA_NAME,
    provenance: {
      generated_by: 'deterministic',
      model: null,
      generated_at: new Date().toISOString(),
      inputs_hash: generateHash(personaContent + JSON.stringify(constraints))
    },
    global: {
      abstract_max_words: constraints.abstract_max_words || 200,
      metadata_chunk_max_chars: constraints.metadata_chunk_max_chars || 1200,
      content_chunk_min_chars: constraints.content_chunk_min_chars || 800,
      content_chunk_max_chars: constraints.content_chunk_max_chars || 2000,
      chunk_overlap_percentage: constraints.chunk_overlap_percentage || 15,
      require_document_url_if_available: constraints.require_document_url_if_available !== false
    },
    metadata: {
      identifiers: constraints.extra_identifiers || globalEnums.identifier_types.slice(0, 5),
      dates: globalEnums.date_types.slice(0, 5),
      actor_roles: globalEnums.actor_roles.slice(0, 5)
    },
    kg: {
      entity_kinds: constraints.kg_required_entities || globalEnums.entity_kinds.slice(0, 5),
      edge_types: buildEdgeTypes(constraints.kg_required_edges || globalEnums.edge_types.slice(0, 8), globalEnums)
    },
    doc_types: buildDocTypes(constraints.required_doc_types || globalEnums.doc_types.slice(0, 3), constraints.doctype_overrides || {}),
    vocab_hints: extractVocabHints(constraints)
  };

  return contract;
}

function buildEdgeTypes(edgeList, globalEnums) {
  const edgeTypes = [];

  // Define common edge type mappings
  const edgeMappings = {
    'develops': {
      src_kinds: ['organization', 'person'],
      dst_kinds: ['technology', 'product'],
      evidence_required: true
    },
    'uses_component': {
      src_kinds: ['organization', 'product', 'technology'],
      dst_kinds: ['component', 'technology'],
      evidence_required: true
    },
    'inventor_of': {
      src_kinds: ['person'],
      dst_kinds: ['technology', 'product', 'patent'],
      evidence_required: true
    },
    'authored_by': {
      src_kinds: ['paper', 'patent'],
      dst_kinds: ['person'],
      evidence_required: true
    },
    'affiliated_with': {
      src_kinds: ['person'],
      dst_kinds: ['organization'],
      evidence_required: false
    },
    'competes_with': {
      src_kinds: ['organization', 'product'],
      dst_kinds: ['organization', 'product'],
      evidence_required: false
    },
    'cites': {
      src_kinds: ['paper', 'patent'],
      dst_kinds: ['paper', 'patent'],
      evidence_required: true
    },
    'improves_upon': {
      src_kinds: ['technology', 'product'],
      dst_kinds: ['technology', 'product'],
      evidence_required: true
    }
  };

  edgeList.forEach(edgeType => {
    const mapping = edgeMappings[edgeType];
    if (mapping) {
      edgeTypes.push({
        type: edgeType,
        ...mapping
      });
    } else {
      // Default mapping for unknown edge types
      edgeTypes.push({
        type: edgeType,
        src_kinds: ['organization', 'person'],
        dst_kinds: ['technology', 'product'],
        evidence_required: true
      });
    }
  });

  return edgeTypes;
}

function normalizeDocType(docType) {
  // Map singular to plural forms to match global enums
  const mappings = {
    'patent': 'patents',
    'paper': 'papers',
    'press-article': 'press-articles',
    'book': 'books',
    'url': 'urls',
    'note': 'notes'
  };
  return mappings[docType] || docType;
}

function buildDocTypes(docTypeList, overrides) {
  const docTypes = {};

  // Define standard doc type structures
  const docTypeTemplates = {
    'papers': {
      required_frontmatter: {
        identifiers: ['doi'],
        dates: ['published_at'],
        actors: ['authors']
      },
      sections_order: ['abstract', 'methods', 'results', 'limitations', 'references'],
      metadata_section: 'abstract',
      notes: 'Academic papers and research documents'
    },
    'patents': {
      required_frontmatter: {
        identifiers: ['patent_number'],
        dates_any_of: ['filed_at', 'granted_at', 'priority_at'],
        actors_any_of: ['inventors', 'assignees']
      },
      sections_order: ['claim_summary', 'independent_claims', 'embodiments', 'prior_art'],
      metadata_section: 'claim_summary',
      must_include: ['full_claims'],
      notes: 'Patent documents with claims and technical descriptions'
    },
    'press-articles': {
      required_frontmatter: {
        dates: ['published_at'],
        actors: ['authors']
      },
      sections_order: ['summary', 'content', 'quotes', 'sources'],
      metadata_section: 'summary',
      notes: 'News articles and press releases'
    },
    'notes': {
      required_frontmatter: {
        dates: ['updated_at']
      },
      sections_order: ['summary', 'details', 'decisions', 'open_questions'],
      metadata_section: 'summary',
      notes: 'Personal notes and documentation'
    },
    'books': {
      required_frontmatter: {
        identifiers: ['isbn'],
        dates: ['published_at'],
        actors: ['authors']
      },
      sections_order: ['summary', 'key_concepts', 'chapters', 'conclusions'],
      metadata_section: 'summary',
      notes: 'Books and long-form publications'
    },
    'urls': {
      required_frontmatter: {
        identifiers: ['url'],
        dates: ['scraped_at']
      },
      sections_order: ['summary', 'content'],
      metadata_section: 'summary',
      notes: 'Web content and online resources'
    }
  };

  docTypeList.forEach(docType => {
    const normalizedType = normalizeDocType(docType);
    const template = docTypeTemplates[normalizedType];
    if (template) {
      // Apply any overrides from constraints (using original docType key for lookup)
      const override = overrides[docType] || {};
      docTypes[normalizedType] = {
        ...template,
        ...override
      };
    } else {
      // Create basic template for unknown doc types
      docTypes[normalizedType] = {
        required_frontmatter: {
          dates: ['updated_at']
        },
        sections_order: ['summary', 'content'],
        metadata_section: 'summary',
        notes: `Custom document type: ${normalizedType}`
      };
    }
  });

  return docTypes;
}

function extractVocabHints(constraints) {
  const hints = {
    technologies: [],
    oems: [],
    products: [],
    concepts: []
  };

  // Extract from entity patterns if available
  if (constraints.entity_patterns) {
    if (constraints.entity_patterns.technology) {
      hints.technologies = constraints.entity_patterns.technology;
    }
    if (constraints.entity_patterns.organization) {
      hints.oems = constraints.entity_patterns.organization;
    }
    if (constraints.entity_patterns.product) {
      hints.products = constraints.entity_patterns.product;
    }
  }

  // Extract from doctype overrides focus areas
  if (constraints.doctype_overrides) {
    Object.values(constraints.doctype_overrides).forEach(override => {
      if (override.focus_technologies) {
        hints.technologies.push(...override.focus_technologies);
      }
      if (override.focus_topics) {
        hints.oems.push(...override.focus_topics);
      }
      if (override.focus_areas) {
        hints.concepts.push(...override.focus_areas);
      }
    });
  }

  // Remove duplicates
  Object.keys(hints).forEach(key => {
    hints[key] = [...new Set(hints[key])];
  });

  return hints;
}

async function augmentWithGemini(contract, personaContent, constraints) {
  console.log('🤖 Augmenting contract with Gemini CLI...');

  const { spawn } = require('child_process');

  const systemPrompt = `You produce a strict persona CONTRACT enhancement in YAML.
You may ADD docTypes, entity_kinds, or edge_types ONLY if they are critical
for the persona's domain. Do not change global limits, formats, or naming
conventions. Prefer reusing existing enums. Provide concise vocab_hints.
Return ONLY the enhanced sections as valid YAML, not a full contract.`;

  const userPrompt = `Persona Content:
${personaContent.substring(0, 2000)}

Current Contract (partial):
${yaml.stringify(contract).substring(0, 1000)}

Goal: Suggest enhancements to:
1. vocab_hints (technologies, oems, products, concepts)
2. Additional doc_types if critical for this domain
3. Additional entity_kinds if missing key types
4. Additional edge_types if missing key relationships

Return ONLY enhanced sections in YAML format. Do not include full contract.`;

  return new Promise((resolve, reject) => {
    const gemini = spawn('gemini', ['-y', `${systemPrompt}\n\n${userPrompt}`]);
    let output = '';
    let error = '';

    gemini.stdout.on('data', (data) => {
      output += data.toString();
    });

    gemini.stderr.on('data', (data) => {
      error += data.toString();
    });

    gemini.on('close', (code) => {
      if (code !== 0) {
        console.warn(`⚠️ Gemini CLI failed (code ${code}): ${error}`);
        resolve(contract); // Return original contract on failure
        return;
      }

      try {
        const enhancements = yaml.parse(output);

        // Merge enhancements safely
        if (enhancements.vocab_hints) {
          Object.keys(enhancements.vocab_hints).forEach(key => {
            if (contract.vocab_hints[key]) {
              contract.vocab_hints[key] = [...new Set([
                ...contract.vocab_hints[key],
                ...enhancements.vocab_hints[key]
              ])];
            }
          });
        }

        // Add proposals for new items
        contract.proposals = {};

        if (enhancements.doc_types && Object.keys(enhancements.doc_types).length > 0) {
          contract.proposals.new_doc_types = Object.keys(enhancements.doc_types);
        }

        if (enhancements.entity_kinds) {
          const existing = new Set(contract.kg.entity_kinds);
          contract.proposals.new_entity_kinds = enhancements.entity_kinds.filter(k => !existing.has(k));
        }

        if (enhancements.edge_types) {
          const existing = new Set(contract.kg.edge_types.map(e => e.type));
          contract.proposals.new_edge_types = enhancements.edge_types
            .map(e => typeof e === 'string' ? e : e.type)
            .filter(k => !existing.has(k));
        }

        contract.provenance.generated_by = 'gemini-cli';
        contract.provenance.model = 'gemini-2.5-pro';

        console.log('✅ Contract enhanced with Gemini suggestions');
        resolve(contract);

      } catch (parseError) {
        console.warn(`⚠️ Failed to parse Gemini output: ${parseError.message}`);
        resolve(contract); // Return original on parse error
      }
    });
  });
}

// Main execution
async function main() {
  try {
    console.log(`🔄 Generating contract for persona: ${PERSONA_NAME}`);

    // Check if contract already exists and is up to date
    if (fs.existsSync(CONTRACT_FILE) && !FORCE_MODE) {
      const existingContract = loadYamlFile(CONTRACT_FILE);
      const currentInputsHash = generateHash(
        loadFile(PERSONA_FILE) + JSON.stringify(loadYamlFile(CONSTRAINTS_FILE))
      );

      if (existingContract.provenance && existingContract.provenance.inputs_hash === currentInputsHash) {
        console.log('✅ Contract is up to date (use --force to regenerate)');
        return existingContract;
      }
    }

    // Load inputs
    const personaContent = loadFile(PERSONA_FILE);
    const constraints = loadYamlFile(CONSTRAINTS_FILE);
    const globalEnums = loadJsonFile(GLOBAL_ENUMS_FILE);

    // Build deterministic contract
    let contract = buildDeterministicContract(personaContent, constraints, globalEnums);

    // Augment with Gemini if fuzzy mode
    if (FUZZY_MODE) {
      contract = await augmentWithGemini(contract, personaContent, constraints);
    }

    // Write contract
    const contractYaml = yaml.stringify(contract, {
      indent: 2,
      lineWidth: 0
    });

    fs.writeFileSync(CONTRACT_FILE, contractYaml);

    // Report results
    console.log(`\n✅ Contract generated: ${CONTRACT_FILE}`);
    console.log(`📋 Document types: ${Object.keys(contract.doc_types).length}`);
    console.log(`🏷️  Entity kinds: ${contract.kg.entity_kinds.length}`);
    console.log(`🔗 Edge types: ${contract.kg.edge_types.length}`);
    console.log(`💡 Vocab hints: ${Object.values(contract.vocab_hints).flat().length} total`);

    if (contract.proposals && Object.keys(contract.proposals).length > 0) {
      console.log(`\n🚨 New enum proposals (require approval):`);
      Object.entries(contract.proposals).forEach(([key, values]) => {
        if (values && values.length > 0) {
          console.log(`   ${key}: ${values.join(', ')}`);
        }
      });
      console.log(`   Use --accept-proposals to auto-approve (not implemented yet)`);
    }

    return contract;

  } catch (error) {
    console.error(`❌ Failed to generate contract: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, buildDeterministicContract };