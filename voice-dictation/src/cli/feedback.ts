#!/usr/bin/env ts-node
/**
 * CLI tool to provide feedback on transcriptions
 * Shows recent debug log entries and allows corrections
 * Usage: npm run feedback
 */

import * as fs from 'fs';
import * as readline from 'readline';
import { createHistoryService } from '../infrastructure/storage/HistoryService';
import { DebugLogEntry } from '../domain/entities/TranscriptionLog';
import { isOk } from '../application/types';

const HISTORY_DIR = './storage/history';
const AUDIO_DIR = './storage/audio';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (prompt: string): Promise<string> =>
  new Promise((resolve) => rl.question(prompt, resolve));

const playAudio = (audioPath: string): void => {
  if (fs.existsSync(audioPath)) {
    const { spawn } = require('child_process');
    spawn('afplay', [audioPath], { detached: true, stdio: 'ignore' });
  } else {
    console.log('   ⚠️  Audio no disponible (expirado)');
  }
};

const formatEntry = (entry: DebugLogEntry, index: number): string => {
  const date = new Date(entry.timestamp);
  const timeStr = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const audioStatus = entry.audioExists ? '🔊' : '🔇';
  const correctionStatus = entry.expectedText ? '✅' : '⬜';

  return `${index + 1}. [${timeStr}] ${audioStatus} ${correctionStatus} "${entry.text.substring(0, 50)}${entry.text.length > 50 ? '...' : ''}"`;
};

const main = async (): Promise<void> => {
  const historyService = createHistoryService({
    historyDir: HISTORY_DIR,
    audioDir: AUDIO_DIR,
    retentionHours: 24,
  });

  console.log('\n🔧 Feedback de Transcripciones\n');
  console.log('Este modo te permite corregir transcripciones incorrectas.');
  console.log('Los datos ayudan a mejorar el sistema.\n');
  console.log('━'.repeat(60));

  const result = await historyService.getDebugLog();

  if (!isOk(result)) {
    console.error(`❌ Error: ${result.error.message}`);
    rl.close();
    process.exit(1);
  }

  const entries = result.value;
  const pendingEntries = entries.filter(e => e.expectedText === null && e.audioExists);

  if (pendingEntries.length === 0) {
    console.log('\n  ✅ No hay transcripciones pendientes de revisión.');
    console.log('  Los audios se eliminan después de 24h.\n');
    rl.close();
    process.exit(0);
  }

  console.log(`\n📝 ${pendingEntries.length} transcripciones por revisar:\n`);

  for (let i = 0; i < pendingEntries.length; i++) {
    console.log(formatEntry(pendingEntries[i], i));
  }

  console.log('\n' + '━'.repeat(60));
  console.log('\nComandos:');
  console.log('  [número]  - Revisar y corregir esa transcripción');
  console.log('  p[número] - Reproducir audio (ej: p1)');
  console.log('  q         - Salir\n');

  const processCommand = async (): Promise<void> => {
    const input = await question('> ');
    const trimmed = input.trim().toLowerCase();

    if (trimmed === 'q' || trimmed === 'quit' || trimmed === 'exit') {
      console.log('\n👋 ¡Hasta luego!\n');
      rl.close();
      return;
    }

    // Play audio
    if (trimmed.startsWith('p')) {
      const num = parseInt(trimmed.substring(1), 10);
      if (num >= 1 && num <= pendingEntries.length) {
        const entry = pendingEntries[num - 1];
        console.log(`\n🔊 Reproduciendo audio...`);
        playAudio(entry.audioPath);
      } else {
        console.log('❌ Número inválido');
      }
      await processCommand();
      return;
    }

    // Select entry to correct
    const num = parseInt(trimmed, 10);
    if (num >= 1 && num <= pendingEntries.length) {
      const entry = pendingEntries[num - 1];

      console.log('\n' + '─'.repeat(60));
      console.log(`\n📄 Transcripción actual:`);
      console.log(`   "${entry.text}"\n`);
      console.log(`   App: ${entry.app}`);
      console.log(`   Idioma: ${entry.language}`);
      console.log(`   Latencia: ${entry.transcriptionLatencyMs}ms`);

      if (entry.audioExists) {
        console.log('\n   💡 Escribe "play" para reproducir el audio');
      }

      console.log('\n   Escribe el texto correcto (o Enter para omitir):');
      const correction = await question('   Corrección: ');

      if (correction.trim()) {
        const updateResult = await historyService.addCorrection(entry.id, correction.trim());
        if (isOk(updateResult)) {
          console.log('   ✅ Corrección guardada');
        } else {
          console.log(`   ❌ Error: ${updateResult.error.message}`);
        }
      } else if (correction.toLowerCase() === 'play' && entry.audioExists) {
        playAudio(entry.audioPath);
        console.log('   🔊 Reproduciendo...');
      }

      console.log('');
    } else if (trimmed !== '') {
      console.log('❌ Comando no reconocido');
    }

    await processCommand();
  };

  await processCommand();
};

main().catch((error) => {
  console.error('❌ Error:', error.message);
  rl.close();
  process.exit(1);
});
