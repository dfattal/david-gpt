/**
 * Canonical Entity Normalizer
 *
 * Handles normalization of entity names to prevent drift and improve
 * entity consolidation across documents.
 */

export interface CanonicalEntity {
  canonicalName: string;  // Normalized for matching
  displayName: string;    // Original for display
  aliases: string[];      // All variations seen
}

export interface NormalizationResult {
  canonical: string;
  original: string;
  aliases: string[];
}

/**
 * Normalize text for canonical matching
 */
export function normalizeCanonical(text: string): string {
  if (!text) return '';

  return text
    // Unicode normalization (NFKC - compatibility decomposition + canonical composition)
    .normalize('NFKC')
    // Convert to lowercase
    .toLowerCase()
    // Remove common punctuation but preserve essential characters
    .replace(/["""''`]/g, '') // Remove curly quotes
    .replace(/[–—]/g, '-')    // Normalize dashes
    .replace(/[\.]/g, '')     // Remove periods
    .replace(/[,;:]/g, '')    // Remove common punctuation
    // Collapse multiple spaces/whitespace
    .replace(/\s+/g, ' ')
    // Trim whitespace
    .trim();
}

/**
 * Organization-specific normalization
 */
export function normalizeOrganization(orgName: string): NormalizationResult {
  const original = orgName.trim();
  const aliases: string[] = [original];

  // Common organization suffixes to normalize
  const orgSuffixes = [
    'Inc.', 'Inc', 'Incorporated',
    'Corp.', 'Corp', 'Corporation',
    'Ltd.', 'Ltd', 'Limited',
    'LLC', 'L.L.C.', 'L.L.C',
    'Co.', 'Co', 'Company',
    'GmbH', 'AG', 'SA', 'S.A.',
    'Pte.', 'Pte', 'Private Limited',
    'Technologies', 'Technology', 'Tech',
    'Systems', 'System', 'Solutions',
    'Group', 'Holdings', 'Ventures'
  ];

  let normalized = original;

  // Check for and normalize organization suffixes
  for (const suffix of orgSuffixes) {
    const pattern = new RegExp(`\\b${suffix.replace('.', '\\.')}\\b$`, 'i');
    if (pattern.test(normalized)) {
      // Create alias without suffix
      const withoutSuffix = normalized.replace(pattern, '').trim();
      if (withoutSuffix && !aliases.includes(withoutSuffix)) {
        aliases.push(withoutSuffix);
      }
      break; // Only remove one suffix
    }
  }

  // Create canonical version
  const canonical = normalizeCanonical(normalized);

  return {
    canonical,
    original,
    aliases: aliases.filter(a => a !== original) // Don't duplicate original
  };
}

/**
 * Person name normalization
 */
export function normalizePerson(personName: string): NormalizationResult {
  const original = personName.trim();
  const aliases: string[] = [];

  // Handle common name variations
  let normalized = original;

  // Handle titles (Dr., Prof., Mr., Ms., etc.)
  const titles = ['Dr.', 'Prof.', 'Professor', 'Mr.', 'Ms.', 'Mrs.', 'Miss'];
  for (const title of titles) {
    const pattern = new RegExp(`^${title.replace('.', '\\.')}\\s+`, 'i');
    if (pattern.test(normalized)) {
      const withoutTitle = normalized.replace(pattern, '');
      if (!aliases.includes(withoutTitle)) {
        aliases.push(withoutTitle);
      }
    }
  }

  // Handle suffixes (Jr., Sr., III, etc.)
  const suffixes = ['Jr.', 'Jr', 'Sr.', 'Sr', 'II', 'III', 'IV'];
  for (const suffix of suffixes) {
    const pattern = new RegExp(`\\s+${suffix.replace('.', '\\.')}$`, 'i');
    if (pattern.test(normalized)) {
      const withoutSuffix = normalized.replace(pattern, '');
      if (!aliases.includes(withoutSuffix)) {
        aliases.push(withoutSuffix);
      }
    }
  }

  // Create canonical version
  const canonical = normalizeCanonical(normalized);

  return {
    canonical,
    original,
    aliases: aliases.filter(a => a !== original)
  };
}

/**
 * Technology/Product name normalization
 */
export function normalizeTechnology(techName: string): NormalizationResult {
  const original = techName.trim();
  const aliases: string[] = [];

  let normalized = original;

  // Handle version numbers and variants
  // e.g., "React 18" → aliases: ["React", "React 18"]
  const versionPattern = /^(.+?)\s+v?\d+(\.\d+)*(\s*(alpha|beta|rc|dev).*)?$/i;
  const versionMatch = normalized.match(versionPattern);
  if (versionMatch) {
    const baseName = versionMatch[1].trim();
    if (!aliases.includes(baseName)) {
      aliases.push(baseName);
    }
  }

  // Handle common technology suffixes
  const techSuffixes = [
    'API', 'SDK', 'Framework', 'Library', 'Platform',
    'Engine', 'Tool', 'Suite', 'System', 'Service'
  ];

  for (const suffix of techSuffixes) {
    const pattern = new RegExp(`\\s+${suffix}$`, 'i');
    if (pattern.test(normalized)) {
      const withoutSuffix = normalized.replace(pattern, '');
      if (withoutSuffix && !aliases.includes(withoutSuffix)) {
        aliases.push(withoutSuffix);
      }
    }
  }

  // Handle acronyms and expansions
  // This would need domain-specific knowledge, but we can handle common cases

  const canonical = normalizeCanonical(normalized);

  return {
    canonical,
    original,
    aliases: aliases.filter(a => a !== original)
  };
}

/**
 * Main normalization function that dispatches based on entity kind
 */
export function normalizeEntity(
  name: string,
  kind: string
): NormalizationResult {
  switch (kind?.toLowerCase()) {
    case 'organization':
      return normalizeOrganization(name);
    case 'person':
      return normalizePerson(name);
    case 'technology':
    case 'product':
    case 'component':
      return normalizeTechnology(name);
    default:
      // Generic normalization
      const canonical = normalizeCanonical(name);
      return {
        canonical,
        original: name.trim(),
        aliases: []
      };
  }
}

/**
 * Find similar canonical entities using fuzzy matching
 */
export function findSimilarCanonical(
  candidateName: string,
  existingCanonicals: string[],
  threshold: number = 0.8
): string | null {
  const candidateCanonical = normalizeCanonical(candidateName);

  for (const existing of existingCanonicals) {
    const similarity = calculateSimilarity(candidateCanonical, existing);
    if (similarity >= threshold) {
      return existing;
    }
  }

  return null;
}

/**
 * Simple string similarity calculation (Jaro-Winkler or similar)
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (str1.length === 0 || str2.length === 0) return 0.0;

  // Simple Levenshtein-based similarity
  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  return 1 - (distance / maxLength);
}

/**
 * Levenshtein distance calculation
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() =>
    Array(str1.length + 1).fill(null)
  );

  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // deletion
        matrix[j - 1][i] + 1,     // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Batch normalize entities and detect duplicates
 */
export function batchNormalizeEntities(
  entities: Array<{ name: string; kind: string }>
): Array<{
  original: { name: string; kind: string };
  normalized: NormalizationResult;
  duplicateOf?: string; // canonical name of duplicate
}> {
  const results: Array<{
    original: { name: string; kind: string };
    normalized: NormalizationResult;
    duplicateOf?: string;
  }> = [];

  const seenCanonicals = new Map<string, string>(); // canonical -> original name

  for (const entity of entities) {
    const normalized = normalizeEntity(entity.name, entity.kind);

    // Check for existing canonical
    const existingOriginal = seenCanonicals.get(normalized.canonical);

    const result = {
      original: entity,
      normalized,
      duplicateOf: existingOriginal || undefined
    };

    if (!existingOriginal) {
      seenCanonicals.set(normalized.canonical, entity.name);
    }

    results.push(result);
  }

  return results;
}