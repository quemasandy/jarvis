# Voice Dictation for macOS

A productivity app to capture voice and convert it to text in any macOS application (Chrome, VSCode, etc.).

## Features

- **Hold Fn key** to start recording
- **Release Fn key** to stop and inject text
- Supports Spanish, English, and Spanglish
- Understands technical jargon (AWS, Lambda, TypeScript, etc.)
- Works in any application with text input

## Requirements

### System Requirements

- macOS 10.15 or later
- Node.js 18 or later

### Dependencies

Install `sox` for audio recording:

```bash
brew install sox
```

### macOS Permissions

Grant these permissions in System Preferences → Security & Privacy → Privacy:

1. **Accessibility** - Required for keyboard listening and text injection
2. **Microphone** - Required for audio recording

## Installation

```bash
# Clone and enter directory
cd voice-dictation

# Install dependencies
npm install

# Copy environment template and add your API key
cp config/.env.example config/.env
# Edit config/.env and add your GROQ_API_KEY
```

## Configuration

### Environment Variables (config/.env)

```
GROQ_API_KEY=your_groq_api_key_here
```

### App Settings (config/config.json)

```json
{
  "stt": {
    "provider": "groq",
    "model": "whisper-large-v3-turbo"
  },
  "audio": {
    "sampleRate": 16000,
    "channels": 1,
    "bitDepth": 16
  }
}
```

## Usage

```bash
# Development mode
npm run dev

# Build for production
npm run build
npm start
```

### How to Use

1. Start the app with `npm run dev`
2. Focus on any text input field (Chrome, VSCode, Notes, etc.)
3. **Hold** the Fn key (or Globe key on newer Macs)
4. Speak your text
5. **Release** the Fn key
6. Text appears at cursor position

## Architecture

This project follows Clean Architecture with functional programming principles:

```
src/
├── domain/          # Pure business logic
│   ├── entities/    # Data types
│   ├── ports/       # Interfaces
│   └── use-cases/   # Business operations
├── infrastructure/  # External implementations
│   ├── audio/       # Sox recorder
│   ├── injection/   # AppleScript text injection
│   └── ...
├── application/     # Orchestration layer
└── main.ts          # Entry point
```

## Troubleshooting

### "Permission denied" errors

Ensure the terminal app has Accessibility permissions in System Preferences.

### No audio recorded

Check that sox is installed and microphone permissions are granted.

### Text not appearing

Verify Accessibility permissions and that the target app accepts keyboard input.

## License

MIT
