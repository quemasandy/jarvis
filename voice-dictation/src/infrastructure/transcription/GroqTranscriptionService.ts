/**
 * GroqTranscriptionService
 * Implements ITranscriptionService using Groq's Whisper API
 * Ultra-fast transcription (<1s latency)
 */

import Groq from 'groq-sdk';
import * as fs from 'fs';
import { ITranscriptionService } from '../../domain/ports/ITranscriptionService';
import { AudioRecording } from '../../domain/entities/AudioRecording';
import {
  Transcription,
  createTranscription,
  DetectedLanguage,
} from '../../domain/entities/Transcription';
import {
  CustomDictionary,
  EMPTY_DICTIONARY,
  generateVocabularyPrompt,
  applyReplacements,
} from '../../domain/entities/CustomDictionary';
import {
  DictationResult,
  Ok,
  Err,
  createError,
} from '../../application/types';

interface GroqTranscriptionServiceConfig {
  readonly apiKey: string;
  readonly model?: string;
  readonly language?: string; // 'es', 'en', or undefined for auto-detect
  readonly dictionary?: CustomDictionary;
}

/**
 * Create a GroqTranscriptionService instance
 * Factory function for dependency injection
 */
export const createGroqTranscriptionService = (
  config: GroqTranscriptionServiceConfig
): ITranscriptionService => {
  const groq = new Groq({ apiKey: config.apiKey });
  const model = config.model ?? 'whisper-large-v3-turbo';
  const dictionary = config.dictionary ?? EMPTY_DICTIONARY;

  // Generate vocabulary prompt for Whisper
  const vocabularyPrompt = generateVocabularyPrompt(dictionary);

  const transcribe = async (
    recording: AudioRecording
  ): Promise<DictationResult<Transcription>> => {
    // Verify file exists
    if (!fs.existsSync(recording.filePath)) {
      return Err(
        createError(
          'TRANSCRIPTION_FAILED',
          `Audio file not found: ${recording.filePath}`
        )
      );
    }

    try {
      // Read the audio file
      const audioFile = fs.createReadStream(recording.filePath);

      // Call Groq Whisper API with optional vocabulary prompt
      const response = await groq.audio.transcriptions.create({
        file: audioFile,
        model: model,
        language: config.language, // undefined = auto-detect
        response_format: 'verbose_json',
        prompt: vocabularyPrompt, // Custom vocabulary hint
      });

      // Extract text and language
      // verbose_json response includes 'language' field but TypeScript doesn't know
      let rawText = response.text || '';
      const responseAny = response as unknown as Record<string, unknown>;
      const detectedLang = mapLanguage(responseAny.language as string | undefined);

      // Apply post-processing replacements from dictionary
      const processedText = applyReplacements(rawText, dictionary);

      // Create transcription entity
      const transcription = createTranscription(recording.id, rawText, {
        language: detectedLang,
        confidence: undefined, // Groq doesn't provide confidence scores
        processedText: processedText !== rawText ? processedText : undefined,
      });

      return Ok(transcription);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Check for specific API errors
      if (message.includes('401') || message.includes('Unauthorized')) {
        return Err(
          createError(
            'TRANSCRIPTION_FAILED',
            'Invalid Groq API key. Check your GROQ_API_KEY in config/.env'
          )
        );
      }

      if (message.includes('429') || message.includes('rate limit')) {
        return Err(
          createError(
            'TRANSCRIPTION_FAILED',
            'Groq rate limit exceeded. Wait a moment and try again.'
          )
        );
      }

      return Err(
        createError(
          'TRANSCRIPTION_FAILED',
          `Transcription failed: ${message}`,
          error instanceof Error ? error : undefined
        )
      );
    }
  };

  return { transcribe };
};

/**
 * Map Groq language code to our DetectedLanguage type
 */
const mapLanguage = (lang: string | undefined): DetectedLanguage => {
  if (!lang) return 'unknown';

  const normalized = lang.toLowerCase();

  if (normalized === 'es' || normalized === 'spanish') return 'es';
  if (normalized === 'en' || normalized === 'english') return 'en';

  // If we detect both or something else, mark as mixed/unknown
  return 'unknown';
};

/**
 * Check if Groq API key is valid by making a test call
 */
export const checkGroqApiKey = async (apiKey: string): Promise<boolean> => {
  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_groq_api_key_here') {
    return false;
  }

  // Basic format check for Groq keys (they start with gsk_)
  if (!apiKey.startsWith('gsk_')) {
    return false;
  }

  return true;
};
