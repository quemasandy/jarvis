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
import { AppConfig, DEFAULT_CONFIG, mergeConfig, getEnabledTriggerKeyNames } from './domain/entities/AppConfig';

// Constants
const AUDIO_DIR = './storage/audio';
const HISTORY_DIR = './storage/history';
const RETENTION_HOURS = 24; // 1 day
const MODEL = 'whisper-large-v3-turbo';

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
  } catch (error) {
    console.warn('⚠️  Error loading jarvisConfig.json, using defaults');
  }

  return DEFAULT_CONFIG;
};

// Application factory (Functional DI)
const createApp = (
  transcriptionService?: ITranscriptionService,
  historyService?: HistoryService
) => {
  // Create infrastructure implementations
  const audioRecorder = createSoxAudioRecorder(AUDIO_DIR);
  const textInjector = createAppleScriptTextInjector();

  // Create application controller with dependencies
  const controller = createDictationController({
    audioRecorder,
    textInjector,
    transcriptionService,
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

  // Check Groq API key
  const groqApiKey = env.GROQ_API_KEY || process.env.GROQ_API_KEY || '';
  const hasValidKey = await checkGroqApiKey(groqApiKey);

  let transcriptionService: ITranscriptionService | undefined;

  if (hasValidKey) {
    console.log('✅ Groq API key configurada - Transcripción ACTIVADA');
    transcriptionService = createGroqTranscriptionService({
      apiKey: groqApiKey,
      model: MODEL,
    });
  } else {
    console.warn('⚠️  Groq API key no configurada - Modo SIMULACIÓN');
    console.warn('   Configura GROQ_API_KEY en config/.env para transcripción real');
  }

  console.log('');
  return { ok: true, transcriptionService, historyService, config };
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
  if (triggerKeys.f19.enabled) enabledKeys.push('F19');

  const primaryKey = enabledKeys[0] || 'Right Option (⌥)';
  const otherKeys = enabledKeys.slice(1);

  console.log('📖 Instrucciones:');
  console.log('   1. Enfoca cualquier campo de texto (Chrome, VSCode, etc.)');
  console.log(`   2. Mantén presionada ${primaryKey} para grabar`);
  console.log('   3. Habla tu texto');
  console.log('   4. Suelta la tecla para insertar el texto');
  console.log('');
  if (otherKeys.length > 0) {
    console.log(`   💡 También funciona: ${otherKeys.join(', ')}`);
  }
  console.log('   ⚙️  Configura teclas en: config/jarvisConfig.json');
  console.log('   📊 Historial: npm run history | npm run stats');
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
  const { ok, transcriptionService, historyService, config } = await runStartupChecks(env, jarvisConfig);

  // Print banner after checks (so we know if transcription is enabled)
  printBanner(!!transcriptionService);

  if (!ok) {
    console.error('❌ Verificación de requisitos fallida. Abortando.\n');
    process.exit(1);
  }

  // Create application
  const { controller } = createApp(transcriptionService, historyService);

  // Setup keyboard listener
  const keyboard = new GlobalKeyboardListener();

  // Debug mode: set DEBUG_KEYS=1 to see all key events
  const debugKeys = process.env.DEBUG_KEYS === '1';

  // Track trigger key state
  let triggerPressed = false;

  // Get enabled trigger keys from configuration
  const TRIGGER_KEYS = getEnabledTriggerKeyNames(config);

  keyboard.addListener((event) => {
    const keyName = event.name?.toUpperCase() || '';
    const state = event.state;

    // Debug: show all key events
    if (debugKeys) {
      console.log(`🔑 Key: "${event.name}" (${keyName}) - State: ${state}`);
    }

    // Check if this is a trigger key
    const isTriggerKey = TRIGGER_KEYS.includes(keyName);

    if (!isTriggerKey) {
      return;
    }

    if (state === 'DOWN' && !triggerPressed) {
      triggerPressed = true;
      controller.handleKeyPress().catch((err) => {
        console.error('❌ Error en handleKeyPress:', err);
      });
    } else if (state === 'UP' && triggerPressed) {
      triggerPressed = false;
      controller.handleKeyRelease().catch((err) => {
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
