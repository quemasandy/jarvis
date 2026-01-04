/**
 * TranscriptionLog Entity
 * Represents a logged transcription event for history and debugging
 */

/**
 * User-facing history entry (permanent)
 * Clean, minimal data for the user to review their dictations
 */
export interface UserHistoryEntry {
  readonly id: string;
  readonly timestamp: string; // ISO 8601
  readonly text: string;
  readonly app: string;
  readonly durationMs: number;
  readonly language: string;
}

/**
 * Debug log entry (temporary, 1 day retention)
 * Rich data for analyzing and improving the system
 */
export interface DebugLogEntry {
  readonly id: string;
  readonly timestamp: string; // ISO 8601
  readonly audioPath: string;
  readonly audioExists: boolean;
  readonly text: string;
  readonly expectedText: string | null; // User correction, null if not corrected
  readonly app: string;
  readonly durationMs: number;
  readonly language: string;
  readonly transcriptionLatencyMs: number;
  readonly model: string;
  readonly errorOccurred: boolean;
  readonly errorMessage: string | null;
}

/**
 * Data collected during a transcription for logging
 */
export interface TranscriptionLogData {
  readonly transcriptionId: string;
  readonly audioPath: string;
  readonly text: string;
  readonly app: string;
  readonly durationMs: number;
  readonly language: string;
  readonly transcriptionLatencyMs: number;
  readonly model: string;
  readonly error?: string;
}

/**
 * Create a user history entry from transcription data
 */
export const createUserHistoryEntry = (
  data: TranscriptionLogData
): UserHistoryEntry => ({
  id: data.transcriptionId,
  timestamp: new Date().toISOString(),
  text: data.text,
  app: data.app,
  durationMs: data.durationMs,
  language: data.language,
});

/**
 * Create a debug log entry from transcription data
 */
export const createDebugLogEntry = (
  data: TranscriptionLogData
): DebugLogEntry => ({
  id: data.transcriptionId,
  timestamp: new Date().toISOString(),
  audioPath: data.audioPath,
  audioExists: true, // Will be updated by cleanup
  text: data.text,
  expectedText: null, // User can add correction later
  app: data.app,
  durationMs: data.durationMs,
  language: data.language,
  transcriptionLatencyMs: data.transcriptionLatencyMs,
  model: data.model,
  errorOccurred: !!data.error,
  errorMessage: data.error || null,
});

/**
 * Check if an entry is older than the specified hours
 */
export const isEntryOlderThan = (
  entry: { timestamp: string },
  hours: number
): boolean => {
  const entryTime = new Date(entry.timestamp).getTime();
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return entryTime < cutoff;
};

/**
 * Format entry for display
 */
export const formatUserEntry = (entry: UserHistoryEntry): string => {
  const date = new Date(entry.timestamp);
  const timeStr = date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit'
  });
  const dateStr = date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit'
  });
  const duration = `${Math.round(entry.durationMs / 1000)}s`;

  return `[${dateStr} ${timeStr}] (${duration}, ${entry.app}) ${entry.text}`;
};
