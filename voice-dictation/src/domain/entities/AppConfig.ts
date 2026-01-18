/**
 * AppConfig Entity
 * Application configuration data types
 * Pure data types - no side effects
 */

// Trigger key action types - extensible for different voice input modes
export type TriggerAction = 'dictation' | 'translate-to-english';

export interface TriggerKeyConfig {
  readonly enabled: boolean;
  readonly keyNames: readonly string[];
  readonly action: TriggerAction;
  readonly description: string;
}

export interface TriggerKeysConfig {
  readonly rightOption: TriggerKeyConfig;
  readonly fn: TriggerKeyConfig;
  readonly rightCommand: TriggerKeyConfig;
}

export interface TranslationConfig {
  readonly enabled: boolean;
  readonly provider: 'ollama' | 'none';
  readonly model: string;
  readonly ollamaUrl: string;
  readonly timeoutMs: number;
}

export interface AppConfig {
  readonly triggerKeys: TriggerKeysConfig;
  readonly stt: SttConfig;
  readonly postProcessing: PostProcessingConfig;
  readonly translation: TranslationConfig;
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
  readonly provider: 'ollama' | 'none';
  readonly model: string;
  readonly ollamaUrl: string;
  readonly timeoutMs: number;
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
  triggerKeys: {
    rightOption: {
      enabled: true,
      keyNames: ['RIGHT ALT'],
      action: 'dictation',
      description: 'Right Option (⌥) - Primary dictation key',
    },
    fn: {
      enabled: true,
      keyNames: ['FN', 'FUNCTION', 'GLOBE'],
      action: 'dictation',
      description: 'Fn/Globe key - May be intercepted by system',
    },
    rightCommand: {
      enabled: true,
      keyNames: ['RIGHT META'],
      action: 'dictation',
      description: 'Right Command (⌘) - Alternative trigger',
    },
  },
  stt: {
    provider: 'groq',
    model: 'whisper-large-v3-turbo',
  },
  postProcessing: {
    enabled: false,
    provider: 'ollama',
    model: 'qwen2.5:3b',
    ollamaUrl: 'http://localhost:11434',
    timeoutMs: 30000, // 30s to handle cold-start model loading
  },
  translation: {
    enabled: true,
    provider: 'ollama',
    model: 'qwen2.5:3b',
    ollamaUrl: 'http://localhost:11434',
    timeoutMs: 30000, // 30s to handle cold-start model loading
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
  triggerKeys: {
    rightOption: { ...DEFAULT_CONFIG.triggerKeys.rightOption, ...partial.triggerKeys?.rightOption },
    fn: { ...DEFAULT_CONFIG.triggerKeys.fn, ...partial.triggerKeys?.fn },
    rightCommand: { ...DEFAULT_CONFIG.triggerKeys.rightCommand, ...partial.triggerKeys?.rightCommand },
  },
  stt: { ...DEFAULT_CONFIG.stt, ...partial.stt },
  postProcessing: { ...DEFAULT_CONFIG.postProcessing, ...partial.postProcessing },
  translation: { ...DEFAULT_CONFIG.translation, ...partial.translation },
  audio: { ...DEFAULT_CONFIG.audio, ...partial.audio },
  storage: { ...DEFAULT_CONFIG.storage, ...partial.storage },
  dictionary: { ...DEFAULT_CONFIG.dictionary, ...partial.dictionary },
});

// Helper: Get all enabled trigger key names as a flat array
export const getEnabledTriggerKeyNames = (config: AppConfig): string[] => {
  const { triggerKeys } = config;
  const allKeys: string[] = [];

  if (triggerKeys.rightOption.enabled) {
    allKeys.push(...triggerKeys.rightOption.keyNames);
  }
  if (triggerKeys.fn.enabled) {
    allKeys.push(...triggerKeys.fn.keyNames);
  }
  if (triggerKeys.rightCommand.enabled) {
    allKeys.push(...triggerKeys.rightCommand.keyNames);
  }

  return allKeys;
};
