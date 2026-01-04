/**
 * Transcription Entity
 * Represents the result of speech-to-text conversion
 * Pure data type with factory function
 */

export interface Transcription {
  readonly id: string;
  readonly audioId: string;
  readonly rawText: string;
  readonly processedText: string | null;
  readonly language: DetectedLanguage;
  readonly confidence: number | null;
  readonly timestamp: Date;
}

export type DetectedLanguage = 'es' | 'en' | 'mixed' | 'unknown';

// Generate unique ID for transcriptions
const generateTranscriptionId = (): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `trans_${timestamp}_${random}`;
};

// Factory function (pure)
export const createTranscription = (
  audioId: string,
  rawText: string,
  options?: {
    readonly processedText?: string;
    readonly language?: DetectedLanguage;
    readonly confidence?: number;
  }
): Transcription => ({
  id: generateTranscriptionId(),
  audioId,
  rawText,
  processedText: options?.processedText ?? null,
  language: options?.language ?? 'unknown',
  confidence: options?.confidence ?? null,
  timestamp: new Date(),
});

// Get the final text to inject (processed if available, otherwise raw)
export const getFinalText = (transcription: Transcription): string =>
  transcription.processedText ?? transcription.rawText;

// Check if text is empty or just whitespace
export const isEmpty = (transcription: Transcription): boolean => {
  const text = getFinalText(transcription);
  return text.trim().length === 0;
};

// Get word count
export const getWordCount = (transcription: Transcription): number => {
  const text = getFinalText(transcription);
  const words = text.trim().split(/\s+/);
  return words[0] === '' ? 0 : words.length;
};
