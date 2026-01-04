/**
 * ITextProcessor Port
 * Interface for post-processing transcribed text
 * Domain doesn't know about Ollama, LLMs, or any specific implementation
 */

import { DictationResult } from '../../application/types';

export interface ITextProcessor {
  /**
   * Process/improve transcribed text
   * Can fix grammar, punctuation, technical terms, etc.
   */
  readonly process: (text: string) => Promise<DictationResult<string>>;

  /**
   * Check if the processor is available/running
   */
  readonly isAvailable: () => Promise<boolean>;
}
