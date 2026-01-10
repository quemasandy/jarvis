/**
 * OllamaTranslationService
 * Translates/improves text to English using a local Ollama LLM
 * - Spanish → English translation
 * - English → More native/fluent English
 * - Mixed → All English
 */

import { ITextProcessor } from '../../domain/ports/ITextProcessor';
import { DictationResult, Ok, Err, DictationError } from '../../application/types';

export interface OllamaTranslationConfig {
  readonly ollamaUrl: string;
  readonly model: string;
  readonly timeoutMs: number;
}

// Minimal prompt to reduce memory usage on low-RAM systems
const TRANSLATION_PROMPT = `Translate to English. Output ONLY the translation, nothing else.

Text:`;

/**
 * Create an OllamaTranslationService instance
 * Implements ITextProcessor interface for consistency with existing architecture
 */
export const createOllamaTranslationService = (
  config: OllamaTranslationConfig
): ITextProcessor => {
  const { ollamaUrl, model, timeoutMs } = config;

  const process = async (text: string): Promise<DictationResult<string>> => {
    // Skip processing for very short texts
    if (text.trim().length < 3) {
      return Ok(text);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt: `${TRANSLATION_PROMPT}\n${text}`,
          stream: false,
          options: {
            temperature: 0.1, // Lower for consistent translations
            num_predict: Math.min(text.length * 2, 256), // Cap output to reduce memory
            num_ctx: 512, // Smaller context window for low-RAM systems
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Try to get error details from Ollama
        let errorDetail = '';
        try {
          const errorBody = await response.text();
          errorDetail = errorBody ? ` - ${errorBody.substring(0, 200)}` : '';
        } catch {
          // Ignore if we can't read error body
        }

        const error: DictationError = {
          code: 'TRANSLATION_FAILED',
          message: `Ollama error ${response.status}${errorDetail}`,
        };
        return Err(error);
      }

      const data = await response.json() as { response?: string };
      const translatedText = data.response?.trim() || text;

      // Sanity check: if output is way too different, use original
      // For translation, we allow more variance (0.3x to 4x) since languages differ in verbosity
      if (translatedText.length < text.length * 0.3 || translatedText.length > text.length * 4) {
        console.warn('⚠️  Translation output length suspicious, using original text');
        return Ok(text);
      }

      return Ok(translatedText);
    } catch (error) {
      // Provide clearer error message for timeout
      let message = 'Ollama translation request failed';
      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.message.includes('aborted')) {
          message = `Traducción timeout (>${timeoutMs / 1000}s) - Ollama puede estar cargando el modelo`;
        } else {
          message = error.message;
        }
      }

      const dictError: DictationError = {
        code: 'TRANSLATION_FAILED',
        message,
      };
      return Err(dictError);
    }
  };

  const isAvailable = async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${ollamaUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  };

  return {
    process,
    isAvailable,
  };
};
