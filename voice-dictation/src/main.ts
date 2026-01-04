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
  console.log('   2. Mantén presionada la tecla Fn (o Globe)');
  console.log('   3. Habla tu texto');
  console.log('   4. Suelta Fn para insertar el texto');
  console.log('');
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

  // Track Fn key state to handle press/release correctly
  let fnPressed = false;

  keyboard.addListener((event) => {
    // The Fn key on macOS is typically reported as "FN" or "FUNCTION"
    // On newer Macs with Globe key, it might be "GLOBE"
    const keyName = event.name?.toUpperCase() || '';
    const isFnKey = keyName === 'FN' || keyName === 'FUNCTION' || keyName === 'GLOBE';

    if (!isFnKey) {
      return;
    }

    if (event.state === 'DOWN' && !fnPressed) {
      fnPressed = true;
      controller.handleKeyPress().catch((err) => {
        console.error('❌ Error en handleKeyPress:', err);
      });
    } else if (event.state === 'UP' && fnPressed) {
      fnPressed = false;
      controller.handleKeyRelease().catch((err) => {
        console.error('❌ Error en handleKeyRelease:', err);
      });
    }
  });

  printInstructions();
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
