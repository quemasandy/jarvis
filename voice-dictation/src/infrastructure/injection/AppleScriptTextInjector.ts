/**
 * AppleScriptTextInjector
 * Implements ITextInjector using AppleScript and macOS Accessibility
 * Injects text by copying to clipboard and simulating Cmd+V
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { ITextInjector } from '../../domain/ports/ITextInjector';
import {
  DictationResult,
  Ok,
  Err,
  createError,
} from '../../application/types';

const execAsync = promisify(exec);

/**
 * Escape special characters for AppleScript strings
 * AppleScript uses backslash and double-quote escaping
 */
const escapeForAppleScript = (text: string): string => {
  return text
    .replace(/\\/g, '\\\\')     // Escape backslashes first
    .replace(/"/g, '\\"')        // Escape double quotes
    .replace(/\r\n/g, '\\n')     // Normalize Windows line endings
    .replace(/\r/g, '\\n')       // Normalize old Mac line endings
    .replace(/\n/g, '\\n');      // Escape newlines
};

/**
 * Execute an AppleScript command
 */
const runAppleScript = async (script: string): Promise<DictationResult<string>> => {
  try {
    const { stdout, stderr } = await execAsync(`osascript -e '${script}'`);
    if (stderr && stderr.trim()) {
      console.warn('⚠️ AppleScript warning:', stderr.trim());
    }
    return Ok(stdout.trim());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Check for permission errors
    if (message.includes('not allowed') || message.includes('accessibility')) {
      return Err(
        createError(
          'PERMISSION_DENIED',
          'Accessibility permission required. Enable in System Preferences → Security & Privacy → Privacy → Accessibility'
        )
      );
    }

    return Err(
      createError(
        'TEXT_INJECTION_FAILED',
        `AppleScript execution failed: ${message}`,
        error instanceof Error ? error : undefined
      )
    );
  }
};

/**
 * Create an AppleScriptTextInjector instance
 * Factory function for dependency injection
 */
export const createAppleScriptTextInjector = (): ITextInjector => {
  const injectText = async (text: string): Promise<DictationResult<void>> => {
    if (!text || text.trim().length === 0) {
      return Ok(undefined); // Nothing to inject
    }

    const escapedText = escapeForAppleScript(text);

    // Execute AppleScript using multiple -e flags for multi-line script
    // 1. Set clipboard to the text
    // 2. Wait a tiny bit for clipboard to update
    // 3. Simulate Cmd+V to paste
    try {
      const { stderr } = await execAsync(`osascript -e 'set the clipboard to "${escapedText}"' -e 'delay 0.1' -e 'tell application "System Events" to keystroke "v" using command down'`);

      if (stderr && stderr.includes('not allowed')) {
        return Err(
          createError(
            'PERMISSION_DENIED',
            'Accessibility permission required for text injection'
          )
        );
      }

      return Ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes('not allowed') || message.includes('accessibility')) {
        return Err(
          createError(
            'PERMISSION_DENIED',
            'Accessibility permission required. Enable in System Preferences → Security & Privacy → Privacy → Accessibility'
          )
        );
      }

      return Err(
        createError(
          'TEXT_INJECTION_FAILED',
          `Failed to inject text: ${message}`,
          error instanceof Error ? error : undefined
        )
      );
    }
  };

  const getActiveApp = async (): Promise<DictationResult<string>> => {
    const script = 'tell application "System Events" to get name of first application process whose frontmost is true';
    return runAppleScript(script);
  };

  return {
    injectText,
    getActiveApp,
  };
};

/**
 * Check if Accessibility permissions are granted
 */
export const checkAccessibilityPermission = async (): Promise<boolean> => {
  try {
    // Try to get the frontmost app - this requires accessibility permission
    const script = 'tell application "System Events" to get name of first application process whose frontmost is true';
    await execAsync(`osascript -e '${script}'`);
    return true;
  } catch {
    return false;
  }
};
