/**
 * PunctuationCommandProcessor
 * Converts spoken punctuation commands into actual punctuation marks
 * Pure function - no side effects
 */

interface PunctuationCommand {
  readonly pattern: RegExp;
  readonly replacement: string;
}

/**
 * Voice commands for punctuation (Spanish)
 * Order matters - more specific patterns should come first
 */
const PUNCTUATION_COMMANDS: readonly PunctuationCommand[] = [
  // Multi-word commands (must come before single-word)
  { pattern: /\bnuevo párrafo\b/gi, replacement: '\n\n' },
  { pattern: /\bnueva línea\b/gi, replacement: '\n' },
  { pattern: /\bpunto y coma\b/gi, replacement: ';' },
  { pattern: /\bdos puntos\b/gi, replacement: ':' },
  { pattern: /\bpuntos suspensivos\b/gi, replacement: '...' },
  { pattern: /\babrir paréntesis\b/gi, replacement: '(' },
  { pattern: /\bcerrar paréntesis\b/gi, replacement: ')' },
  { pattern: /\babrir comillas\b/gi, replacement: '"' },
  { pattern: /\bcerrar comillas\b/gi, replacement: '"' },
  { pattern: /\babrir corchete\b/gi, replacement: '[' },
  { pattern: /\bcerrar corchete\b/gi, replacement: ']' },
  { pattern: /\bsigno de interrogación\b/gi, replacement: '?' },
  { pattern: /\bsigno de exclamación\b/gi, replacement: '!' },
  { pattern: /\bsigno de pregunta\b/gi, replacement: '?' },

  // Single-word commands
  { pattern: /\bpunto\b/gi, replacement: '.' },
  { pattern: /\bcoma\b/gi, replacement: ',' },
  { pattern: /\binterrogación\b/gi, replacement: '?' },
  { pattern: /\bexclamación\b/gi, replacement: '!' },
  { pattern: /\bguión\b/gi, replacement: '-' },
  { pattern: /\bcomillas\b/gi, replacement: '"' },
  { pattern: /\bparéntesis\b/gi, replacement: '()' },
  { pattern: /\barroba\b/gi, replacement: '@' },
];

/**
 * Process text to convert spoken punctuation commands into actual punctuation
 * @param text - Raw transcribed text
 * @returns Text with punctuation commands replaced
 */
export const processPunctuationCommands = (text: string): string => {
  let result = text;

  for (const command of PUNCTUATION_COMMANDS) {
    result = result.replace(command.pattern, command.replacement);
  }

  // Clean up spacing around punctuation
  result = cleanupPunctuationSpacing(result);

  return result;
};

/**
 * Clean up spacing around punctuation marks
 * Removes extra spaces before punctuation and ensures proper spacing after
 */
const cleanupPunctuationSpacing = (text: string): string => {
  let result = text;

  // Remove space before punctuation marks (.,;:?!)
  result = result.replace(/\s+([.,;:?!])/g, '$1');

  // Ensure single space after punctuation (except before newlines or end of string)
  result = result.replace(/([.,;:?!])(?=[^\s\n])/g, '$1 ');

  // Remove space after opening brackets/quotes
  result = result.replace(/([(\["])(\s+)/g, '$1');

  // Remove space before closing brackets/quotes
  result = result.replace(/(\s+)([)\]"])/g, '$2');

  // Trim extra whitespace
  result = result.replace(/  +/g, ' ').trim();

  return result;
};

/**
 * Get list of available punctuation commands (for help/documentation)
 */
export const getAvailableCommands = (): readonly { command: string; result: string }[] => [
  { command: 'punto', result: '.' },
  { command: 'coma', result: ',' },
  { command: 'punto y coma', result: ';' },
  { command: 'dos puntos', result: ':' },
  { command: 'interrogación / signo de interrogación', result: '?' },
  { command: 'exclamación / signo de exclamación', result: '!' },
  { command: 'nuevo párrafo', result: '(salto de párrafo)' },
  { command: 'nueva línea', result: '(salto de línea)' },
  { command: 'puntos suspensivos', result: '...' },
  { command: 'guión', result: '-' },
  { command: 'arroba', result: '@' },
  { command: 'comillas / abrir comillas / cerrar comillas', result: '"' },
  { command: 'abrir paréntesis / cerrar paréntesis', result: '() ' },
  { command: 'abrir corchete / cerrar corchete', result: '[]' },
];
