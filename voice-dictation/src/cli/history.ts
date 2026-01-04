#!/usr/bin/env ts-node
/**
 * CLI tool to view transcription history
 * Usage: npm run history [--limit N]
 */

import { createHistoryService } from '../infrastructure/storage/HistoryService';
import { formatUserEntry } from '../domain/entities/TranscriptionLog';
import { isOk } from '../application/types';

const HISTORY_DIR = './storage/history';
const AUDIO_DIR = './storage/audio';

const main = async (): Promise<void> => {
  // Parse args
  const args = process.argv.slice(2);
  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1], 10) : 20;

  const historyService = createHistoryService({
    historyDir: HISTORY_DIR,
    audioDir: AUDIO_DIR,
    retentionHours: 24,
  });

  console.log('\n📜 Historial de Transcripciones\n');
  console.log('━'.repeat(60));

  const result = await historyService.getUserHistory(limit);

  if (!isOk(result)) {
    console.error(`❌ Error: ${result.error.message}`);
    process.exit(1);
  }

  const entries = result.value;

  if (entries.length === 0) {
    console.log('\n  No hay transcripciones en el historial.\n');
    console.log('  Usa la app para grabar y el historial aparecerá aquí.');
    process.exit(0);
  }

  for (const entry of entries) {
    console.log(formatUserEntry(entry));
  }

  console.log('━'.repeat(60));
  console.log(`\nMostrando ${entries.length} transcripciones más recientes.`);
  console.log('Usa --limit N para ver más.\n');
};

main().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
