/**
 * OllamaTextProcessor
 * Post-processes transcribed text using a local Ollama LLM
 * Improves punctuation, capitalization, and technical terms
 */

import { ITextProcessor } from '../../domain/ports/ITextProcessor';
import { DictationResult, Ok, Err, DictationError } from '../../application/types';

export interface OllamaTextProcessorConfig {
  readonly ollamaUrl: string;
  readonly model: string;
  readonly timeoutMs: number;
}

const DEFAULT_PROMPT = `You are a text correction assistant. Your task is to improve the transcribed text by:
1. Adding proper punctuation (periods, commas, question marks)
2. Fixing capitalization
3. Correcting technical terms (AWS, TypeScript, React, API, Node.js, npm, etc.)

Rules:
- Keep the SAME language (Spanish, English, or mixed)
- Do NOT translate
- Do NOT add or remove content
- Do NOT add explanations or comments
- Return ONLY the corrected text, nothing else

Text to correct:`;

/**
 * Check if Ollama is available at the given URL
 */
export const checkOllamaAvailable = async (ollamaUrl: string): Promise<boolean> => {
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

/**
 * Check if a specific model is available in Ollama
 */
export const checkModelAvailable = async (
  ollamaUrl: string,
  modelName: string
): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${ollamaUrl}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) return false;

    const data = await response.json() as { models?: Array<{ name: string }> };
    const models = data.models || [];

    // Check if model exists (with or without tag)
    return models.some(m =>
      m.name === modelName ||
      m.name.startsWith(`${modelName}:`) ||
      m.name === `${modelName}:latest`
    );
  } catch {
    return false;
  }
};

/**
 * Create an OllamaTextProcessor instance
 */
export const createOllamaTextProcessor = (
  config: OllamaTextProcessorConfig
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
          prompt: `${DEFAULT_PROMPT}\n${text}`,
          stream: false,
          options: {
            temperature: 0.1, // Low temperature for consistent corrections
            num_predict: Math.max(text.length * 2, 256), // Reasonable limit
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error: DictationError = {
          code: 'TEXT_PROCESSING_FAILED',
          message: `Ollama returned status ${response.status}`,
        };
        return Err(error);
      }

      const data = await response.json() as { response?: string };
      const processedText = data.response?.trim() || text;

      // Sanity check: if LLM returns something very different, use original
      if (processedText.length < text.length * 0.5 || processedText.length > text.length * 3) {
        console.warn('⚠️  LLM output length suspicious, using original text');
        return Ok(text);
      }

      return Ok(processedText);
    } catch (error) {
      const dictError: DictationError = {
        code: 'TEXT_PROCESSING_FAILED',
        message: error instanceof Error ? error.message : 'Ollama request failed',
      };
      return Err(dictError);
    }
  };

  const isAvailable = async (): Promise<boolean> => {
    return checkOllamaAvailable(ollamaUrl);
  };

  return {
    process,
    isAvailable,
  };
};
