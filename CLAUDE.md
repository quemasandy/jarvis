# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Voice Dictation for macOS - a productivity app that captures voice and converts it to text in any macOS application. Currently MVP (v0.1.0) with placeholder transcription.

## Commands

```bash
npm run dev          # Run with ts-node (recommended for development)
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled JavaScript

DEBUG_KEYS=1 npm run dev  # Debug mode - shows all keyboard events
```

All commands run from the `voice-dictation/` directory.

### External Dependencies

- `sox` - Required for audio recording. Install: `brew install sox`
- macOS permissions: Accessibility, Input Monitoring, Microphone (granted to Terminal app)

## Architecture

Clean Architecture with functional programming:

```
voice-dictation/src/
├── domain/              # Pure business logic (no side effects)
│   ├── entities/        # Data types with factory functions
│   └── ports/           # Interfaces (IAudioRecorder, ITextInjector, etc.)
├── infrastructure/      # External implementations
│   ├── audio/           # SoxAudioRecorder - spawns sox subprocess
│   └── injection/       # AppleScriptTextInjector - uses osascript
├── application/         # Orchestration layer
│   ├── DictationController.ts  # Coordinates workflow
│   └── types.ts         # Result pattern for error handling
└── main.ts              # Entry point with keyboard listener
```

### Key Patterns

**Result Pattern** (`application/types.ts`): Use `Ok(value)` / `Err(error)` instead of exceptions. All domain operations return `Result<T, DictationError>`.

**Dependency Injection**: Factory functions accept dependencies. Example:
```typescript
const controller = createDictationController({ audioRecorder, textInjector });
```

**Ports and Adapters**: Domain defines interfaces in `ports/`, infrastructure implements them. Currently: `SoxAudioRecorder` implements `IAudioRecorder`, `AppleScriptTextInjector` implements `ITextInjector`.

### Workflow

1. Global keyboard listener detects Right Option key (or F19, Fn, Right Command)
2. Key down → `controller.handleKeyPress()` → `audioRecorder.startRecording()`
3. Key up → `controller.handleKeyRelease()` → `audioRecorder.stopRecording()` → `textInjector.injectText()`
4. Text injected via clipboard + Cmd+V paste

## Configuration

- `config/config.json` - Audio settings, STT provider (Groq), optional Ollama post-processing
- `config/.env` - GROQ_API_KEY (copy from `.env.example`)
