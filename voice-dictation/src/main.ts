/**
 * Voice Dictation for macOS
 * Entry point - sets up dependencies and keyboard listener
 */

import * as fs from 'fs';
import * as path from 'path';
import { GlobalKeyboardListener } from 'node-global-key-listener';
import { createSoxAudioRecorder, checkSoxInstalled } from './infrastructure/audio/SoxAudioRecorder';
import {
  createAppleScriptTextInjector,
  checkAccessibilityPermission,
} from './infrastructure/injection/AppleScriptTextInjector';
import {
  createGroqTranscriptionService,
  checkGroqApiKey,
} from './infrastructure/transcription/GroqTranscriptionService';
import { createHistoryService, HistoryService } from './infrastructure/storage/HistoryService';
import { createDictationController } from './application/DictationController';
import { isErr, isOk } from './application/types';
import { ITranscriptionService } from './domain/ports/ITranscriptionService';
import {
  CustomDictionary,
  EMPTY_DICTIONARY,
  parseDictionary,
} from './domain/entities/CustomDictionary';
import { AppConfig, DEFAULT_CONFIG, mergeConfig, getEnabledTriggerKeyNames, TriggerAction } from './domain/entities/AppConfig';
import { ITextProcessor } from './domain/ports/ITextProcessor';
import {
  createOllamaTextProcessor,
  checkOllamaAvailable,
  checkModelAvailable,
} from './infrastructure/processing/OllamaTextProcessor';
import { createOllamaTranslationService } from './infrastructure/processing/OllamaTranslationService';

// Constants
const AUDIO_DIR = './storage/audio';
const HISTORY_DIR = './storage/history';
const DICTIONARY_PATH = './config/dictionary.json';
const RETENTION_HOURS = 24; // 1 day
const MODEL = 'whisper-large-v3-turbo';

/**
 * Check Ollama availability with retry and exponential backoff
 * Useful when Ollama is starting up alongside the app
 */
const checkOllamaWithRetry = async (
  url: string,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<boolean> => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const available = await checkOllamaAvailable(url);
    if (available) return true;

    if (attempt < maxRetries - 1) {
      const delayMs = initialDelayMs * Math.pow(2, attempt); // 1s, 2s, 4s
      console.log(`   ⏳ Reintentando en ${delayMs / 1000}s... (${attempt + 2}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
};

/**
 * Load custom dictionary from JSON file
 */
const loadDictionary = (): CustomDictionary => {
  const dictPath = path.resolve(__dirname, '..', DICTIONARY_PATH);

  if (!fs.existsSync(dictPath)) {
    return EMPTY_DICTIONARY;
  }

  try {
    const content = fs.readFileSync(dictPath, 'utf-8');
    const data = JSON.parse(content);
    return parseDictionary(data);
  } catch (error) {
    console.warn('⚠️  Error loading dictionary:', error instanceof Error ? error.message : error);
    return EMPTY_DICTIONARY;
  }
};

/**
 * Load environment variables from config/.env
 */
const loadEnv = (): Record<string, string> => {
  const envPath = path.resolve(__dirname, '../config/.env');
  const env: Record<string, string> = {};

  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          env[key.trim()] = valueParts.join('=').trim();
        }
      }
    }
  }

  return env;
};

/**
 * Load jarvisConfig.json configuration
 */
const loadJarvisConfig = (): AppConfig => {
  const configPath = path.resolve(__dirname, '../config/jarvisConfig.json');

  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(content);
      return mergeConfig(parsed);
    }
  } catch {
    console.warn('⚠️  Error loading jarvisConfig.json, using defaults');
  }

  return DEFAULT_CONFIG;
};

// Application factory (Functional DI)
const createApp = (
  transcriptionService?: ITranscriptionService,
  historyService?: HistoryService,
  textProcessor?: ITextProcessor,
  translationService?: ITextProcessor
) => {
  // Create infrastructure implementations
  const audioRecorder = createSoxAudioRecorder(AUDIO_DIR);
  const textInjector = createAppleScriptTextInjector();

  // Create application controller with dependencies
  const controller = createDictationController({
    audioRecorder,
    textInjector,
    transcriptionService,
    textProcessor,
    translationService,
    historyService,
    model: MODEL,
  });

  return { controller };
};

// Startup checks
const runStartupChecks = async (env: Record<string, string>, config: AppConfig): Promise<{
  ok: boolean;
  transcriptionService?: ITranscriptionService;
  historyService?: HistoryService;
  textProcessor?: ITextProcessor;
  translationService?: ITextProcessor;
  config: AppConfig;
}> => {
  console.log('🔍 Verificando requisitos del sistema...\n');

  // Check sox installation
  const soxResult = await checkSoxInstalled();
  if (isErr(soxResult)) {
    console.error('❌ sox no está instalado');
    console.error('   Instala con: brew install sox\n');
    return { ok: false, config };
  }
  console.log(`✅ sox encontrado: ${soxResult.value}`);

  // Check accessibility permissions
  const hasAccessibility = await checkAccessibilityPermission();
  if (!hasAccessibility) {
    console.warn('⚠️  Permisos de Accessibility pueden ser requeridos');
    console.warn('   System Preferences → Security & Privacy → Privacy → Accessibility\n');
  } else {
    console.log('✅ Permisos de Accessibility verificados');
  }

  // Initialize history service
  const historyService = createHistoryService({
    historyDir: HISTORY_DIR,
    audioDir: AUDIO_DIR,
    retentionHours: RETENTION_HOURS,
  });

  // Run cleanup on startup
  const cleanupResult = await historyService.cleanup();
  if (isOk(cleanupResult)) {
    const { deletedAudioFiles, deletedDebugEntries } = cleanupResult.value;
    if (deletedAudioFiles > 0 || deletedDebugEntries > 0) {
      console.log(`🧹 Limpieza: ${deletedAudioFiles} audios, ${deletedDebugEntries} logs antiguos eliminados`);
    }
  }
  console.log('✅ Historial inicializado');

  // Load custom dictionary
  const dictionary = loadDictionary();
  if (dictionary.vocabulary.enabled && dictionary.vocabulary.terms.length > 0) {
    console.log(`✅ Diccionario cargado: ${dictionary.vocabulary.terms.length} términos`);
  }
  if (dictionary.replacements.enabled && dictionary.replacements.patterns.length > 0) {
    console.log(`✅ Reemplazos configurados: ${dictionary.replacements.patterns.length} patrones`);
  }

  // Check Groq API key
  const groqApiKey = env.GROQ_API_KEY || process.env.GROQ_API_KEY || '';
  const hasValidKey = await checkGroqApiKey(groqApiKey);

  let transcriptionService: ITranscriptionService | undefined;

  if (hasValidKey) {
    console.log('✅ Groq API key configurada - Transcripción ACTIVADA');
    transcriptionService = createGroqTranscriptionService({
      apiKey: groqApiKey,
      model: MODEL,
      dictionary: dictionary,
    });
  } else {
    console.warn('⚠️  Groq API key no configurada - Modo SIMULACIÓN');
    console.warn('   Configura GROQ_API_KEY en config/.env para transcripción real');
  }

  // Check Ollama for post-processing (if enabled)
  let textProcessor: ITextProcessor | undefined;

  if (config.postProcessing.enabled && config.postProcessing.provider === 'ollama') {
    const { ollamaUrl, model: ollamaModel, timeoutMs } = config.postProcessing;

    console.log('🔄 Verificando Ollama para post-procesamiento...');
    const ollamaAvailable = await checkOllamaWithRetry(ollamaUrl, 3, 1000);

    if (ollamaAvailable) {
      const modelAvailable = await checkModelAvailable(ollamaUrl, ollamaModel);

      if (modelAvailable) {
        console.log(`✅ Ollama disponible - Post-procesamiento ACTIVADO (${ollamaModel})`);
        textProcessor = createOllamaTextProcessor({
          ollamaUrl,
          model: ollamaModel,
          timeoutMs,
        });
      } else {
        console.warn(`⚠️  Modelo '${ollamaModel}' no encontrado en Ollama`);
        console.warn(`   Instala con: ollama pull ${ollamaModel}`);
      }
    } else {
      console.warn('⚠️  Ollama no disponible - Post-procesamiento DESACTIVADO');
      console.warn('   Instala con: brew install ollama && ollama serve');
    }
  }

  // Check Ollama for translation service (if enabled)
  let translationService: ITextProcessor | undefined;

  if (config.translation.enabled && config.translation.provider === 'ollama') {
    const { ollamaUrl, model: translationModel, timeoutMs } = config.translation;

    // Use retry if post-processing wasn't enabled or used different URL
    const needsRetry = !textProcessor;
    console.log('🔄 Verificando Ollama para traducción...');
    const ollamaAvailable = needsRetry
      ? await checkOllamaWithRetry(ollamaUrl, 3, 1000)
      : await checkOllamaAvailable(ollamaUrl);

    if (ollamaAvailable) {
      const modelAvailable = await checkModelAvailable(ollamaUrl, translationModel);

      if (modelAvailable) {
        console.log(`✅ Traducción al inglés ACTIVADA (${translationModel})`);
        translationService = createOllamaTranslationService({
          ollamaUrl,
          model: translationModel,
          timeoutMs,
        });
      } else {
        console.warn(`⚠️  Modelo de traducción '${translationModel}' no encontrado`);
        console.warn(`   Instala con: ollama pull ${translationModel}`);
      }
    } else {
      console.warn('⚠️  Ollama no disponible - Traducción DESACTIVADA');
    }
  }

  console.log('');
  return { ok: true, transcriptionService, historyService, textProcessor, translationService, config };
};

// Print startup banner
const printBanner = (hasTranscription: boolean): void => {
  const version = hasTranscription ? 'v0.3.0' : 'v0.1.0 (MVP)';
  const mode = hasTranscription ? '🎯 Transcripción Real' : '📝 Modo Simulación';

  console.log('');
  console.log('╔════════════════════════════════════════════╗');
  console.log('║       🎤 Voice Dictation for macOS         ║');
  console.log(`║              ${version.padEnd(20)}       ║`);
  console.log('╚════════════════════════════════════════════╝');
  console.log(`                 ${mode}`);
  console.log('');
};

// Print usage instructions
const printInstructions = (config: AppConfig): void => {
  const { triggerKeys } = config;
  const enabledKeys: string[] = [];

  if (triggerKeys.rightOption.enabled) enabledKeys.push('Right Option (⌥)');
  if (triggerKeys.fn.enabled) enabledKeys.push('Fn/Globe');
  if (triggerKeys.rightCommand.enabled) enabledKeys.push('Right Command (⌘)');

  const primaryKey = enabledKeys[0] || 'Right Option (⌥)';
  const otherKeys = enabledKeys.slice(1);

  console.log('📖 Instrucciones:');
  console.log('   1. Enfoca cualquier campo de texto (Chrome, VSCode, etc.)');
  console.log(`   2. Mantén presionada ${primaryKey} para grabar`);
  console.log('   3. Habla tu texto');
  console.log('   4. Suelta la tecla para insertar el texto');
  console.log('');
  console.log('   ✨ Modo calidad: Por defecto usa Ollama (~5-8s)');
  console.log('   ⚡ Modo rápido: Shift + tecla → solo transcribe (~1-2s)');
  console.log('');
  if (otherKeys.length > 0) {
    console.log(`   💡 También funciona: ${otherKeys.join(', ')}`);
  }
  console.log('   ⚙️  Configura teclas en: config/jarvisConfig.json');
  console.log('   📊 Historial: npm run history | npm run stats');
  console.log('   💬 Feedback: npm run feedback');
  console.log('   Presiona Ctrl+C para salir');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
};

// Main function
const main = async (): Promise<void> => {
  // Load environment variables and configuration
  const env = loadEnv();
  const jarvisConfig = loadJarvisConfig();

  // Run startup checks
  const { ok, transcriptionService, historyService, textProcessor, translationService, config } = await runStartupChecks(env, jarvisConfig);

  // Print banner after checks (so we know if transcription is enabled)
  printBanner(!!transcriptionService);

  if (!ok) {
    console.error('❌ Verificación de requisitos fallida. Abortando.\n');
    process.exit(1);
  }

  // Create application
  const { controller } = createApp(transcriptionService, historyService, textProcessor, translationService);

  // Setup keyboard listener
  const keyboard = new GlobalKeyboardListener();

  // Debug mode: set DEBUG_KEYS=1 to see all key events
  const debugKeys = process.env.DEBUG_KEYS === '1';

  // Track trigger key state and which key was pressed
  let triggerPressed = false;
  let activeAction: TriggerAction = 'dictation';
  let shiftPressed = false; // Track Shift for quality mode (useOllama)

  // Get enabled trigger keys from configuration
  const TRIGGER_KEYS = getEnabledTriggerKeyNames(config);

  // Helper to get action for a key name
  const getActionForKey = (keyName: string): TriggerAction => {
    const { triggerKeys } = config;

    if (triggerKeys.rightOption.enabled && triggerKeys.rightOption.keyNames.includes(keyName)) {
      return triggerKeys.rightOption.action;
    }
    if (triggerKeys.fn.enabled && triggerKeys.fn.keyNames.includes(keyName)) {
      return triggerKeys.fn.action;
    }
    if (triggerKeys.rightCommand.enabled && triggerKeys.rightCommand.keyNames.includes(keyName)) {
      return triggerKeys.rightCommand.action;
    }

    return 'dictation'; // Default fallback
  };

  keyboard.addListener((event) => {
    const keyName = event.name?.toUpperCase() || '';
    const state = event.state;

    // Debug: show all key events
    if (debugKeys) {
      console.log(`🔑 Key: "${event.name}" (${keyName}) - State: ${state}`);
    }

    // Track Shift state for quality mode (useOllama)
    if (keyName === 'LEFT SHIFT' || keyName === 'RIGHT SHIFT') {
      shiftPressed = state === 'DOWN';
      if (debugKeys) {
        console.log(`⇧ Shift: ${shiftPressed ? 'pressed' : 'released'}`);
      }
      return;
    }

    // Check if this is a trigger key
    const isTriggerKey = TRIGGER_KEYS.includes(keyName);

    if (!isTriggerKey) {
      return;
    }

    if (state === 'DOWN' && !triggerPressed) {
      triggerPressed = true;
      activeAction = getActionForKey(keyName);

      if (debugKeys) {
        console.log(`📋 Action: ${activeAction}, useOllama: ${shiftPressed}`);
      }

      controller.handleKeyPress().catch((err) => {
        console.error('❌ Error en handleKeyPress:', err);
      });
    } else if (state === 'UP' && triggerPressed) {
      triggerPressed = false;
      // Pass !shiftPressed as useOllama: Shift held = light mode (skip Ollama)
      controller.handleKeyRelease(activeAction, !shiftPressed).catch((err) => {
        console.error('❌ Error en handleKeyRelease:', err);
      });
    }
  });

  printInstructions(config);

  if (debugKeys) {
    console.log('🐛 DEBUG MODE: Mostrando todas las teclas presionadas\n');
  }

  console.log('🚀 Voice Dictation iniciado - Esperando input...\n');

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n👋 Cerrando Voice Dictation...');
    keyboard.kill();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n\n👋 Cerrando Voice Dictation...');
    keyboard.kill();
    process.exit(0);
  });

  // Keep process alive
  process.stdin.resume();
};

// Run the app
main().catch((error) => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});
