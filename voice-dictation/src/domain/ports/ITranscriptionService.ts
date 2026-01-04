/**
 * ITranscriptionService Port
 * Interface for speech-to-text services
 * Domain doesn't know about Groq, Whisper, or any specific API
 */

import { DictationResult } from '../../application/types';
import { AudioRecording } from '../entities/AudioRecording';
import { Transcription } from '../entities/Transcription';

export interface ITranscriptionService {
  /**
   * Transcribe audio to text
   * Takes an audio recording and returns a transcription
   */
  readonly transcribe: (
    recording: AudioRecording
  ) => Promise<DictationResult<Transcription>>;
}
