/**
 * IAudioRecorder Port
 * Interface for audio recording implementations
 * Domain doesn't know about sox, ffmpeg, or any specific implementation
 */

import { DictationResult } from '../../application/types';
import { AudioRecording } from '../entities/AudioRecording';

export interface IAudioRecorder {
  /**
   * Start recording audio
   * Returns immediately, recording happens in background
   */
  readonly startRecording: () => Promise<DictationResult<void>>;

  /**
   * Stop recording and return the recorded audio
   * Returns the AudioRecording entity with file path and metadata
   */
  readonly stopRecording: () => Promise<DictationResult<AudioRecording>>;

  /**
   * Check if currently recording
   */
  readonly isRecording: () => boolean;

  /**
   * Get the current recording duration in milliseconds
   * Returns 0 if not recording
   */
  readonly getRecordingDuration: () => number;
}
