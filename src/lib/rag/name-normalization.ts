/**
 * Name Normalization System for Patent Inventors
 *
 * Handles normalization and expansion of inventor names extracted from patents,
 * particularly for David Fattal's patents where names may be truncated or inconsistent.
 */

// Known inventor name mappings for David Fattal's patents
const KNOWN_INVENTOR_MAPPINGS: Record<string, string> = {
  // David Fattal variants
  Fattal: 'David A. Fattal',
  'David Fattal': 'David A. Fattal',
  'David A. Fattal': 'David A. Fattal', // Already correct

  // Other known collaborators on Fattal's patents
  Santori: 'Charles M. Santori',
  'Charles Santori': 'Charles M. Santori',
  'Charles M. Santori': 'Charles M. Santori', // Already correct

  'Zhen Peng': 'Zhen Peng', // Already correct
  'Ming Ma': 'Ming Ma', // Already correct
  'Xuejian Li': 'Xuejian Li', // Already correct

  // Other Leia Inc inventors from patents
  'Fetze Pijlman': 'Fetze Pijlman', // Already correct
  'Jan Van Der Horst': 'Jan Van Der Horst', // Already correct
};

/**
 * Normalize a single inventor name
 */
export function normalizeInventorName(name: string): string {
  const trimmedName = name.trim();

  // Check for exact matches first
  if (KNOWN_INVENTOR_MAPPINGS[trimmedName]) {
    return KNOWN_INVENTOR_MAPPINGS[trimmedName];
  }

  // Check for partial matches (case-insensitive)
  for (const [key, value] of Object.entries(KNOWN_INVENTOR_MAPPINGS)) {
    if (key.toLowerCase() === trimmedName.toLowerCase()) {
      return value;
    }
  }

  // Return the original name if no mapping found
  return trimmedName;
}

/**
 * Normalize an array of inventor names
 */
export function normalizeInventorNames(inventors: string[]): string[] {
  return inventors.map(inventor => normalizeInventorName(inventor));
}

/**
 * Check if a name appears to be David Fattal (for query understanding)
 */
export function isDavidFattal(name: string): boolean {
  const normalizedName = normalizeInventorName(name.trim());
  return normalizedName === 'David A. Fattal';
}

/**
 * Extract David Fattal's patents from a list based on inventor names
 */
export function filterDavidFattalPatents(
  patents: Array<{ inventors?: string[] }>
): Array<{ inventors?: string[] }> {
  return patents.filter(patent => {
    if (!patent.inventors || !Array.isArray(patent.inventors)) {
      return false;
    }

    const inventors =
      typeof patent.inventors[0] === 'string'
        ? patent.inventors
        : patent.inventors;

    return inventors.some(inventor => isDavidFattal(inventor));
  });
}

/**
 * Get all known inventor names for autocomplete/search suggestions
 */
export function getAllKnownInventors(): string[] {
  return Array.from(new Set(Object.values(KNOWN_INVENTOR_MAPPINGS))).sort();
}

/**
 * Check if an inventor list needs normalization
 */
export function needsNormalization(inventors: string[]): boolean {
  return inventors.some(inventor => {
    const normalized = normalizeInventorName(inventor);
    return normalized !== inventor;
  });
}
