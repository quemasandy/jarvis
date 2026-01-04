/**
 * CustomDictionary Entity
 * Configuration for custom vocabulary and text replacements
 * Used to improve Whisper transcription accuracy for technical terms
 */

export interface ReplacementPattern {
  readonly from: string;
  readonly to: string;
}

export interface VocabularyConfig {
  readonly enabled: boolean;
  readonly terms: readonly string[];
}

export interface ReplacementsConfig {
  readonly enabled: boolean;
  readonly patterns: readonly ReplacementPattern[];
}

export interface CustomDictionary {
  readonly description?: string;
  readonly vocabulary: VocabularyConfig;
  readonly replacements: ReplacementsConfig;
}

/**
 * Default empty dictionary
 */
export const EMPTY_DICTIONARY: CustomDictionary = {
  vocabulary: {
    enabled: false,
    terms: [],
  },
  replacements: {
    enabled: false,
    patterns: [],
  },
};

/**
 * Generate a Whisper prompt from vocabulary terms
 * The prompt hints Whisper about expected terminology
 */
export const generateVocabularyPrompt = (dictionary: CustomDictionary): string | undefined => {
  if (!dictionary.vocabulary.enabled || dictionary.vocabulary.terms.length === 0) {
    return undefined;
  }

  // Whisper's prompt parameter works best with a comma-separated list of terms
  // Keep it concise - Whisper has a token limit for prompts
  const terms = dictionary.vocabulary.terms.slice(0, 100); // Limit to 100 terms
  return terms.join(', ');
};

/**
 * Apply replacement patterns to transcribed text
 * Fixes common misheard technical terms
 */
export const applyReplacements = (
  text: string,
  dictionary: CustomDictionary
): string => {
  if (!dictionary.replacements.enabled || dictionary.replacements.patterns.length === 0) {
    return text;
  }

  let result = text;

  for (const pattern of dictionary.replacements.patterns) {
    // Use word boundaries to avoid partial replacements
    // But be flexible with case for the pattern matching
    const escapedFrom = pattern.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedFrom}\\b`, 'gi');
    result = result.replace(regex, pattern.to);
  }

  return result;
};

/**
 * Validate and parse dictionary configuration
 */
export const parseDictionary = (data: unknown): CustomDictionary => {
  if (!data || typeof data !== 'object') {
    return EMPTY_DICTIONARY;
  }

  const obj = data as Record<string, unknown>;

  let vocabularyEnabled = false;
  let vocabularyTerms: readonly string[] = [];
  let replacementsEnabled = false;
  let replacementsPatterns: readonly ReplacementPattern[] = [];

  // Parse vocabulary
  if (obj.vocabulary && typeof obj.vocabulary === 'object') {
    const vocab = obj.vocabulary as Record<string, unknown>;
    vocabularyEnabled = vocab.enabled === true;
    if (Array.isArray(vocab.terms)) {
      vocabularyTerms = vocab.terms.filter(
        (t): t is string => typeof t === 'string'
      );
    }
  }

  // Parse replacements
  if (obj.replacements && typeof obj.replacements === 'object') {
    const repl = obj.replacements as Record<string, unknown>;
    replacementsEnabled = repl.enabled === true;
    if (Array.isArray(repl.patterns)) {
      replacementsPatterns = repl.patterns
        .filter(
          (p): p is { from: string; to: string } =>
            typeof p === 'object' &&
            p !== null &&
            typeof (p as Record<string, unknown>).from === 'string' &&
            typeof (p as Record<string, unknown>).to === 'string'
        )
        .map((p) => ({ from: p.from, to: p.to }));
    }
  }

  return {
    description: typeof obj.description === 'string' ? obj.description : undefined,
    vocabulary: {
      enabled: vocabularyEnabled,
      terms: vocabularyTerms,
    },
    replacements: {
      enabled: replacementsEnabled,
      patterns: replacementsPatterns,
    },
  };
};
