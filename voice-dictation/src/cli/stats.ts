#!/usr/bin/env ts-node
/**
 * CLI tool to view transcription statistics
 * Usage: npm run stats
 */

import { createHistoryService } from '../infrastructure/storage/HistoryService';
import { isOk } from '../application/types';

const HISTORY_DIR = './storage/history';
const AUDIO_DIR = './storage/audio';

const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
};

const main = async (): Promise<void> => {
  const historyService = createHistoryService({
    historyDir: HISTORY_DIR,
    audioDir: AUDIO_DIR,
    retentionHours: 24,
  });

  console.log('\n📊 Estadísticas de Voice Dictation\n');
  console.log('━'.repeat(50));

  const result = await historyService.getStats();

  if (!isOk(result)) {
    console.error(`❌ Error: ${result.error.message}`);
    process.exit(1);
  }

  const stats = result.value;

  // General stats
  console.log('\n📈 General');
  console.log(`   Total transcripciones: ${stats.totalTranscriptions}`);
  console.log(`   Tiempo total dictado:  ${formatDuration(stats.totalDurationMs)}`);
  console.log(`   Latencia promedio:     ${stats.averageLatencyMs}ms`);

  // Language breakdown
  console.log('\n🌐 Idiomas detectados');
  for (const [lang, count] of Object.entries(stats.languageBreakdown)) {
    const pct = Math.round((count / stats.totalTranscriptions) * 100);
    console.log(`   ${lang}: ${count} (${pct}%)`);
  }

  // App breakdown
  console.log('\n📱 Apps más usadas');
  const sortedApps = Object.entries(stats.appBreakdown)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);
  for (const [app, count] of sortedApps) {
    console.log(`   ${app}: ${count}`);
  }

  // Quality metrics
  console.log('\n🔍 Métricas de calidad');
  console.log(`   Correcciones realizadas: ${stats.correctionsCount}`);
  console.log(`   Errores de transcripción: ${stats.errorsCount}`);

  if (stats.totalTranscriptions > 0) {
    const errorRate = Math.round((stats.errorsCount / stats.totalTranscriptions) * 100);
    console.log(`   Tasa de error: ${errorRate}%`);
  }

  console.log('\n' + '━'.repeat(50));
  console.log('Usa "npm run feedback" para corregir transcripciones.\n');
};

main().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
