/**
 * DictationController
 * Orchestrates the dictation workflow
 * Receives dependencies via constructor (manual DI)
 */

import { spawn } from 'child_process';
import { IAudioRecorder } from '../domain/ports/IAudioRecorder';
import { ITextInjector } from '../domain/ports/ITextInjector';
import { ITranscriptionService } from '../domain/ports/ITranscriptionService';
import { ITextProcessor } from '../domain/ports/ITextProcessor';
import { AudioRecording, formatDuration, getFilename } from '../domain/entities/AudioRecording';
import { Transcription, getFinalText } from '../domain/entities/Transcription';
// Removed: processPunctuationCommands - user doesn't use punctuation commands
import { TranscriptionLogData } from '../domain/entities/TranscriptionLog';
import { HistoryService } from '../infrastructure/storage/HistoryService';
import { TriggerAction } from '../domain/entities/AppConfig';
import { isOk, isErr, match } from './types';

// Sound effect for text injection confirmation (macOS system sound)
const SOUND_INJECT = '/System/Library/Sounds/Glass.aiff';

interface DictationControllerDeps {
  readonly audioRecorder: IAudioRecorder;
  readonly textInjector: ITextInjector;
  readonly transcriptionService?: ITranscriptionService;
  readonly textProcessor?: ITextProcessor;
  readonly translationService?: ITextProcessor;
  readonly historyService?: HistoryService;
  readonly model?: string;
}

interface DictationController {
  readonly handleKeyPress: () => Promise<void>;
  readonly handleKeyRelease: (action?: TriggerAction, useOllama?: boolean) => Promise<void>;
  readonly isRecording: () => boolean;
}

/**
 * Create a DictationController instance
 * Factory function with manual dependency injection
 */
export const createDictationController = (deps: DictationControllerDeps): DictationController => {
  const {
    audioRecorder,
    textInjector,
    transcriptionService,
    textProcessor,
    translationService,
    historyService,
    model = 'whisper-large-v3-turbo',
  } = deps;

  // Play sound effect (non-blocking)
  const playSound = (soundPath: string): void => {
    spawn('afplay', [soundPath], { detached: true, stdio: 'ignore' });
  };

  const handleKeyPress = async (): Promise<void> => {
    // Don't start if already recording
    if (audioRecorder.isRecording()) {
      console.log('⚠️  Already recording, ignoring key press');
      return;
    }

    console.log('🎤 Iniciando grabación...');

    const result = await audioRecorder.startRecording();

    match(result, {
      onSuccess: () => {
        console.log('🔴 Grabando... (suelta la tecla para detener)');
      },
      onFailure: (error) => {
        console.error(`❌ Error al iniciar grabación: ${error.message}`);
        if (error.code === 'SOX_NOT_INSTALLED') {
          console.error('   Instala sox con: brew install sox');
        }
      },
    });
  };

  const handleKeyRelease = async (
    action: TriggerAction = 'dictation',
    useOllama: boolean = false
  ): Promise<void> => {
    // Don't stop if not recording
    if (!audioRecorder.isRecording()) {
      return;
    }

    // Timing metrics for performance analysis
    const metrics = {
      total: Date.now(),
      stopRecording: 0,
      getActiveApp: 0,
      transcription: 0,
      postProcessing: 0,
      injection: 0,
    };

    console.log('⏸️  Deteniendo grabación...');

    // Parallelize stopRecording and getActiveApp for better performance
    const stopStart = Date.now();
    const [result, appResult] = await Promise.all([
      audioRecorder.stopRecording(),
      textInjector.getActiveApp(),
    ]);
    metrics.stopRecording = Date.now() - stopStart;
    metrics.getActiveApp = metrics.stopRecording; // Both ran in parallel, so same time

    if (isErr(result)) {
      console.error(`❌ Error al detener grabación: ${result.error.message}`);
      return;
    }

    const recording = result.value;
    const duration = formatDuration(recording);
    const filename = getFilename(recording);
    const activeApp = isOk(appResult) ? appResult.value : 'unknown';

    console.log(`✅ Audio guardado: ${recording.filePath}`);
    console.log(`   Duración: ${duration}`);

    // Track transcription timing
    const transcriptionStartTime = Date.now();

    // Get text to inject (transcription or simulated)
    let textToInject: string;
    let transcription: Transcription | null = null;
    let transcriptionError: string | undefined;

    const transcriptionStart = Date.now();
    if (transcriptionService) {
      // Real transcription mode
      console.log('🔄 Transcribiendo audio...');

      const transcribeResult = await transcriptionService.transcribe(recording);
      metrics.transcription = Date.now() - transcriptionStart;

      if (isErr(transcribeResult)) {
        transcriptionError = transcribeResult.error.message;
        console.error(`❌ Error de transcripción: ${transcriptionError}`);
        textToInject = `[Error de transcripción - ${filename}]`;
      } else {
        transcription = transcribeResult.value;
        const rawText = getFinalText(transcription);

        if (rawText.trim() === '') {
          console.log('⚠️  No se detectó audio/habla');
          // Still log to history (empty transcription) - fire-and-forget
          logToHistory(
            recording,
            '',
            activeApp,
            transcriptionStartTime,
            transcription,
            transcriptionError
          ).catch((err) => console.warn(`⚠️ Error guardando historial: ${err.message}`));
          return;
        }

        console.log(`✅ Transcripción completada (${transcription.language})`);

        // Branch based on action type and useOllama flag
        const postProcessStart = Date.now();

        if (action === 'translate-to-english') {
          // Translation mode: translate to English
          textToInject = rawText.trim();

          // Only translate if useOllama is true (Shift held)
          if (useOllama && translationService) {
            console.log('🌐 Traduciendo al inglés...');
            const translationResult = await translationService.process(textToInject);
            if (isOk(translationResult)) {
              textToInject = translationResult.value;
              console.log('✅ Traducción completada');
            } else {
              console.warn(`⚠️  Traducción falló: ${translationResult.error.message}`);
              // Continue with original text (graceful fallback)
            }
          } else if (!useOllama) {
            console.log('⚡ Modo rápido: sin traducción');
          } else {
            console.warn('⚠️  Servicio de traducción no disponible');
          }
        } else {
          // Dictation mode: direct text or optional post-processing with LLM
          textToInject = rawText.trim();

          // Only post-process if useOllama is true (Shift held)
          if (useOllama && textProcessor) {
            console.log('🤖 Mejorando texto con LLM...');
            const processedResult = await textProcessor.process(textToInject);
            if (isOk(processedResult)) {
              textToInject = processedResult.value;
              console.log('✅ Texto mejorado');
            } else {
              console.warn(`⚠️  Post-procesamiento falló: ${processedResult.error.message}`);
              // Continue with original text (graceful fallback)
            }
          } else if (!useOllama) {
            console.log('⚡ Modo rápido: sin post-procesamiento');
          }
        }
        metrics.postProcessing = Date.now() - postProcessStart;
      }
    } else {
      // MVP mode: simulated text
      textToInject = `[Audio grabado: ${duration} - ${filename}]`;
    }

    // Small delay before injecting text (UX improvement)
    await delay(200);

    console.log(`📝 Inyectando texto en: ${activeApp}`);

    const injectionStart = Date.now();
    const injectResult = await textInjector.injectText(textToInject);
    metrics.injection = Date.now() - injectionStart;

    match(injectResult, {
      onSuccess: () => {
        playSound(SOUND_INJECT);
        console.log('✅ Texto inyectado correctamente');
        const preview =
          textToInject.length > 100 ? textToInject.substring(0, 100) + '...' : textToInject;
        console.log(`   "${preview}"`);
      },
      onFailure: (error) => {
        console.error(`❌ Error al inyectar texto: ${error.message}`);
        if (error.code === 'PERMISSION_DENIED') {
          console.error('   Habilita Accessibility en System Preferences');
        }
      },
    });

    // Log timing metrics for performance analysis
    const totalTime = Date.now() - metrics.total;
    console.log(`⏱️  Tiempos: stop=${metrics.stopRecording}ms, stt=${metrics.transcription}ms, llm=${metrics.postProcessing}ms, inject=${metrics.injection}ms, total=${totalTime}ms`);

    // Log to history (fire-and-forget for better performance)
    logToHistory(
      recording,
      textToInject,
      activeApp,
      transcriptionStartTime,
      transcription,
      transcriptionError
    ).catch((err) => console.warn(`⚠️ Error guardando historial: ${err.message}`));

    console.log('---');
  };

  /**
   * Log transcription to history service
   */
  const logToHistory = async (
    recording: AudioRecording,
    text: string,
    app: string,
    startTime: number,
    transcription: Transcription | null,
    error?: string
  ): Promise<void> => {
    if (!historyService) return;

    const logData: TranscriptionLogData = {
      transcriptionId: transcription?.id || recording.id,
      audioPath: recording.filePath,
      text: text.trim(),
      app,
      durationMs: recording.durationMs,
      language: transcription?.language || 'unknown',
      transcriptionLatencyMs: Date.now() - startTime,
      model,
      error,
    };

    const logResult = await historyService.logTranscription(logData);

    if (isErr(logResult)) {
      console.warn(`⚠️  No se pudo guardar en historial: ${logResult.error.message}`);
    }
  };

  const isRecording = (): boolean => audioRecorder.isRecording();

  return {
    handleKeyPress,
    handleKeyRelease,
    isRecording,
  };
};

// Helper function for delays
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
