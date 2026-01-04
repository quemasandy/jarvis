/**
 * Voice Dictation for macOS
 * Entry point - sets up dependencies and keyboard listener
 */

import { GlobalKeyboardListener } from 'node-global-key-listener';
import { createSoxAudioRecorder, checkSoxInstalled } from './infrastructure/audio/SoxAudioRecorder';
import {
  createAppleScriptTextInjector,
  checkAccessibilityPermission,
} from './infrastructure/injection/AppleScriptTextInjector';
import { createDictationController } from './application/DictationController';
import { isErr } from './application/types';

// Application factory (Functional DI)
const createApp = () => {
  // Create infrastructure implementations
  const audioRecorder = createSoxAudioRecorder('./storage/audio');
  const textInjector = createAppleScriptTextInjector();

  // Create application controller with dependencies
  const controller = createDictationController({
    audioRecorder,
    textInjector,
  });

  return { controller };
};

// Startup checks
const runStartupChecks = async (): Promise<boolean> => {
  console.log('🔍 Verificando requisitos del sistema...\n');

  // Check sox installation
  const soxResult = await checkSoxInstalled();
  if (isErr(soxResult)) {
    console.error('❌ sox no está instalado');
    console.error('   Instala con: brew install sox\n');
    return false;
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

  console.log('');
  return true;
};

// Print startup banner
const printBanner = (): void => {
  console.log('');
  console.log('╔════════════════════════════════════════════╗');
  console.log('║       🎤 Voice Dictation for macOS         ║');
  console.log('║              v0.1.0 (MVP)                   ║');
  console.log('╚════════════════════════════════════════════╝');
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
  console.log('   💡 También funciona: Fn, F19, Hyper');
  console.log('   Presiona Ctrl+C para salir');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
};

// Main function
const main = async (): Promise<void> => {
  printBanner();

  // Run startup checks
  const checksOk = await runStartupChecks();
  if (!checksOk) {
    console.error('❌ Verificación de requisitos fallida. Abortando.\n');
    process.exit(1);
  }

  // Create application
  const { controller } = createApp();

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
  console.log('💡 Tip: Si no detecta teclas, ejecuta: DEBUG_KEYS=1 npm run dev\n');

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
