/**
 * Technical Document Entity and Relationship Extractor
 *
 * Specialized extractor for technical FAQs, specifications, and documentation.
 * Optimized for capturing domain-specific technical components, software features,
 * and technical processes with semantic + lexical consolidation.
 */

import type {
  Entity,
  EntityKind,
  KnowledgeEdge,
  RelationType,
  DocumentMetadata,
} from './types';
import OpenAI from 'openai';

// =======================
// Technical Entity Patterns
// =======================

// Leia Hardware Technologies - Critical patterns that were missed
const LEIA_HARDWARE_PATTERNS = [
  // Core display technologies
  /\b(?:Diffractive\s+Lightfield\s+Backlight|DLB)\b/gi,
  /\b(?:switchable\s+Liquid\s+Crystal(?:\s+\(?LC\)?\s+lens)?|LC\s+lens(?:\s+technology)?|3D\s+Cell)\b/gi,
  /\b(?:nanoimprinted\s+diffractive\s+elements|diffractive\s+elements)\b/gi,
  /\b(?:dual\s+illumination\s+systems|backlight\s+systems)\b/gi,

  // Optical components and properties
  /\b(?:lightfield\s+experience|true\s+lightfield|holographic\s+element)\b/gi,
  /\b(?:optical\s+efficiency|transmission\s+rate|brightness\s+loss)\b/gi,
  /\b(?:wavelength[-\s]specific\s+diffraction|color\s+uniformity)\b/gi,
  /\b(?:crosstalk\s+levels?|crosstalk\s+mitigation|cross[-\s]talk)\b/gi,

  // Display compatibility
  /\b(?:LCD[-\s]only|OLED\s+compatible|microLED\s+compatible)\b/gi,
  /\b(?:base\s+display|display\s+types?|switchable\s+LC\s+optical\s+layer)\b/gi,
];

// Leia Software/Runtime Features - Critical missing patterns
const LEIA_SOFTWARE_PATTERNS = [
  // Core runtime features
  /\b(?:Stereo\s+View\s+Mapping|View\s+Mapping\s+algorithm)\b/gi,
  /\b(?:Late\s+Latching|latency\s+reduction\s+technique)\b/gi,
  /\b(?:Windowed\s+Weaving|windowed\s+mode\s+3D)\b/gi,
  /\b(?:Multi[-\s]Screen\s+Mixed\s+2D[\/\\]3D|heterogeneous\s+displays)\b/gi,
  /\b(?:Display\s+Runtime[\/\\]?SDK|Leia\s+Runtime)\b/gi,

  // Calibration and tracking
  /\b(?:Advanced\s+Calibration|factory[-\s]calibrated|end[-\s]of[-\s]line\s+tool)\b/gi,
  /\b(?:lens\s+alignment|mechanical\s+deformation|lens\s+spacing)\b/gi,
  /\b(?:tracking\s+camera\s+alignment|stereo\s+weaving)\b/gi,
  /\b(?:crosstalk\s+maps|static\s+crosstalk|dynamic\s+crosstalk)\b/gi,

  // Head/eye tracking features
  /\b(?:head\s+tracking|eye\s+tracking|predictive\s+tracking)\b/gi,
  /\b(?:real[-\s]time\s+head\s+tracking|motion\s+prediction)\b/gi,
  /\b(?:viewing\s+angles|head\s+position|eye\s+positions?)\b/gi,
];

// Technical Processes and Methodologies
const TECHNICAL_PROCESS_PATTERNS = [
  // Calibration processes
  /\b(?:calibration\s+data|calibration\s+process|joint\s+calibration)\b/gi,
  /\b(?:factory\s+calibration|end[-\s]of[-\s]line\s+calibration)\b/gi,
  /\b(?:lens\s+alignment\s+calibration|camera\s+calibration)\b/gi,

  // Rendering and processing
  /\b(?:stereo\s+rendering|3D\s+rendering|view\s+synthesis)\b/gi,
  /\b(?:subpixel\s+assignment|left[\/\\]right\s+view\s+assignment)\b/gi,
  /\b(?:dynamic\s+re[-\s]rendering|real[-\s]time\s+adaptation)\b/gi,

  // Quality and performance metrics
  /\b(?:immersion\s+quality|viewing\s+experience|3D\s+effect)\b/gi,
  /\b(?:latency\s+reduction|frame\s+buffering|scan[-\s]out)\b/gi,
  /\b(?:application[-\s]induced\s+latency|freshest\s+tracking\s+data)\b/gi,
];

// Hardware Components and Specifications
const HARDWARE_COMPONENT_PATTERNS = [
  // Camera specifications
  /\b(?:\d+p\s+resolution|720p|480p|1080p|4K\s+resolution)\b/gi,
  /\b(?:\d+\s*fps|frame\s+rate|≥\d+\s*fps|60\s*fps|90[-\s]120\s*fps)\b/gi,
  /\b(?:\d+mm\s+baseline|baseline\s+distance|stereo\s+baseline)\b/gi,
  /\b(?:≥\d+°\s+horizontal|FOV|field\s+of\s+view|horizontal\s+FOV)\b/gi,
  /\b(?:monochrome\s+camera|RGB\s+camera|color\s+camera)\b/gi,

  // Display specifications
  /\b(?:2D↔3D\s+switching|switching\s+speed|microseconds)\b/gi,
  /\b(?:~\d+%\s+transmission|optical\s+transmission|brightness\s+preservation)\b/gi,
  /\b(?:<\d+%\s+crosstalk|crosstalk\s+levels?|production\s+crosstalk)\b/gi,
  /\b(?:full\s+2D\s+resolution|half\s+resolution\s+3D|resolution\s+tradeoff)\b/gi,

  // Technical measurements
  /\b(?:\d+\s*rad[\/\\]s²|angular\s+velocity|head\s+movement\s+speed)\b/gi,
  /\b(?:viewing\s+distances?|shorter\s+distances?|farther\s+distances?)\b/gi,
];

// Software Architecture and APIs
const SOFTWARE_ARCHITECTURE_PATTERNS = [
  // Graphics APIs and frameworks
  /\b(?:DX11|DX12|DirectX|OpenGL|Vulkan)\b/gi,
  /\b(?:stereo\s+rendering\s+pipelines?|graphics\s+pipelines?)\b/gi,
  /\b(?:application\s+buffering|frame\s+buffering|stable\s+FPS)\b/gi,

  // Integration patterns
  /\b(?:intimate\s+knowledge|lens\s+design\s+knowledge)\b/gi,
  /\b(?:operating\s+systems?|window\s+caching|window\s+dragging)\b/gi,
  /\b(?:seamless\s+work|mixed\s+display\s+setups)\b/gi,

  // Privacy and security
  /\b(?:on[-\s]chip\s+computation|ASIC\s+eye[-\s]position)\b/gi,
  /\b(?:raw\s+camera\s+feed|anonymized\s+data|privacy\s+protection)\b/gi,
  /\b(?:dedicated\s+chip|system\s+compatibility)\b/gi,
];

// FAQ-Specific Patterns for Questions and Definitions
const FAQ_STRUCTURE_PATTERNS = [
  // Question patterns
  /(?:^|\n)#{1,6}\s*(?:What|How|Why|When|Where|Which)\s+[^?\n]*\??\s*$/gim,
  /(?:^|\n)\*\*Q(?:uestion)?:?\*\*\s+([^?\n]+\??)/gim,
  /(?:^|\n)Q:?\s+([^?\n]+\??)/gim,

  // Answer patterns with technical definitions
  /(?:^|\n)\*\*A(?:nswer)?:?\*\*\s+([^.\n]+(?:\.|$))/gim,
  /(?:^|\n)A:?\s+([^.\n]+(?:\.|$))/gim,

  // Definition patterns
  /\b([A-Z][A-Za-z\s]+)\s+is\s+(?:a|an|the)\s+([^.]+\.)/gi,
  /\b([A-Z][A-Za-z\s]+):\s+([^.\n]+\.)/gi,
];

// =======================
// Technical Relationship Patterns
// =======================

const TECHNICAL_RELATIONSHIP_PATTERNS = {
  // Technology implements/uses component
  implements: [
    /(DLB|Diffractive\s+Lightfield\s+Backlight)\s+(?:uses|incorporates|features)\s+(nanoimprinted\s+diffractive\s+elements|diffractive\s+elements)/gi,
    /(LC\s+lens|switchable\s+Liquid\s+Crystal)\s+(?:sits\s+on\s+top\s+of|works\s+with)\s+(LCD|OLED|microLED|base\s+display)/gi,
    /(Stereo\s+View\s+Mapping)\s+(?:combines|uses|leverages)\s+(head\s+position|calibration\s+data|3D\s+content)/gi,
    /(Late\s+Latching)\s+(?:eliminates|reduces)\s+(application[-\s]induced\s+latency|latency)/gi,
  ],

  // Component enables feature
  enables: [
    /(head\s+tracking|eye\s+tracking)\s+(?:enables|provides|ensures)\s+(correct\s+view\s+delivery|immersion|crosstalk\s+minimization)/gi,
    /(Advanced\s+Calibration)\s+(?:enables|provides|ensures)\s+(near[-\s]perfect\s+3D|sharp\s+image|consistent\s+quality)/gi,
    /(factory\s+calibration|end[-\s]of[-\s]line\s+tool)\s+(?:calibrates|aligns)\s+(tracking\s+camera|3D\s+cell|display\s+alignment)/gi,
  ],

  // Technology has property/characteristic
  has_property: [
    /(DLB|Diffractive\s+Lightfield\s+Backlight)\s+(?:has|provides|offers)\s+(ultra[-\s]fast\s+switching|true\s+lightfield\s+experience)/gi,
    /(LC\s+lens|switchable\s+Liquid\s+Crystal)\s+(?:has|provides|offers)\s+(~98%\s+transmission|near[-\s]lossless\s+quality)/gi,
    /(crosstalk\s+levels?)\s+(?:are|measure)\s+(<2%|extremely\s+low|minimal)/gi,
  ],

  // Device uses technology
  uses_technology: [
    /(Samsung\s+Odyssey\s+3D|ZTE\s+Nubia\s+Pad|Acer\s+SpatialLabs)\s+(?:uses|features|incorporates|powers)\s+(Leia\s+technology|switchable\s+LC\s+lens|3D\s+Cell)/gi,
    /(laptops|monitors|mobile\s+devices)\s+(?:use|feature|incorporate)\s+(stereo\s+tracking|mono\s+tracking|head\s+tracking)/gi,
  ],

  // Process involves component
  process_involves: [
    /(calibration\s+process)\s+(?:involves|includes|uses)\s+(lens\s+alignment|mechanical\s+deformation|crosstalk\s+mapping)/gi,
    /(stereo\s+weaving)\s+(?:happens|occurs)\s+(?:before|after|during)\s+(buffering|scan[-\s]out|frame\s+processing)/gi,
  ],
};

// =======================
// Entity Cleaning and Validation
// =======================

/**
 * Clean entity name from artifacts and malformed content
 */
function cleanEntityName(rawName: string): string {
  if (!rawName) return '';

  let cleaned = rawName.trim();

  // Remove markdown artifacts
  cleaned = cleaned.replace(/^#{1,6}\s*/, ''); // Remove markdown headers
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1'); // Remove bold formatting
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1'); // Remove code formatting

  // Remove FAQ artifacts
  cleaned = cleaned.replace(/^[QA]:\s*/, ''); // Remove Q: A: prefixes
  cleaned = cleaned.replace(/^\*\*[QA](?:uestion|nswer)?:?\*\*\s*/, ''); // Remove **Q:** **A:**

  // Remove incomplete sentences and fragments
  cleaned = cleaned.replace(
    /^(?:What|How|Why|When|Where|Which)\s+.*?\?.*$/,
    ''
  ); // Remove question fragments
  cleaned = cleaned.replace(/^A:\*\*.*$/, ''); // Remove answer fragments
  cleaned = cleaned.replace(/^.*?(?:includes?|supports?|features?)\s+/, ''); // Remove leading descriptive text

  // Remove special characters but keep important technical ones
  cleaned = cleaned.replace(/[^\w\s\-\(\)\/\\\.%°]/g, ' ');

  // Clean up whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Remove trailing incomplete words
  cleaned = cleaned.replace(/\s+\w{1,2}$/, ''); // Remove 1-2 char trailing words

  return cleaned;
}

/**
 * Pre-filter to remove obvious specifications and generic terms before LLM
 */
function preFilterSpecifications(name: string): boolean {
  const lowerName = name.toLowerCase();

  // Technical specifications (frame rates, resolutions, etc.)
  if (/^\d+\s*(fps|hz|p|k|mhz|ghz)$/i.test(lowerName)) return false;
  if (
    /^(frame\s+rate|refresh\s+rate|resolution|fov|field\s+of\s+view)$/i.test(
      lowerName
    )
  )
    return false;
  if (/^\d+[-–]\d+\s*(fps|hz)$/i.test(lowerName)) return false; // ranges like "90-120 fps"

  // Generic API names without context
  if (/^(dx11|dx12|directx|opengl|vulkan|metal)$/i.test(lowerName))
    return false;

  // Performance metrics
  if (
    /^(stable\s+fps|latency|transmission\s+rate|brightness\s+loss)$/i.test(
      lowerName
    )
  )
    return false;

  // Vague concepts
  if (
    /^(3d\s+effect|immersion|viewing\s+experience|experience)$/i.test(lowerName)
  )
    return false;

  // Generic measurements
  if (
    /^\d+\s*(mm|cm|inches?|°|degrees?|microseconds?|milliseconds?)$/i.test(
      lowerName
    )
  )
    return false;

  // Generic technical terms without Leia context
  if (
    /^(calibration\s+data|3d\s+rendering|stereo\s+rendering|calibration)$/i.test(
      lowerName
    )
  )
    return false;

  return true;
}

/**
 * Validate if cleaned entity name is worth keeping
 */
function isValidEntity(name: string): boolean {
  if (!name || name.length < 3 || name.length > 80) return false;

  // Pre-filter obvious specifications
  if (!preFilterSpecifications(name)) return false;

  // Reject common stop words and non-entities
  const stopWords = [
    'the',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'what',
    'how',
    'why',
    'when',
    'where',
    'which',
    'this',
    'that',
    'these',
    'those',
    'some',
    'any',
    'all',
    'most',
    'many',
    'few',
    'much',
    'more',
    'less',
    'other',
  ];

  const lowerName = name.toLowerCase();
  if (stopWords.includes(lowerName)) return false;

  // Reject pure numeric or mostly punctuation
  if (/^\d+$/.test(name)) return false;
  if (!/[a-zA-Z]/.test(name)) return false;

  // Reject if starts with common question/answer words
  if (/^(what|how|why|when|where|which|our|some|many|this)\s/i.test(name))
    return false;

  // Reject incomplete technical fragments
  if (/^(a\*\*|the\s+\w{1,3}$|and\s+|or\s+)/i.test(name)) return false;

  // Must have at least one meaningful word (3+ chars)
  const words = name.split(/\s+/);
  const meaningfulWords = words.filter(w => w.length >= 3 && !/^\d+$/.test(w));
  if (meaningfulWords.length === 0) return false;

  return true;
}

/**
 * Verify entity has Leia-specific context and is not generic
 */
function isLeiaSpecific(name: string, kind: EntityKind): boolean {
  const lowerName = name.toLowerCase();

  // Known Leia-specific terms are always valid
  const leiaSpecificTerms = [
    'late latching',
    'windowed weaving',
    'stereo view mapping',
    'advanced calibration',
    '3d cell',
    'dlb',
    'diffractive lightfield backlight',
    'lc lens',
    'switchable liquid crystal',
    'display runtime',
    'leia runtime',
    'crosstalk mitigation',
    'tracking camera alignment',
    'stereo weaving',
    'predictive tracking',
    'asic eye-position',
    'end-of-line tool',
  ];

  for (const term of leiaSpecificTerms) {
    if (lowerName.includes(term) || term.includes(lowerName)) {
      return true;
    }
  }

  // Product names with known OEMs are valid
  if (kind === 'product') {
    const oemProducts = ['samsung odyssey', 'zte nubia', 'acer spatiallabs'];
    for (const product of oemProducts) {
      if (lowerName.includes(product)) return true;
    }
  }

  // Generic terms that require more context
  const genericTerms = [
    'head tracking',
    'eye tracking',
    'calibration',
    '3d rendering',
    'stereo rendering',
    'frame rate',
    'latency',
    'transmission',
    'brightness',
    'optical',
    'mechanical',
  ];

  for (const generic of genericTerms) {
    if (lowerName === generic) {
      return false; // Too generic without Leia context
    }
  }

  // If not generic and not obviously invalid, assume it's valid
  // (this catches new Leia-specific terms we haven't seen before)
  return true;
}

// =======================
// LLM-Based Entity Cleaning
// =======================

/**
 * Use LLM to validate and clean technical entities
 */
async function cleanEntitiesWithLLM(
  rawEntities: Array<{
    name: string;
    kind: EntityKind;
    context: string;
    mentionCount: number;
  }>,
  documentContext: string
): Promise<
  Array<{
    name: string;
    kind: EntityKind;
    isValid: boolean;
    cleanedName?: string;
  }>
> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️ OpenAI API key not found, skipping LLM entity cleaning');
    return rawEntities.map(e => ({
      name: e.name,
      kind: e.kind,
      isValid: isValidEntity(e.name),
      cleanedName: e.name,
    }));
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Batch entities for cost efficiency (max 20 per call)
  const batches = [];
  for (let i = 0; i < rawEntities.length; i += 20) {
    batches.push(rawEntities.slice(i, i + 20));
  }

  const allResults: Array<{
    name: string;
    kind: EntityKind;
    isValid: boolean;
    cleanedName?: string;
  }> = [];

  for (const batch of batches) {
    try {
      const entityList = batch
        .map(
          (e, i) =>
            `${i + 1}. "${e.name}" (${e.kind}, ${e.mentionCount} mentions)`
        )
        .join('\n');

      const systemPrompt = `You are a technical entity validator for 3D display technology documentation. 

Your task is to clean and validate extracted technical entities from Leia display technology documentation. 

CONTEXT: This is from technical documentation about Leia's 3D display technology including:
- Diffractive Lightfield Backlight (DLB) hardware
- Switchable Liquid Crystal (LC) lens technology  
- Display Runtime SDK and software features
- Calibration and tracking systems
- Consumer products using Leia technology

STRICT ENTITY CLASSIFICATION RULES:

COMPONENT (Physical hardware):
✓ KEEP: "3D Cell", "LC lens", "DLB", "Eye tracking camera", "ASIC chip"
✗ REJECT: Generic hardware terms without Leia context

TECHNOLOGY (Leia-specific algorithms/methods):
✓ KEEP: "Late Latching", "Stereo View Mapping", "Windowed Weaving", "Advanced Calibration"
✗ REJECT: Generic concepts like "3D rendering", "stereo rendering", "calibration"

PRODUCT (Actual devices):
✓ KEEP: "Samsung Odyssey 3D", "ZTE Nubia Pad", "Acer SpatialLabs"
✗ REJECT: Generic product categories

MANDATORY REJECTIONS - NEVER extract these:
❌ Technical specifications: "60fps", "720p", "1080p", "4K", "120Hz", "90-120 FPS"
❌ Generic measurements: "Frame Rate", "FOV", "baseline distance", "microseconds"  
❌ Basic concepts: "3D Effect", "immersion", "viewing experience"
❌ API names: "DX11", "DX12", "OpenGL", "Vulkan" (unless Leia-specific integration)
❌ Performance metrics: "Stable FPS", "latency", "transmission rate"
❌ Markdown artifacts: "###", "**text**", "A:**", "Q:**"
❌ Question fragments: "What does", "How many", incomplete sentences
❌ Generic terms: "displays", "systems", "technology", "calibration data"

KEEP EXAMPLES:
- "Late Latching" ✓ (Leia-specific technique)
- "3D Cell" ✓ (Leia hardware component)
- "Samsung Odyssey 3D" ✓ (specific product)

REJECT EXAMPLES:  
- "60 FPS" ✗ (technical specification)
- "Frame Rate" ✗ (generic measurement)
- "3D Effect" ✗ (vague concept)
- "OpenGL" ✗ (generic API)
- "Calibration Data" ✗ (generic term)

Return ONLY a JSON array with this exact format:
[
  {"original": "entity name", "cleaned": "Entity Name", "valid": true, "reason": "Leia-specific technology"},
  {"original": "60fps", "cleaned": null, "valid": false, "reason": "technical specification"}
]`;

      const userPrompt = `Validate and clean these technical entities:

${entityList}

Document context snippet: "${documentContext.slice(0, 500)}..."

Return the JSON array for validation results.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      });

      const responseText = response.choices[0]?.message?.content?.trim();
      if (!responseText) {
        throw new Error('Empty response from OpenAI');
      }

      // Parse JSON response
      let validationResults;
      try {
        // Extract JSON from response (handle potential markdown formatting)
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        const jsonText = jsonMatch ? jsonMatch[0] : responseText;
        validationResults = JSON.parse(jsonText);
      } catch (parseError) {
        console.error('Failed to parse LLM response as JSON:', responseText);
        throw parseError;
      }

      // Map results back to our format
      for (let i = 0; i < batch.length; i++) {
        const entity = batch[i];
        const result = validationResults[i];

        if (result) {
          // Post-LLM validation - double-check for any remaining specifications
          const isValidAfterLLM =
            result.valid &&
            result.cleaned &&
            preFilterSpecifications(result.cleaned) &&
            isLeiaSpecific(result.cleaned, entity.kind);

          allResults.push({
            name: entity.name,
            kind: entity.kind,
            isValid: isValidAfterLLM,
            cleanedName: isValidAfterLLM ? result.cleaned : undefined,
          });
        } else {
          // Fallback to regex validation if LLM result is missing
          allResults.push({
            name: entity.name,
            kind: entity.kind,
            isValid: isValidEntity(entity.name),
            cleanedName: entity.name,
          });
        }
      }
    } catch (error) {
      console.error('LLM entity cleaning failed for batch:', error);
      // Fallback to regex validation for this batch
      for (const entity of batch) {
        allResults.push({
          name: entity.name,
          kind: entity.kind,
          isValid: isValidEntity(entity.name),
          cleanedName: entity.name,
        });
      }
    }
  }

  return allResults;
}

// =======================
// Technical Entity Classification
// =======================

function classifyTechnicalEntity(name: string, context: string): EntityKind {
  const lowerName = name.toLowerCase();
  const lowerContext = context.toLowerCase();

  // Hardware technologies and components
  if (
    lowerName.includes('dlb') ||
    lowerName.includes('diffractive lightfield') ||
    lowerName.includes('lc lens') ||
    lowerName.includes('liquid crystal') ||
    lowerName.includes('3d cell') ||
    lowerName.includes('optical layer')
  ) {
    return 'component';
  }

  // Software features and algorithms
  if (
    lowerName.includes('mapping') ||
    lowerName.includes('latching') ||
    lowerName.includes('weaving') ||
    lowerName.includes('runtime') ||
    lowerName.includes('sdk') ||
    lowerName.includes('algorithm')
  ) {
    return 'technology';
  }

  // Calibration and processes
  if (
    lowerName.includes('calibration') ||
    lowerName.includes('process') ||
    lowerName.includes('mitigation') ||
    lowerName.includes('alignment')
  ) {
    return 'technology';
  }

  // Display products and devices
  if (
    lowerName.includes('odyssey') ||
    lowerName.includes('nubia') ||
    lowerName.includes('spatiallabs') ||
    lowerName.includes('pad')
  ) {
    return 'product';
  }

  // Organizations and companies
  if (
    lowerName.includes('leia') ||
    lowerName.includes('samsung') ||
    lowerName.includes('acer') ||
    lowerName.includes('zte')
  ) {
    return 'organization';
  }

  // Default classification based on context
  if (
    lowerContext.includes('camera') ||
    lowerContext.includes('sensor') ||
    lowerContext.includes('hardware') ||
    lowerContext.includes('component')
  ) {
    return 'component';
  }

  if (
    lowerContext.includes('software') ||
    lowerContext.includes('algorithm') ||
    lowerContext.includes('method') ||
    lowerContext.includes('technique')
  ) {
    return 'technology';
  }

  return 'technology'; // Default for technical terms
}

// =======================
// Authority Scoring for Technical Entities
// =======================

function calculateTechnicalAuthorityScore(
  name: string,
  context: string,
  mentionCount: number
): number {
  let score = 0.5; // Base score

  const lowerName = name.toLowerCase();
  const lowerContext = context.toLowerCase();

  // Core Leia technologies get high authority
  if (
    lowerName.includes('dlb') ||
    lowerName.includes('diffractive lightfield') ||
    lowerName.includes('lc lens') ||
    lowerName.includes('liquid crystal')
  ) {
    score += 0.4;
  }

  // Key runtime features get high authority
  if (
    lowerName.includes('stereo view mapping') ||
    lowerName.includes('late latching') ||
    lowerName.includes('windowed weaving') ||
    lowerName.includes('advanced calibration')
  ) {
    score += 0.3;
  }

  // Technical definitions and explanations boost authority
  if (
    lowerContext.includes('is a') ||
    lowerContext.includes('is the') ||
    lowerContext.includes('refers to') ||
    lowerContext.includes('means')
  ) {
    score += 0.2;
  }

  // FAQ context provides authoritative definitions
  if (
    lowerContext.includes('a:**') ||
    lowerContext.includes('answer:') ||
    lowerContext.includes('q:**') ||
    lowerContext.includes('question:')
  ) {
    score += 0.15;
  }

  // Technical specifications and measurements
  if (lowerContext.match(/\d+%|\d+fps|\d+mm|\d+°|microseconds|milliseconds/)) {
    score += 0.1;
  }

  // Multiple mentions indicate importance
  score += Math.min(mentionCount * 0.05, 0.2);

  return Math.min(score, 1.0);
}

// =======================
// Main Technical Extraction Function
// =======================

export interface TechnicalExtractionResult {
  entities: Array<{
    name: string;
    kind: EntityKind;
    mentionCount: number;
    authorityScore: number;
    description?: string;
    context: string;
  }>;
  relationships: Array<{
    srcName: string;
    srcType: EntityKind;
    relation: RelationType | string;
    dstName: string;
    dstType: EntityKind;
    confidence: number;
    evidenceText: string;
  }>;
  metadata: {
    totalEntitiesFound: number;
    entitiesByKind: Record<EntityKind, number>;
    avgAuthorityScore: number;
    relationshipsFound: number;
    faqStructureDetected: boolean;
    technicalTermDensity: number;
  };
}

export async function extractTechnicalEntities(
  content: string,
  metadata: DocumentMetadata,
  chunks?: any[]
): Promise<TechnicalExtractionResult> {
  console.log('🔬 Starting technical document entity extraction...');
  const startTime = Date.now();

  const entities = new Map<string, any>();
  const relationships: any[] = [];
  const entityCounts: Record<EntityKind, number> = {
    person: 0,
    organization: 0,
    product: 0,
    technology: 0,
    component: 0,
    document: 0,
  };

  // Combine all technical patterns
  const allPatterns = [
    ...LEIA_HARDWARE_PATTERNS,
    ...LEIA_SOFTWARE_PATTERNS,
    ...TECHNICAL_PROCESS_PATTERNS,
    ...HARDWARE_COMPONENT_PATTERNS,
    ...SOFTWARE_ARCHITECTURE_PATTERNS,
  ];

  // Extract entities using lexical patterns
  for (const pattern of allPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const entityName = match[1] || match[0];
      const cleanName = cleanEntityName(entityName);

      if (!isValidEntity(cleanName)) continue;

      // Get context around the match
      const start = Math.max(0, match.index - 100);
      const end = Math.min(
        content.length,
        match.index + entityName.length + 100
      );
      const context = content.slice(start, end);

      const kind = classifyTechnicalEntity(cleanName, context);
      const key = `${cleanName.toLowerCase()}_${kind}`;

      if (entities.has(key)) {
        entities.get(key).mentionCount++;
        entities.get(key).contexts.push(context);
      } else {
        entities.set(key, {
          name: cleanName,
          kind,
          mentionCount: 1,
          contexts: [context],
          firstContext: context,
        });
        entityCounts[kind]++;
      }
    }
  }

  // Process FAQ structure for additional entities (more carefully)
  let faqStructureDetected = false;
  for (const pattern of FAQ_STRUCTURE_PATTERNS) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      faqStructureDetected = true;
      // Skip FAQ structure patterns for entity extraction to avoid malformed entries
      // The FAQ structure detection is sufficient for routing strategy
    }
  }

  // Prepare entities for LLM cleaning
  const rawEntitiesForCleaning = Array.from(entities.values()).map(entity => ({
    name: entity.name,
    kind: entity.kind,
    context: entity.firstContext,
    mentionCount: entity.mentionCount,
  }));

  console.log(
    `🧪 Running LLM entity cleaning on ${rawEntitiesForCleaning.length} entities...`
  );

  // Use LLM to clean and validate entities
  const cleaningResults = await cleanEntitiesWithLLM(
    rawEntitiesForCleaning,
    content
  );

  // Filter to only valid entities and apply cleaned names
  const validatedEntities = cleaningResults
    .filter(result => result.isValid && result.cleanedName)
    .map(result => {
      const originalEntity = entities.get(
        `${result.name.toLowerCase()}_${result.kind}`
      );
      return {
        name: result.cleanedName!,
        kind: result.kind,
        mentionCount: originalEntity?.mentionCount || 1,
        contexts: originalEntity?.contexts || [],
        firstContext: originalEntity?.firstContext || '',
      };
    });

  console.log(
    `✅ LLM cleaning: ${rawEntitiesForCleaning.length} → ${validatedEntities.length} entities (${Math.round((validatedEntities.length / rawEntitiesForCleaning.length) * 100)}% kept)`
  );

  // Calculate authority scores for validated entities
  const finalEntities = validatedEntities.map(entity => {
    const authorityScore = calculateTechnicalAuthorityScore(
      entity.name,
      entity.firstContext,
      entity.mentionCount
    );

    return {
      name: entity.name,
      kind: entity.kind,
      mentionCount: entity.mentionCount,
      authorityScore,
      context: entity.firstContext,
      description:
        entity.contexts.length > 1
          ? `Technical entity mentioned ${entity.mentionCount} times in document`
          : undefined,
    };
  });

  // Extract relationships using technical patterns
  for (const [relationType, patterns] of Object.entries(
    TECHNICAL_RELATIONSHIP_PATTERNS
  )) {
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const srcName = match[1]?.trim();
        const dstName = match[2]?.trim();

        if (srcName && dstName && srcName !== dstName) {
          const srcEntity = finalEntities.find(
            e =>
              e.name.toLowerCase().includes(srcName.toLowerCase()) ||
              srcName.toLowerCase().includes(e.name.toLowerCase())
          );

          const dstEntity = finalEntities.find(
            e =>
              e.name.toLowerCase().includes(dstName.toLowerCase()) ||
              dstName.toLowerCase().includes(e.name.toLowerCase())
          );

          if (srcEntity && dstEntity) {
            relationships.push({
              srcName: srcEntity.name,
              srcType: srcEntity.kind,
              relation: relationType as RelationType,
              dstName: dstEntity.name,
              dstType: dstEntity.kind,
              confidence: 0.8,
              evidenceText: match[0],
            });
          }
        }
      }
    }
  }

  // Calculate technical term density
  const totalWords = content.split(/\s+/).length;
  const technicalTerms = finalEntities.length;
  const technicalTermDensity = (technicalTerms / totalWords) * 1000; // per 1000 words

  const avgAuthorityScore =
    finalEntities.length > 0
      ? finalEntities.reduce((sum, e) => sum + e.authorityScore, 0) /
        finalEntities.length
      : 0;

  const extractionTime = Date.now() - startTime;

  console.log(`🧪 Technical extraction completed in ${extractionTime}ms`);
  console.log(
    `📊 Found ${finalEntities.length} technical entities, ${relationships.length} relationships`
  );
  console.log(
    `🎯 Technical term density: ${technicalTermDensity.toFixed(1)} terms per 1000 words`
  );
  console.log(`📈 Average authority score: ${avgAuthorityScore.toFixed(2)}`);

  return {
    entities: finalEntities,
    relationships,
    metadata: {
      totalEntitiesFound: finalEntities.length,
      entitiesByKind: entityCounts,
      avgAuthorityScore,
      relationshipsFound: relationships.length,
      faqStructureDetected,
      technicalTermDensity,
    },
  };
}

// Export for use in unified processor
export const technicalDocumentEntityExtractor = {
  extractEntities: extractTechnicalEntities,
  name: 'Technical Documentation',
  description:
    'Specialized extraction for technical FAQs, specifications, and documentation',
};
