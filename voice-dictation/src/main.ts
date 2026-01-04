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
import { createDictationController } from './application/DictationController';
import { isErr } from './application/types';
import { ITranscriptionService } from './domain/ports/ITranscriptionService';

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

// Application factory (Functional DI)
const createApp = (transcriptionService?: ITranscriptionService) => {
  // Create infrastructure implementations
  const audioRecorder = createSoxAudioRecorder('./storage/audio');
  const textInjector = createAppleScriptTextInjector();

  // Create application controller with dependencies
  const controller = createDictationController({
    audioRecorder,
    textInjector,
    transcriptionService,
  });

  return { controller };
};

// Startup checks
const runStartupChecks = async (env: Record<string, string>): Promise<{
  ok: boolean;
  transcriptionService?: ITranscriptionService;
}> => {
  console.log('🔍 Verificando requisitos del sistema...\n');

  // Check sox installation
  const soxResult = await checkSoxInstalled();
  if (isErr(soxResult)) {
    console.error('❌ sox no está instalado');
    console.error('   Instala con: brew install sox\n');
    return { ok: false };
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

  // Check Groq API key
  const groqApiKey = env.GROQ_API_KEY || process.env.GROQ_API_KEY || '';
  const hasValidKey = await checkGroqApiKey(groqApiKey);

  let transcriptionService: ITranscriptionService | undefined;

  if (hasValidKey) {
    console.log('✅ Groq API key configurada - Transcripción ACTIVADA');
    transcriptionService = createGroqTranscriptionService({
      apiKey: groqApiKey,
    });
  } else {
    console.warn('⚠️  Groq API key no configurada - Modo SIMULACIÓN');
    console.warn('   Configura GROQ_API_KEY en config/.env para transcripción real');
  }

  console.log('');
  return { ok: true, transcriptionService };
};

// Print startup banner
const printBanner = (hasTranscription: boolean): void => {
  const version = hasTranscription ? 'v0.2.0' : 'v0.1.0 (MVP)';
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
const printInstructions = (): void => {
  console.log('📖 Instrucciones:');
  console.log('   1. Enfoca cualquier campo de texto (Chrome, VSCode, etc.)');
  console.log('   2. Mantén presionada RIGHT OPTION (⌥) para grabar');
  console.log('   3. Habla tu texto');
  console.log('   4. Suelta la tecla para insertar el texto');
  console.log('');
  console.log('   💡 También funciona: Fn, F19, Right Command');
  console.log('   Presiona Ctrl+C para salir');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
};

// Main function
const main = async (): Promise<void> => {
  // Load environment variables
  const env = loadEnv();

  // Run startup checks
  const { ok, transcriptionService } = await runStartupChecks(env);

  // Print banner after checks (so we know if transcription is enabled)
  printBanner(!!transcriptionService);

  if (!ok) {
    console.error('❌ Verificación de requisitos fallida. Abortando.\n');
    process.exit(1);
  }

  // Create application
  const { controller } = createApp(transcriptionService);

  // Setup keyboard listener
  const keyboard = new GlobalKeyboardListener();

  // Debug mode: set DEBUG_KEYS=1 to see all key events
  const debugKeys = process.env.DEBUG_KEYS === '1';

  // Track trigger key state
  let triggerPressed = false;

  // Trigger keys: Right Option is most reliable on macOS
  // Fn/Globe is often intercepted by the system
  const TRIGGER_KEYS = [
    'RIGHT ALT',      // Right Option key
    'RIGHT META',     // Right Command (alternative)
    'FN',             // Fn key (may not work)
    'FUNCTION',       // Fn alternative name
    'GLOBE',          // Globe key on newer Macs
    'F19',            // F19 (good for Karabiner users)
  ];

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

  printInstructions();

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
