/**
 * AppConfig Entity
 * Application configuration data types
 * Pure data types - no side effects
 */

export interface AppConfig {
  readonly stt: SttConfig;
  readonly postProcessing: PostProcessingConfig;
  readonly audio: AudioConfig;
  readonly storage: StorageConfig;
  readonly dictionary: DictionaryConfig;
}

export interface DictionaryConfig {
  readonly enabled: boolean;
  readonly path: string;
}

export interface SttConfig {
  readonly provider: 'groq';
  readonly model: string;
}

export interface PostProcessingConfig {
  readonly enabled: boolean;
  readonly provider: 'ollama';
  readonly model: string;
}

export interface AudioConfig {
  readonly sampleRate: number;
  readonly channels: number;
  readonly bitDepth: number;
}

export interface StorageConfig {
  readonly keepAudio: boolean;
  readonly transcriptionsPath: string;
}

// Default configuration
export const DEFAULT_CONFIG: AppConfig = {
  stt: {
    provider: 'groq',
    model: 'whisper-large-v3-turbo',
  },
  postProcessing: {
    enabled: false,
    provider: 'ollama',
    model: 'llama3.2',
  },
  audio: {
    sampleRate: 16000,
    channels: 1,
    bitDepth: 16,
  },
  storage: {
    keepAudio: true,
    transcriptionsPath: './storage/transcriptions',
  },
  dictionary: {
    enabled: true,
    path: './config/dictionary.json',
  },
} as const;

// Merge partial config with defaults
export const mergeConfig = (
  partial: Partial<AppConfig>
): AppConfig => ({
  stt: { ...DEFAULT_CONFIG.stt, ...partial.stt },
  postProcessing: { ...DEFAULT_CONFIG.postProcessing, ...partial.postProcessing },
  audio: { ...DEFAULT_CONFIG.audio, ...partial.audio },
  storage: { ...DEFAULT_CONFIG.storage, ...partial.storage },
  dictionary: { ...DEFAULT_CONFIG.dictionary, ...partial.dictionary },
});
