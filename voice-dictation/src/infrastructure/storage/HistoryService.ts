/**
 * HistoryService
 * Manages transcription history and debug logs
 * Handles persistence, cleanup, and feedback
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  UserHistoryEntry,
  DebugLogEntry,
  TranscriptionLogData,
  createUserHistoryEntry,
  createDebugLogEntry,
  isEntryOlderThan,
} from '../../domain/entities/TranscriptionLog';
import {
  DictationResult,
  Ok,
  Err,
  createError,
} from '../../application/types';

interface HistoryServiceConfig {
  readonly historyDir: string;
  readonly audioDir: string;
  readonly retentionHours: number; // For debug logs and audio files
}

interface HistoryService {
  /**
   * Log a transcription to both user history and debug log
   */
  readonly logTranscription: (data: TranscriptionLogData) => Promise<DictationResult<void>>;

  /**
   * Get recent user history entries
   */
  readonly getUserHistory: (limit?: number) => Promise<DictationResult<UserHistoryEntry[]>>;

  /**
   * Get debug log entries (for analysis)
   */
  readonly getDebugLog: () => Promise<DictationResult<DebugLogEntry[]>>;

  /**
   * Add a correction to a debug log entry
   */
  readonly addCorrection: (id: string, expectedText: string) => Promise<DictationResult<void>>;

  /**
   * Clean up old debug logs and audio files
   */
  readonly cleanup: () => Promise<DictationResult<CleanupResult>>;

  /**
   * Get statistics for analysis
   */
  readonly getStats: () => Promise<DictationResult<HistoryStats>>;
}

interface CleanupResult {
  readonly deletedAudioFiles: number;
  readonly deletedDebugEntries: number;
}

interface HistoryStats {
  readonly totalTranscriptions: number;
  readonly totalDurationMs: number;
  readonly languageBreakdown: Record<string, number>;
  readonly appBreakdown: Record<string, number>;
  readonly averageLatencyMs: number;
  readonly correctionsCount: number;
  readonly errorsCount: number;
}

const USER_HISTORY_FILE = 'user_history.jsonl';
const DEBUG_LOG_FILE = 'debug_log.jsonl';

/**
 * Create a HistoryService instance
 */
export const createHistoryService = (
  config: HistoryServiceConfig
): HistoryService => {
  const userHistoryPath = path.join(config.historyDir, USER_HISTORY_FILE);
  const debugLogPath = path.join(config.historyDir, DEBUG_LOG_FILE);

  // Ensure directories exist
  const ensureDirs = (): void => {
    if (!fs.existsSync(config.historyDir)) {
      fs.mkdirSync(config.historyDir, { recursive: true });
    }
  };

  // Append a line to a JSONL file
  const appendJsonl = <T>(filePath: string, entry: T): void => {
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(filePath, line, 'utf-8');
  };

  // Read all entries from a JSONL file
  const readJsonl = <T>(filePath: string): T[] => {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    return lines.map(line => JSON.parse(line) as T);
  };

  // Write all entries to a JSONL file (overwrite)
  const writeJsonl = <T>(filePath: string, entries: T[]): void => {
    const content = entries.map(e => JSON.stringify(e)).join('\n') + (entries.length > 0 ? '\n' : '');
    fs.writeFileSync(filePath, content, 'utf-8');
  };

  const logTranscription = async (
    data: TranscriptionLogData
  ): Promise<DictationResult<void>> => {
    try {
      ensureDirs();

      // Create entries
      const userEntry = createUserHistoryEntry(data);
      const debugEntry = createDebugLogEntry(data);

      // Append to files
      appendJsonl(userHistoryPath, userEntry);
      appendJsonl(debugLogPath, debugEntry);

      return Ok(undefined);
    } catch (error) {
      return Err(
        createError(
          'CONFIG_ERROR',
          `Failed to log transcription: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  };

  const getUserHistory = async (
    limit?: number
  ): Promise<DictationResult<UserHistoryEntry[]>> => {
    try {
      const entries = readJsonl<UserHistoryEntry>(userHistoryPath);
      // Return most recent first
      const sorted = entries.reverse();
      return Ok(limit ? sorted.slice(0, limit) : sorted);
    } catch (error) {
      return Err(
        createError(
          'CONFIG_ERROR',
          `Failed to read user history: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  };

  const getDebugLog = async (): Promise<DictationResult<DebugLogEntry[]>> => {
    try {
      const entries = readJsonl<DebugLogEntry>(debugLogPath);
      return Ok(entries.reverse());
    } catch (error) {
      return Err(
        createError(
          'CONFIG_ERROR',
          `Failed to read debug log: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  };

  const addCorrection = async (
    id: string,
    expectedText: string
  ): Promise<DictationResult<void>> => {
    try {
      const entries = readJsonl<DebugLogEntry>(debugLogPath);
      const updated = entries.map(entry =>
        entry.id === id ? { ...entry, expectedText } : entry
      );
      writeJsonl(debugLogPath, updated);
      return Ok(undefined);
    } catch (error) {
      return Err(
        createError(
          'CONFIG_ERROR',
          `Failed to add correction: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  };

  const cleanup = async (): Promise<DictationResult<CleanupResult>> => {
    try {
      let deletedAudioFiles = 0;
      let deletedDebugEntries = 0;

      // Clean up old audio files
      if (fs.existsSync(config.audioDir)) {
        const audioFiles = fs.readdirSync(config.audioDir);
        for (const file of audioFiles) {
          if (!file.endsWith('.wav')) continue;

          const filePath = path.join(config.audioDir, file);
          const stats = fs.statSync(filePath);
          const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);

          if (ageHours > config.retentionHours) {
            fs.unlinkSync(filePath);
            deletedAudioFiles++;
          }
        }
      }

      // Clean up old debug log entries
      if (fs.existsSync(debugLogPath)) {
        const entries = readJsonl<DebugLogEntry>(debugLogPath);
        const retained = entries.filter(
          entry => !isEntryOlderThan(entry, config.retentionHours)
        );
        deletedDebugEntries = entries.length - retained.length;

        // Update audioExists flag for remaining entries
        const updated = retained.map(entry => ({
          ...entry,
          audioExists: fs.existsSync(entry.audioPath),
        }));

        writeJsonl(debugLogPath, updated);
      }

      return Ok({ deletedAudioFiles, deletedDebugEntries });
    } catch (error) {
      return Err(
        createError(
          'CONFIG_ERROR',
          `Cleanup failed: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  };

  const getStats = async (): Promise<DictationResult<HistoryStats>> => {
    try {
      const debugEntries = readJsonl<DebugLogEntry>(debugLogPath);
      const userEntries = readJsonl<UserHistoryEntry>(userHistoryPath);

      const languageBreakdown: Record<string, number> = {};
      const appBreakdown: Record<string, number> = {};
      let totalLatency = 0;
      let correctionsCount = 0;
      let errorsCount = 0;
      let totalDurationMs = 0;

      for (const entry of debugEntries) {
        // Language breakdown
        languageBreakdown[entry.language] = (languageBreakdown[entry.language] || 0) + 1;

        // App breakdown
        appBreakdown[entry.app] = (appBreakdown[entry.app] || 0) + 1;

        // Latency
        totalLatency += entry.transcriptionLatencyMs;

        // Corrections
        if (entry.expectedText !== null) {
          correctionsCount++;
        }

        // Errors
        if (entry.errorOccurred) {
          errorsCount++;
        }

        // Duration
        totalDurationMs += entry.durationMs;
      }

      // If no debug entries, use user history for basic stats
      if (debugEntries.length === 0) {
        for (const entry of userEntries) {
          languageBreakdown[entry.language] = (languageBreakdown[entry.language] || 0) + 1;
          appBreakdown[entry.app] = (appBreakdown[entry.app] || 0) + 1;
          totalDurationMs += entry.durationMs;
        }
      }

      return Ok({
        totalTranscriptions: userEntries.length,
        totalDurationMs,
        languageBreakdown,
        appBreakdown,
        averageLatencyMs: debugEntries.length > 0
          ? Math.round(totalLatency / debugEntries.length)
          : 0,
        correctionsCount,
        errorsCount,
      });
    } catch (error) {
      return Err(
        createError(
          'CONFIG_ERROR',
          `Failed to get stats: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  };

  return {
    logTranscription,
    getUserHistory,
    getDebugLog,
    addCorrection,
    cleanup,
    getStats,
  };
};

// Export types for use in other modules
export type { HistoryService, HistoryServiceConfig, CleanupResult, HistoryStats };
