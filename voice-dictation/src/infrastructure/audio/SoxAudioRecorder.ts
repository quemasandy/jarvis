/**
 * SoxAudioRecorder
 * Implements IAudioRecorder using sox command-line tool
 * Side effects are contained in this infrastructure layer
 */

import { spawn, ChildProcess, exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import { IAudioRecorder } from '../../domain/ports/IAudioRecorder';
import {
  AudioRecording,
  createAudioRecording,
  DEFAULT_AUDIO_FORMAT,
} from '../../domain/entities/AudioRecording';
import {
  DictationResult,
  Ok,
  Err,
  createError,
} from '../../application/types';

const execAsync = promisify(exec);

// Sound effect paths (macOS system sounds)
const SOUND_START = '/System/Library/Sounds/Tink.aiff';
const SOUND_STOP = '/System/Library/Sounds/Pop.aiff';
const SOUND_ERROR = '/System/Library/Sounds/Basso.aiff';

interface RecorderState {
  process: ChildProcess | null;
  filePath: string | null;
  startTime: number | null;
}

/**
 * Create a SoxAudioRecorder instance
 * Factory function for dependency injection
 */
export const createSoxAudioRecorder = (
  storagePath: string = './storage/audio'
): IAudioRecorder => {
  // Mutable state (encapsulated within closure)
  const state: RecorderState = {
    process: null,
    filePath: null,
    startTime: null,
  };

  // Ensure storage directory exists
  const ensureStorageDir = (): void => {
    const absolutePath = path.resolve(storagePath);
    if (!fs.existsSync(absolutePath)) {
      fs.mkdirSync(absolutePath, { recursive: true });
    }
  };

  // Generate output file path
  const generateFilePath = (): string => {
    const timestamp = Date.now();
    const filename = `recording_${timestamp}.wav`;
    return path.resolve(storagePath, filename);
  };

  // Play sound effect (non-blocking)
  const playSound = (soundPath: string): void => {
    if (fs.existsSync(soundPath)) {
      spawn('afplay', [soundPath], { detached: true, stdio: 'ignore' });
    }
  };

  const startRecording = async (): Promise<DictationResult<void>> => {
    if (state.process !== null) {
      return Err(
        createError(
          'AUDIO_RECORDING_START_FAILED',
          'Recording already in progress'
        )
      );
    }

    try {
      ensureStorageDir();
      state.filePath = generateFilePath();

      // sox arguments for recording
      // -d: default audio input device
      // -r 16000: sample rate 16kHz
      // -c 1: mono channel
      // -b 16: 16-bit depth
      // -t wav: output format
      const soxArgs = [
        '-d',                           // Default input device
        '-r', String(DEFAULT_AUDIO_FORMAT.sampleRate),
        '-c', String(DEFAULT_AUDIO_FORMAT.channels),
        '-b', String(DEFAULT_AUDIO_FORMAT.bitDepth),
        '-t', 'wav',
        state.filePath,
      ];

      state.process = spawn('sox', soxArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      state.startTime = Date.now();

      // Handle process errors
      state.process.on('error', (error) => {
        console.error('❌ Sox process error:', error.message);
        state.process = null;
        state.startTime = null;
      });

      // Play start sound
      playSound(SOUND_START);

      return Ok(undefined);
    } catch (error) {
      state.process = null;
      state.filePath = null;
      state.startTime = null;

      // Play error sound
      playSound(SOUND_ERROR);

      return Err(
        createError(
          'AUDIO_RECORDING_START_FAILED',
          `Failed to start recording: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined
        )
      );
    }
  };

  const stopRecording = async (): Promise<DictationResult<AudioRecording>> => {
    if (state.process === null || state.filePath === null || state.startTime === null) {
      return Err(
        createError(
          'AUDIO_RECORDING_STOP_FAILED',
          'No recording in progress'
        )
      );
    }

    const filePath = state.filePath;
    const durationMs = Date.now() - state.startTime;

    try {
      // Send SIGTERM to stop recording gracefully
      state.process.kill('SIGTERM');

      // Wait for process to exit
      await new Promise<void>((resolve) => {
        if (state.process) {
          state.process.on('exit', () => resolve());
          // Fallback timeout
          setTimeout(resolve, 1000);
        } else {
          resolve();
        }
      });

      // Play stop sound
      playSound(SOUND_STOP);

      // Reset state
      state.process = null;
      state.filePath = null;
      state.startTime = null;

      // Verify file was created
      if (!fs.existsSync(filePath)) {
        return Err(
          createError(
            'AUDIO_RECORDING_STOP_FAILED',
            'Recording file was not created'
          )
        );
      }

      // Create and return the AudioRecording entity
      const recording = createAudioRecording(filePath, durationMs);

      return Ok(recording);
    } catch (error) {
      // Reset state on error
      state.process = null;
      state.filePath = null;
      state.startTime = null;

      // Play error sound
      playSound(SOUND_ERROR);

      return Err(
        createError(
          'AUDIO_RECORDING_STOP_FAILED',
          `Failed to stop recording: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined
        )
      );
    }
  };

  const isRecording = (): boolean => state.process !== null;

  const getRecordingDuration = (): number => {
    if (state.startTime === null) {
      return 0;
    }
    return Date.now() - state.startTime;
  };

  return {
    startRecording,
    stopRecording,
    isRecording,
    getRecordingDuration,
  };
};

/**
 * Check if sox is installed on the system
 */
export const checkSoxInstalled = async (): Promise<DictationResult<string>> => {
  try {
    const { stdout } = await execAsync('sox --version');
    const version = stdout.trim().split('\n')[0] || 'unknown';
    return Ok(version);
  } catch {
    return Err(
      createError(
        'SOX_NOT_INSTALLED',
        'sox is not installed. Please install it with: brew install sox'
      )
    );
  }
};
