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

---

## Tutorial: Nuevas Funcionalidades

### 1. Teclas de Activación Configurables

Puedes personalizar qué teclas activan el dictado editando `config/jarvisConfig.json`:

```json
{
  "triggerKeys": {
    "rightOption": {
      "enabled": true,
      "keyNames": ["RIGHT ALT"],
      "action": "dictation",
      "description": "Right Option (⌥) - Primary dictation key"
    },
    "fn": {
      "enabled": true,
      "keyNames": ["FN", "FUNCTION", "GLOBE"],
      "action": "dictation",
      "description": "Fn/Globe key - May be intercepted by system"
    },
    "rightCommand": {
      "enabled": true,
      "keyNames": ["RIGHT META"],
      "action": "dictation",
      "description": "Right Command (⌘) - Alternative trigger"
    },
    "f19": {
      "enabled": false,
      "keyNames": ["F19"],
      "action": "dictation",
      "description": "F19 - For Karabiner users"
    }
  }
}
```

**Cómo configurar:**
- `enabled: true/false` - Activa o desactiva cada tecla
- `keyNames` - Nombres internos de la tecla (no modificar)
- Para usuarios de **Karabiner**, pueden habilitar F19 para usar un mapeo personalizado

---

### 2. Comandos de Puntuación por Voz

Di comandos de puntuación mientras dictas y se convertirán automáticamente:

| Comando | Resultado | Ejemplo |
|---------|-----------|---------|
| "punto" | `.` | "hola punto" → "hola." |
| "coma" | `,` | "uno coma dos" → "uno, dos" |
| "punto y coma" | `;` | "código punto y coma" → "código;" |
| "dos puntos" | `:` | "nota dos puntos" → "nota:" |
| "interrogación" | `?` | "cómo estás interrogación" → "cómo estás?" |
| "exclamación" | `!` | "genial exclamación" → "genial!" |
| "nuevo párrafo" | `↵↵` | Inserta salto de párrafo |
| "nueva línea" | `↵` | Inserta salto de línea |
| "puntos suspensivos" | `...` | "espera puntos suspensivos" → "espera..." |
| "guión" | `-` | "semi guión automático" → "semi-automático" |
| "arroba" | `@` | "email arroba gmail" → "email@gmail" |
| "abrir paréntesis" | `(` | Abre paréntesis |
| "cerrar paréntesis" | `)` | Cierra paréntesis |
| "abrir comillas" | `"` | Abre comillas |
| "cerrar comillas" | `"` | Cierra comillas |
| "abrir corchete" | `[` | Abre corchete |
| "cerrar corchete" | `]` | Cierra corchete |

**Ejemplo completo:**
> "Hola coma cómo estás interrogación nuevo párrafo Espero que bien punto"

Resultado:
```
Hola, cómo estás?

Espero que bien.
```

---

### 3. Diccionario Personalizado

El sistema incluye un diccionario para corregir términos técnicos automáticamente.

**Ubicación:** `config/dictionary.json`

#### Vocabulario Técnico
El diccionario incluye términos que Whisper debe reconocer correctamente:
- Cloud: AWS, Lambda, S3, EC2, DynamoDB, Kubernetes, Docker, Terraform
- Desarrollo: TypeScript, JavaScript, Node.js, React, Next.js, GraphQL
- Herramientas: VS Code, GitHub, Jira, Slack, Figma
- IA: GPT, Claude, LLM, RAG, OpenAI, Anthropic

#### Correcciones Automáticas
Corrige errores comunes de transcripción:

| Whisper dice | Se corrige a |
|--------------|--------------|
| "Lamda", "labda" | Lambda |
| "A W S", "a w s" | AWS |
| "github", "git hub" | GitHub |
| "typescript", "Typescript" | TypeScript |
| "node js", "NodeJS" | Node.js |
| "postgres", "Postgresql" | PostgreSQL |
| "kubernetis", "k 8 s" | Kubernetes |
| "dev ops", "Dev Ops" | DevOps |
| "ci cd", "CICD" | CI/CD |
| "vscode", "VSCode" | VS Code |

#### Agregar Términos Personalizados

Edita `config/dictionary.json`:

```json
{
  "vocabulary": {
    "terms": [
      "MiEmpresa",
      "NombreProyecto",
      "TerminoCustom"
    ]
  },
  "replacements": {
    "patterns": [
      { "from": "mi empresa", "to": "MiEmpresa" },
      { "from": "nombre proyecto", "to": "NombreProyecto" }
    ]
  }
}
```

---

### 4. Post-Procesamiento con Ollama (Opcional)

Usa un LLM local para mejorar la puntuación y gramática de las transcripciones.

#### Requisitos
1. Instalar [Ollama](https://ollama.ai)
2. Descargar un modelo: `ollama pull llama3.2`

#### Activar Post-Procesamiento

Edita `config/config.json`:

```json
{
  "postProcessing": {
    "enabled": true,
    "provider": "ollama",
    "model": "llama3.2"
  }
}
```

**Nota:** Esto añade latencia pero mejora significativamente la calidad del texto.

---

### 5. Historial de Transcripciones

Todas las transcripciones se guardan automáticamente para análisis posterior.

**Ubicación:** `storage/transcriptions/`

#### Configuración

En `config/config.json`:

```json
{
  "storage": {
    "keepAudio": true,
    "transcriptionsPath": "./storage/transcriptions"
  }
}
```

- `keepAudio: true` - Guarda también los archivos de audio
- `transcriptionsPath` - Carpeta donde se guardan los registros

#### Formato del Historial

Cada transcripción se guarda con:
- Timestamp
- Texto original de Whisper
- Texto procesado (después de diccionario y puntuación)
- Archivo de audio (si `keepAudio: true`)

---

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
