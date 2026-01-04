/**
 * ITextInjector Port
 * Interface for injecting text into the active application
 * Domain doesn't know about AppleScript, clipboard, or accessibility APIs
 */

import { DictationResult } from '../../application/types';

export interface ITextInjector {
  /**
   * Inject text at the current cursor position
   * Uses clipboard + paste or direct keyboard input
   */
  readonly injectText: (text: string) => Promise<DictationResult<void>>;

  /**
   * Get the name of the currently active/frontmost application
   */
  readonly getActiveApp: () => Promise<DictationResult<string>>;
}
