/**
 * AudioRecording Entity
 * Represents a recorded audio file
 * Pure data type with factory function
 */

export interface AudioRecording {
  readonly id: string;
  readonly filePath: string;
  readonly durationMs: number;
  readonly timestamp: Date;
  readonly format: AudioFormat;
}

export interface AudioFormat {
  readonly sampleRate: number;
  readonly channels: number;
  readonly bitDepth: number;
  readonly encoding: 'wav';
}

// Default format for our recordings
export const DEFAULT_AUDIO_FORMAT: AudioFormat = {
  sampleRate: 16000,
  channels: 1,
  bitDepth: 16,
  encoding: 'wav',
} as const;

// Generate unique ID for recordings
const generateRecordingId = (): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `rec_${timestamp}_${random}`;
};

// Factory function (pure)
export const createAudioRecording = (
  filePath: string,
  durationMs: number,
  format: AudioFormat = DEFAULT_AUDIO_FORMAT
): AudioRecording => ({
  id: generateRecordingId(),
  filePath,
  durationMs,
  timestamp: new Date(),
  format,
});

// Helper to format duration for display
export const formatDuration = (recording: AudioRecording): string => {
  const seconds = Math.round(recording.durationMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
};

// Get filename from path
export const getFilename = (recording: AudioRecording): string => {
  const parts = recording.filePath.split('/');
  return parts[parts.length - 1] || recording.filePath;
};
