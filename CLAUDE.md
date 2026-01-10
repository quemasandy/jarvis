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

## Verification (IMPORTANT - Feedback Loop)

**ALWAYS run `npm run verify` after making code changes.** This is the feedback loop that ensures code quality.

```bash
npm run verify       # Run ALL checks: typecheck + lint + tests
```

The verify command runs these checks in order:
1. `npm run typecheck` - TypeScript type checking (no emit)
2. `npm run lint` - ESLint static analysis
3. `npm run test:run` - Vitest unit tests (99+ tests)

### Individual Commands

```bash
npm run typecheck     # Type check only
npm run lint          # Lint only
npm run lint:fix      # Lint and auto-fix
npm run test:run      # Run tests once
npm run test          # Run tests in watch mode
npm run test:coverage # Run tests with coverage report (must meet thresholds)
```

### Verification Rules

1. **After writing/editing code**: Run `npm run verify`
2. **If verify fails**: Fix the issues before considering the task complete
3. **If tests fail**: Analyze the error, fix the code, run verify again
4. **Before committing**: Pre-commit hook runs `npm run verify` automatically

### Coverage Thresholds

Coverage is enforced via `vitest.config.ts`. Current minimums:
- **Global**: 30% lines, 35% functions, 25% branches
- **application/types.ts**: 100% (pure logic)
- **domain/usecases/**: 90% (pure logic)

If you add code, add tests. If coverage drops below thresholds, `npm run test:coverage` will fail.

### Pre-commit Hook (Husky)

Commits are blocked if `npm run verify` fails. The hook is configured in `.husky/pre-commit`.

### Expected Output

When verification passes, you should see:
```
> npm run typecheck  ✓
> npm run lint       ✓ (no output = no errors)
> npm run test:run   ✓ 99 tests passed
```

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

1. Global keyboard listener detects Right Option key (or Fn, Right Command)
2. Key down → `controller.handleKeyPress()` → `audioRecorder.startRecording()`
3. Key up → `controller.handleKeyRelease()` → `audioRecorder.stopRecording()` → `textInjector.injectText()`
4. Text injected via clipboard + Cmd+V paste

## Configuration

- `config/config.json` - Audio settings, STT provider (Groq), optional Ollama post-processing
- `config/.env` - GROQ_API_KEY (copy from `.env.example`)
