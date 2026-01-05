# Voice Dictation for macOS

A productivity app to capture voice and convert it to text in any macOS application (Chrome, VSCode, etc.).

## Features

- **Hold Right Option (⌥)** to start recording
- **Release** to stop and inject text
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

**IMPORTANTE**: Los permisos se dan a la **Terminal**, no a la app.

1. Abre **System Settings → Privacy & Security → Accessibility**
2. Click el candado 🔒 para desbloquear
3. Click **+** y agrega tu Terminal:
   - `/Applications/Utilities/Terminal.app` (Terminal nativa)
   - `/Applications/iTerm.app` (si usas iTerm2)
   - `/Applications/Warp.app` (si usas Warp)
4. Repite para **Input Monitoring** (mismo proceso)
5. Repite para **Microphone**

Si no encuentras la app, arrastra el icono desde Finder.

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
3. **Hold** the **Right Option (⌥)** key
4. Speak your text
5. **Release** the key
6. Text appears at cursor position

**Teclas alternativas soportadas:** Right Command, Fn (si no es interceptada)

### Debug Mode

Si las teclas no se detectan, ejecuta en modo debug:

```bash
DEBUG_KEYS=1 npm run dev
```

Esto mostrará todas las teclas presionadas para diagnosticar.

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

### Las teclas no se detectan

1. Ejecuta `DEBUG_KEYS=1 npm run dev` para ver qué teclas detecta
2. Verifica que tu **Terminal** tiene permisos en:
   - System Settings → Privacy & Security → **Input Monitoring**
   - System Settings → Privacy & Security → **Accessibility**
3. Reinicia la Terminal después de agregar permisos

### La tecla Fn no funciona

macOS intercepta la tecla Fn antes de que llegue a la app. Usa **Right Option (⌥)** como alternativa.

### "Permission denied" errors

Asegúrate que la Terminal tenga permisos de Accessibility.

### No audio recorded

Verifica que sox está instalado y que tienes permisos de Microphone.

### Text not appearing

Verifica permisos de Accessibility y que la app destino acepta input de teclado.

## License

MIT
