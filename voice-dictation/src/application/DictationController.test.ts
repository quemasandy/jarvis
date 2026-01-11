/**
 * DictationController Integration Tests
 * Uses mocks to test the orchestration logic without side effects
 */

import { describe, it, expect, vi } from 'vitest';
import { createDictationController } from './DictationController';
import { IAudioRecorder } from '../domain/ports/IAudioRecorder';
import { ITextInjector } from '../domain/ports/ITextInjector';
import { ITranscriptionService } from '../domain/ports/ITranscriptionService';
import { ITextProcessor } from '../domain/ports/ITextProcessor';
import { Ok, Err, createError } from './types';
import { createAudioRecording } from '../domain/entities/AudioRecording';
import { createTranscription } from '../domain/entities/Transcription';

// ============================================================================
// Mock Factories
// ============================================================================

const createMockAudioRecorder = (overrides?: Partial<IAudioRecorder>): IAudioRecorder => ({
  startRecording: vi.fn().mockResolvedValue(Ok(undefined)),
  stopRecording: vi.fn().mockResolvedValue(
    Ok(createAudioRecording('/tmp/test.wav', 2000))
  ),
  isRecording: vi.fn().mockReturnValue(false),
  getRecordingDuration: vi.fn().mockReturnValue(0),
  ...overrides,
});

const createMockTextInjector = (overrides?: Partial<ITextInjector>): ITextInjector => ({
  injectText: vi.fn().mockResolvedValue(Ok(undefined)),
  getActiveApp: vi.fn().mockResolvedValue(Ok('TestApp')),
  ...overrides,
});

const createMockTranscriptionService = (
  overrides?: Partial<ITranscriptionService>
): ITranscriptionService => ({
  transcribe: vi.fn().mockResolvedValue(
    Ok(createTranscription('rec_123', 'Hello world', { language: 'en' }))
  ),
  ...overrides,
});

const createMockTextProcessor = (overrides?: Partial<ITextProcessor>): ITextProcessor => ({
  process: vi.fn().mockImplementation(async (text: string) => Ok(text.toUpperCase())),
  isAvailable: vi.fn().mockResolvedValue(true),
  ...overrides,
});

// ============================================================================
// Tests
// ============================================================================

describe('DictationController', () => {
  describe('handleKeyPress', () => {
    it('starts recording when not already recording', async () => {
      const audioRecorder = createMockAudioRecorder();
      const textInjector = createMockTextInjector();

      const controller = createDictationController({
        audioRecorder,
        textInjector,
      });

      await controller.handleKeyPress();

      expect(audioRecorder.startRecording).toHaveBeenCalledTimes(1);
    });

    it('does not start recording if already recording', async () => {
      const audioRecorder = createMockAudioRecorder({
        isRecording: vi.fn().mockReturnValue(true),
      });
      const textInjector = createMockTextInjector();

      const controller = createDictationController({
        audioRecorder,
        textInjector,
      });

      await controller.handleKeyPress();

      expect(audioRecorder.startRecording).not.toHaveBeenCalled();
    });

    it('handles recording start failure gracefully', async () => {
      const audioRecorder = createMockAudioRecorder({
        startRecording: vi.fn().mockResolvedValue(
          Err(createError('SOX_NOT_INSTALLED', 'sox is not installed'))
        ),
      });
      const textInjector = createMockTextInjector();

      const controller = createDictationController({
        audioRecorder,
        textInjector,
      });

      // Should not throw
      await expect(controller.handleKeyPress()).resolves.not.toThrow();
    });
  });

  describe('handleKeyRelease', () => {
    it('does nothing if not recording', async () => {
      const audioRecorder = createMockAudioRecorder({
        isRecording: vi.fn().mockReturnValue(false),
      });
      const textInjector = createMockTextInjector();

      const controller = createDictationController({
        audioRecorder,
        textInjector,
      });

      await controller.handleKeyRelease();

      expect(audioRecorder.stopRecording).not.toHaveBeenCalled();
      expect(textInjector.injectText).not.toHaveBeenCalled();
    });

    it('stops recording and injects simulated text when no transcription service', async () => {
      const audioRecorder = createMockAudioRecorder({
        isRecording: vi.fn().mockReturnValue(true),
      });
      const textInjector = createMockTextInjector();

      const controller = createDictationController({
        audioRecorder,
        textInjector,
        // No transcription service = simulation mode
      });

      await controller.handleKeyRelease();

      expect(audioRecorder.stopRecording).toHaveBeenCalledTimes(1);
      expect(textInjector.injectText).toHaveBeenCalledTimes(1);

      // Should inject simulated text with duration
      const injectedText = (textInjector.injectText as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(injectedText).toContain('[Audio grabado:');
    });

    it('transcribes audio and injects real text when transcription service is provided', async () => {
      const audioRecorder = createMockAudioRecorder({
        isRecording: vi.fn().mockReturnValue(true),
      });
      const textInjector = createMockTextInjector();
      const transcriptionService = createMockTranscriptionService();

      const controller = createDictationController({
        audioRecorder,
        textInjector,
        transcriptionService,
      });

      await controller.handleKeyRelease();

      expect(transcriptionService.transcribe).toHaveBeenCalledTimes(1);
      expect(textInjector.injectText).toHaveBeenCalledWith('Hello world');
    });

    it('applies text processor when useOllama is true', async () => {
      const audioRecorder = createMockAudioRecorder({
        isRecording: vi.fn().mockReturnValue(true),
      });
      const textInjector = createMockTextInjector();
      const transcriptionService = createMockTranscriptionService();
      const textProcessor = createMockTextProcessor();

      const controller = createDictationController({
        audioRecorder,
        textInjector,
        transcriptionService,
        textProcessor,
      });

      // Pass useOllama=true to enable text processing (quality mode with Shift)
      await controller.handleKeyRelease('dictation', true);

      expect(textProcessor.process).toHaveBeenCalledWith('Hello world');
      // Text processor converts to uppercase
      expect(textInjector.injectText).toHaveBeenCalledWith('HELLO WORLD');
    });

    it('skips text processor in fast mode (useOllama=false)', async () => {
      const audioRecorder = createMockAudioRecorder({
        isRecording: vi.fn().mockReturnValue(true),
      });
      const textInjector = createMockTextInjector();
      const transcriptionService = createMockTranscriptionService();
      const textProcessor = createMockTextProcessor();

      const controller = createDictationController({
        audioRecorder,
        textInjector,
        transcriptionService,
        textProcessor,
      });

      // Default useOllama=false - fast mode, no text processing
      await controller.handleKeyRelease();

      expect(textProcessor.process).not.toHaveBeenCalled();
      expect(textInjector.injectText).toHaveBeenCalledWith('Hello world');
    });

    it('uses original text when text processor fails', async () => {
      const audioRecorder = createMockAudioRecorder({
        isRecording: vi.fn().mockReturnValue(true),
      });
      const textInjector = createMockTextInjector();
      const transcriptionService = createMockTranscriptionService();
      const textProcessor = createMockTextProcessor({
        process: vi.fn().mockResolvedValue(
          Err(createError('TEXT_PROCESSING_FAILED', 'Ollama timeout'))
        ),
      });

      const controller = createDictationController({
        audioRecorder,
        textInjector,
        transcriptionService,
        textProcessor,
      });

      // useOllama=true to trigger text processor
      await controller.handleKeyRelease('dictation', true);

      // Should fall back to original text
      expect(textInjector.injectText).toHaveBeenCalledWith('Hello world');
    });

    it('handles transcription failure gracefully', async () => {
      const audioRecorder = createMockAudioRecorder({
        isRecording: vi.fn().mockReturnValue(true),
      });
      const textInjector = createMockTextInjector();
      const transcriptionService = createMockTranscriptionService({
        transcribe: vi.fn().mockResolvedValue(
          Err(createError('TRANSCRIPTION_FAILED', 'API error'))
        ),
      });

      const controller = createDictationController({
        audioRecorder,
        textInjector,
        transcriptionService,
      });

      await controller.handleKeyRelease();

      // Should inject error message
      const injectedText = (textInjector.injectText as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(injectedText).toContain('[Error de transcripción');
    });

    it('does not inject text when transcription is empty', async () => {
      const audioRecorder = createMockAudioRecorder({
        isRecording: vi.fn().mockReturnValue(true),
      });
      const textInjector = createMockTextInjector();
      const transcriptionService = createMockTranscriptionService({
        transcribe: vi.fn().mockResolvedValue(
          Ok(createTranscription('rec_123', '   ', { language: 'en' }))
        ),
      });

      const controller = createDictationController({
        audioRecorder,
        textInjector,
        transcriptionService,
      });

      await controller.handleKeyRelease();

      // Should not inject empty text
      expect(textInjector.injectText).not.toHaveBeenCalled();
    });

    it('passes through transcribed text without punctuation processing', async () => {
      // Note: Punctuation command processing was removed for performance optimization
      // Text is now passed through directly without transformation
      const audioRecorder = createMockAudioRecorder({
        isRecording: vi.fn().mockReturnValue(true),
      });
      const textInjector = createMockTextInjector();
      const transcriptionService = createMockTranscriptionService({
        transcribe: vi.fn().mockResolvedValue(
          Ok(createTranscription('rec_123', 'Hola punto cómo estás interrogación', { language: 'es' }))
        ),
      });

      const controller = createDictationController({
        audioRecorder,
        textInjector,
        transcriptionService,
      });

      await controller.handleKeyRelease();

      // Text is passed through as-is (no punctuation processing)
      expect(textInjector.injectText).toHaveBeenCalledWith('Hola punto cómo estás interrogación');
    });
  });

  describe('isRecording', () => {
    it('returns true when recording', () => {
      const audioRecorder = createMockAudioRecorder({
        isRecording: vi.fn().mockReturnValue(true),
      });
      const textInjector = createMockTextInjector();

      const controller = createDictationController({
        audioRecorder,
        textInjector,
      });

      expect(controller.isRecording()).toBe(true);
    });

    it('returns false when not recording', () => {
      const audioRecorder = createMockAudioRecorder({
        isRecording: vi.fn().mockReturnValue(false),
      });
      const textInjector = createMockTextInjector();

      const controller = createDictationController({
        audioRecorder,
        textInjector,
      });

      expect(controller.isRecording()).toBe(false);
    });
  });

  describe('Full workflow integration', () => {
    it('completes full dictation cycle: press → record → release → transcribe → inject', async () => {
      let isRecording = false;

      const audioRecorder = createMockAudioRecorder({
        isRecording: vi.fn().mockImplementation(() => isRecording),
        startRecording: vi.fn().mockImplementation(async () => {
          isRecording = true;
          return Ok(undefined);
        }),
        stopRecording: vi.fn().mockImplementation(async () => {
          isRecording = false;
          return Ok(createAudioRecording('/tmp/test.wav', 3000));
        }),
      });

      const textInjector = createMockTextInjector();
      const transcriptionService = createMockTranscriptionService({
        transcribe: vi.fn().mockResolvedValue(
          Ok(createTranscription('rec_123', 'Test message', { language: 'es' }))
        ),
      });

      const controller = createDictationController({
        audioRecorder,
        textInjector,
        transcriptionService,
      });

      // Initial state
      expect(controller.isRecording()).toBe(false);

      // Press key - start recording
      await controller.handleKeyPress();
      expect(controller.isRecording()).toBe(true);
      expect(audioRecorder.startRecording).toHaveBeenCalled();

      // Release key - stop, transcribe, inject (fast mode by default)
      await controller.handleKeyRelease();
      expect(controller.isRecording()).toBe(false);
      expect(audioRecorder.stopRecording).toHaveBeenCalled();
      expect(transcriptionService.transcribe).toHaveBeenCalled();
      expect(textInjector.injectText).toHaveBeenCalledWith('Test message');
    });
  });
});
