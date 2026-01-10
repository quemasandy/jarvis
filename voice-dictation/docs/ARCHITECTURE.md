# Voice Dictation para macOS

## Documentación Completa de Arquitectura y Funcionamiento

---

## Parte 1: Visión General

### Qué es esta aplicación

Voice Dictation es una herramienta de productividad para macOS que te permite **dictar texto con tu voz** y tenerlo insertado automáticamente en cualquier aplicación. Funciona como un asistente invisible: mantén presionada una tecla, habla, y al soltar la tecla tu texto aparece donde tengas el cursor.

### El problema que resuelve

Escribir texto es lento comparado con hablar. Esta aplicación elimina la fricción de la transcripción de voz al:

1. **Ser instantánea** - No abres ninguna app, solo presionas una tecla
2. **Ser universal** - Funciona en cualquier campo de texto (Chrome, VSCode, Slack, etc.)
3. **Ser inteligente** - Procesa comandos de voz como "punto" → `.` y mejora el texto con IA

### Flujo de uso

```
┌─────────────────────────────────────────────────────────────────┐
│                         FLUJO DE USO                             │
└─────────────────────────────────────────────────────────────────┘

     Usuario                          Sistema
        │                                │
        │  1. Enfoca cualquier campo     │
        │     de texto (ej: Chrome)      │
        │                                │
        │  2. Presiona Right Option ──── │ ──► Inicia grabación
        │                                │     🔴 "Grabando..."
        │  3. Habla: "Hola punto         │
        │     Cómo estás interrogación"  │
        │                                │
        │  4. Suelta la tecla ────────── │ ──► Detiene grabación
        │                                │     📤 Envía a Groq
        │                                │     🤖 Procesa con Ollama
        │                                │     📝 Inyecta texto
        │                                │
        │  5. Ve el resultado: ◄──────── │
        │     "Hola. ¿Cómo estás?"       │
        └────────────────────────────────┘
```

---

## Parte 2: Pipeline de Procesamiento

El texto que dictas pasa por **4 etapas** antes de aparecer en pantalla:

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   1. AUDIO   │───►│  2. WHISPER  │───►│ 3. COMANDOS │───►│  4. OLLAMA   │
│   Grabación  │    │ Transcripción│    │  Puntuación  │    │ Post-proceso │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
      │                    │                   │                    │
      ▼                    ▼                   ▼                    ▼
    .wav               texto crudo         texto con           texto final
   (16kHz)             "hola punto"       puntuación            "Hola."
                                           "hola."
```

### Etapa 1: Grabación de Audio

**Tecnología:** `sox` (Sound eXchange) - herramienta de línea de comandos

```
Tu voz ──► Micrófono ──► sox ──► archivo .wav
                                 (16kHz, mono, 16-bit)
```

El sistema usa `sox` porque:
- Es ligero y no requiere frameworks pesados
- Produce archivos `.wav` optimizados para Whisper
- Se ejecuta como subproceso independiente

### Etapa 2: Transcripción con Whisper (Groq)

**Tecnología:** Groq Cloud API + Modelo `whisper-large-v3-turbo`

```
archivo.wav ──► Groq API ──► "hola punto cómo estás interrogación"
                    │
                    └─► Latencia: ~300ms (muy rápido)
```

Groq ejecuta Whisper en hardware especializado (LPUs), logrando transcripción casi instantánea.

### Etapa 3: Comandos de Puntuación

**Tecnología:** Procesador de texto puro (sin IA)

Tu voz natural es difícil de puntuar. Por eso puedes dictar comandos:

| Dices                | Resultado |
|---------------------|-----------|
| "punto"             | `.`       |
| "coma"              | `,`       |
| "interrogación"     | `?`       |
| "nueva línea"       | `↵`       |
| "nuevo párrafo"     | `↵↵`      |
| "abrir paréntesis"  | `(`       |
| "arroba"            | `@`       |

### Etapa 4: Mejora con Ollama (Opcional)

**Tecnología:** Ollama local + Modelo `qwen2.5:3b`

```
"hola como estas" ──► Ollama ──► "Hola, ¿cómo estás?"
                         │
                         └─► Añade: mayúsculas, puntuación faltante,
                             corrección de términos técnicos
```

Esta etapa es **opcional** y corre 100% en tu máquina (sin internet).

---

## Parte 3: Arquitectura de Software

### Clean Architecture

El código sigue **Clean Architecture**, separando responsabilidades en capas:

```
┌─────────────────────────────────────────────────────────────────┐
│                        CAPAS DE LA APLICACIÓN                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                           main.ts                                │
│                    (Punto de entrada)                            │
│         Configura dependencias y escucha teclado                 │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                             │
│                  (Orquestación)                                  │
├─────────────────────────────────────────────────────────────────┤
│  DictationController.ts                                          │
│  - Coordina el flujo: grabar → transcribir → procesar → inyectar│
│  - No conoce detalles de implementación                          │
│  - Recibe dependencias por inyección                             │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DOMAIN LAYER                                │
│                  (Lógica de negocio pura)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  entities/                    ports/ (interfaces)                │
│  ├── AudioRecording.ts        ├── IAudioRecorder.ts              │
│  ├── Transcription.ts         ├── ITextInjector.ts               │
│  ├── CustomDictionary.ts      ├── ITranscriptionService.ts       │
│  └── AppConfig.ts             └── ITextProcessor.ts              │
│                                                                  │
│  usecases/                                                       │
│  └── PunctuationCommandProcessor.ts                              │
│                                                                  │
│  ✓ Sin efectos secundarios (I/O, red, archivos)                  │
│  ✓ Funciones puras y testeables                                  │
│  ✓ Solo define QUÉ, no CÓMO                                      │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   INFRASTRUCTURE LAYER                           │
│                 (Implementaciones concretas)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  audio/                       injection/                         │
│  └── SoxAudioRecorder.ts      └── AppleScriptTextInjector.ts     │
│      (spawns sox process)         (usa osascript + clipboard)    │
│                                                                  │
│  transcription/               processing/                        │
│  └── GroqTranscriptionService └── OllamaTextProcessor.ts         │
│      (API de Groq)                (API local de Ollama)          │
│                                                                  │
│  storage/                                                        │
│  └── HistoryService.ts                                           │
│      (logs y cleanup)                                            │
│                                                                  │
│  ✗ Contiene efectos secundarios                                  │
│  ✗ Depende de herramientas externas                              │
│  ✓ Implementa interfaces del dominio                             │
└─────────────────────────────────────────────────────────────────┘
```

### Por qué esta arquitectura

| Beneficio | Explicación |
|-----------|-------------|
| **Testeable** | La lógica de negocio no depende de sox, Groq, o macOS |
| **Intercambiable** | Podrías cambiar Groq por OpenAI sin tocar el dominio |
| **Mantenible** | Cada capa tiene una responsabilidad clara |
| **Predecible** | Las funciones puras siempre dan el mismo resultado |

---

## Parte 4: Patrones de Programación

### Result Pattern (Manejo de errores sin excepciones)

En lugar de `try/catch`, el código usa un tipo `Result<T, E>` que representa éxito o fallo:

```typescript
// Definición del tipo
type Result<T, E> = Success<T> | Failure<E>;

// Uso
const result = await audioRecorder.startRecording();

if (isOk(result)) {
  console.log("Grabación iniciada");
} else {
  console.error(`Error: ${result.error.message}`);
}
```

**Ventajas:**
- Los errores son **explícitos** en el tipo de retorno
- No hay excepciones "escondidas" que puedan crashear
- El compilador te obliga a manejar los errores

### Factory Functions (Inyección de dependencias)

En lugar de clases con `new`, se usan funciones factory:

```typescript
// Factory que recibe dependencias
const createDictationController = (deps: {
  audioRecorder: IAudioRecorder;
  textInjector: ITextInjector;
  transcriptionService?: ITranscriptionService;
}) => {
  // ... implementación
  return { handleKeyPress, handleKeyRelease, isRecording };
};

// Uso
const controller = createDictationController({
  audioRecorder: createSoxAudioRecorder(),
  textInjector: createAppleScriptTextInjector(),
});
```

**Ventajas:**
- Fácil de testear (puedes pasar mocks)
- No hay estado global ni singletons
- Las dependencias son explícitas

### Ports and Adapters (Hexagonal)

El dominio define **interfaces** (ports), y la infraestructura las **implementa** (adapters):

```
┌─────────────────────────────────────────────────────────────────┐
│                      PORTS & ADAPTERS                            │
└─────────────────────────────────────────────────────────────────┘

         DOMINIO                            INFRAESTRUCTURA
    (Define interfaces)                  (Implementa interfaces)

   ┌─────────────────┐                  ┌─────────────────────┐
   │ IAudioRecorder  │ ◄──implements─── │ SoxAudioRecorder    │
   │ - startRecording│                  │ (usa sox CLI)       │
   │ - stopRecording │                  └─────────────────────┘
   └─────────────────┘

   ┌─────────────────┐                  ┌─────────────────────┐
   │ ITextInjector   │ ◄──implements─── │AppleScriptTextInjector
   │ - injectText    │                  │ (usa osascript)     │
   │ - getActiveApp  │                  └─────────────────────┘
   └─────────────────┘

   ┌─────────────────┐                  ┌─────────────────────┐
   │ITranscriptionSvc│ ◄──implements─── │GroqTranscriptionSvc │
   │ - transcribe    │                  │ (API cloud)         │
   └─────────────────┘                  └─────────────────────┘
```

---

## Parte 5: Flujo de Código Detallado

### Qué pasa cuando presionas la tecla

```
1. main.ts: GlobalKeyboardListener detecta "RIGHT ALT" DOWN
   │
   ▼
2. main.ts: Llama controller.handleKeyPress()
   │
   ▼
3. DictationController.handleKeyPress():
   │  - Verifica que no esté grabando
   │  - Llama audioRecorder.startRecording()
   │
   ▼
4. SoxAudioRecorder.startRecording():
   │  - Crea directorio storage/audio si no existe
   │  - Genera nombre único: recording_1704825600000.wav
   │  - Ejecuta: spawn('sox', ['-d', '-r', '16000', ...])
   │  - Reproduce sonido "Tink" (feedback auditivo)
   │  - Retorna Ok(undefined)
   │
   ▼
5. Consola muestra: "🔴 Grabando..."
```

### Qué pasa cuando sueltas la tecla

```
1. main.ts: GlobalKeyboardListener detecta "RIGHT ALT" UP
   │
   ▼
2. main.ts: Llama controller.handleKeyRelease()
   │
   ▼
3. DictationController.handleKeyRelease():
   │
   ├── 3a. audioRecorder.stopRecording()
   │       - Envía SIGTERM al proceso sox
   │       - Reproduce sonido "Pop"
   │       - Retorna Ok(AudioRecording { filePath, durationMs })
   │
   ├── 3b. transcriptionService.transcribe(recording)
   │       - Lee archivo .wav
   │       - POST a api.groq.com/v1/audio/transcriptions
   │       - Recibe: { text: "hola punto", language: "es" }
   │       - Aplica diccionario personalizado
   │       - Retorna Ok(Transcription { rawText, processedText })
   │
   ├── 3c. processPunctuationCommands(text)
   │       - "hola punto" → "hola."
   │       - Limpia espaciado alrededor de puntuación
   │
   ├── 3d. textProcessor.process(text) [si Ollama está activo]
   │       - POST a localhost:11434/api/generate
   │       - Prompt: "Corrige puntuación y mayúsculas..."
   │       - "hola." → "Hola."
   │
   └── 3e. textInjector.injectText("Hola.")
           - Guarda texto en clipboard con pbcopy
           - Ejecuta AppleScript: keystroke "v" using command down
           - El texto aparece donde está el cursor
```

---

## Parte 6: Estructura de Archivos

```
voice-dictation/
│
├── config/
│   ├── jarvisConfig.json    # Configuración principal
│   ├── dictionary.json      # Vocabulario personalizado
│   └── .env                  # GROQ_API_KEY (secreto)
│
├── storage/
│   ├── audio/               # Grabaciones temporales (.wav)
│   └── history/             # Logs de transcripciones
│
├── src/
│   ├── main.ts              # 🚀 Punto de entrada
│   │
│   ├── application/
│   │   ├── DictationController.ts  # Orquestador principal
│   │   └── types.ts                # Result pattern
│   │
│   ├── domain/
│   │   ├── entities/        # Tipos de datos puros
│   │   │   ├── AudioRecording.ts
│   │   │   ├── Transcription.ts
│   │   │   ├── CustomDictionary.ts
│   │   │   └── AppConfig.ts
│   │   │
│   │   ├── ports/           # Interfaces (contratos)
│   │   │   ├── IAudioRecorder.ts
│   │   │   ├── ITextInjector.ts
│   │   │   ├── ITranscriptionService.ts
│   │   │   └── ITextProcessor.ts
│   │   │
│   │   └── usecases/        # Lógica de negocio
│   │       └── PunctuationCommandProcessor.ts
│   │
│   ├── infrastructure/      # Implementaciones
│   │   ├── audio/
│   │   │   └── SoxAudioRecorder.ts
│   │   ├── injection/
│   │   │   └── AppleScriptTextInjector.ts
│   │   ├── transcription/
│   │   │   └── GroqTranscriptionService.ts
│   │   ├── processing/
│   │   │   └── OllamaTextProcessor.ts
│   │   └── storage/
│   │       └── HistoryService.ts
│   │
│   └── cli/                 # Comandos auxiliares
│       ├── history.ts
│       ├── stats.ts
│       └── feedback.ts
│
└── docs/
    └── ARCHITECTURE.md      # Este documento
```

---

## Parte 7: Dependencias Externas

### Diagrama de dependencias

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEPENDENCIAS EXTERNAS                         │
└─────────────────────────────────────────────────────────────────┘

                        Voice Dictation
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
   ┌─────────┐          ┌──────────┐          ┌──────────┐
   │   sox   │          │   Groq   │          │  Ollama  │
   │ (local) │          │ (cloud)  │          │ (local)  │
   └─────────┘          └──────────┘          └──────────┘
        │                     │                     │
        ▼                     ▼                     ▼
   Grabación            Transcripción         Post-proceso
   de audio             Whisper API           LLM local
        │                     │                     │
        │                     │                     │
        ▼                     ▼                     ▼
   ❌ No internet       ✅ Requiere           ❌ No internet
                           internet
```

### Resumen

| Dependencia | Tipo | Propósito | Instalación |
|------------|------|-----------|-------------|
| `sox` | CLI local | Grabar audio | `brew install sox` |
| `Groq API` | Cloud | Transcripción (Whisper) | Obtener API key en groq.com |
| `Ollama` | Servidor local | Mejorar texto con LLM | `brew install ollama` |
| `node-global-key-listener` | npm | Detectar teclas globalmente | Incluido en package.json |

---

## Parte 8: Configuración

### jarvisConfig.json

```json
{
  "triggerKeys": {
    "rightOption": {
      "enabled": true,
      "keyNames": ["RIGHT ALT"],
      "action": "dictation"
    }
  },
  "stt": {
    "provider": "groq",
    "model": "whisper-large-v3-turbo"
  },
  "postProcessing": {
    "enabled": true,
    "provider": "ollama",
    "model": "qwen2.5:3b",
    "ollamaUrl": "http://localhost:11434",
    "timeoutMs": 5000
  }
}
```

### Opciones de STT (Speech-to-Text)

| Opción | Internet | Velocidad | Costo |
|--------|----------|-----------|-------|
| `groq` (actual) | ✅ Sí | ~300ms | Gratis (con límites) |
| Whisper local (futuro) | ❌ No | ~2-5s | Gratis |

### Opciones de Post-procesamiento

| Opción | Internet | Velocidad | Calidad |
|--------|----------|-----------|---------|
| `ollama` (actual) | ❌ No | ~500ms-2s | Buena |
| Desactivado | N/A | 0ms | Sin mejoras |

---

## Parte 9: Cómo extender la aplicación

### Agregar un nuevo proveedor de transcripción

1. Crea un nuevo archivo en `infrastructure/transcription/`:

```typescript
// OpenAITranscriptionService.ts
import { ITranscriptionService } from '../../domain/ports/ITranscriptionService';

export const createOpenAITranscriptionService = (
  config: { apiKey: string }
): ITranscriptionService => {
  const transcribe = async (recording) => {
    // Implementación usando OpenAI Whisper API
  };
  return { transcribe };
};
```

2. Modifica `main.ts` para usarlo condicionalmente:

```typescript
const transcriptionService = config.stt.provider === 'openai'
  ? createOpenAITranscriptionService({ apiKey })
  : createGroqTranscriptionService({ apiKey });
```

### Agregar comandos de voz personalizados

Edita `PunctuationCommandProcessor.ts`:

```typescript
const PUNCTUATION_COMMANDS: readonly PunctuationCommand[] = [
  // Tus comandos personalizados
  { pattern: /\bemoji feliz\b/gi, replacement: '😊' },
  { pattern: /\bmi correo\b/gi, replacement: 'tu@email.com' },
  // ... comandos existentes
];
```

---

## Parte 10: Troubleshooting

### "sox no está instalado"

```bash
brew install sox
```

### "Groq API key no configurada"

1. Visita https://console.groq.com
2. Crea una API key
3. Guárdala en `config/.env`:
   ```
   GROQ_API_KEY=gsk_tu_clave_aqui
   ```

### "Ollama no disponible"

```bash
# Instalar
brew install ollama

# Iniciar servidor
ollama serve

# Descargar modelo
ollama pull qwen2.5:3b
```

### "El texto no se inserta"

Verifica permisos en System Preferences:
- Security & Privacy → Privacy → Accessibility → Terminal ✓
- Security & Privacy → Privacy → Input Monitoring → Terminal ✓

---

## Resumen

Voice Dictation es una aplicación modular que combina:

1. **Grabación local** (sox) - rápida y sin dependencias pesadas
2. **Transcripción en la nube** (Groq) - ultra-rápida con Whisper
3. **Procesamiento inteligente** (Ollama) - mejora el texto localmente
4. **Arquitectura limpia** - fácil de mantener y extender

El flujo es simple: **Tecla → Voz → Texto**, pero detrás hay un pipeline bien diseñado que maneja errores gracefully, separa responsabilidades, y permite intercambiar componentes fácilmente.

---

## Parte 11: Diagrama de Secuencia Detallado

### Flujo completo con tiempos

Este diagrama muestra exactamente qué componente se ejecuta y en qué orden, con tiempos aproximados:

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           DIAGRAMA DE SECUENCIA COMPLETO                             │
│                              (con tiempos estimados)                                 │
└─────────────────────────────────────────────────────────────────────────────────────┘

 Usuario      KeyListener     Controller      SoxRecorder      Groq API      Ollama      TextInjector
    │              │              │               │               │            │              │
    │  KEY DOWN    │              │               │               │            │              │
    ├─────────────►│              │               │               │            │              │
    │              │ handleKeyPress()             │               │            │              │
    │              ├─────────────►│               │               │            │              │
    │              │              │ startRecording()              │            │              │
    │              │              ├──────────────►│               │            │              │
    │              │              │               │               │            │              │
    │              │              │   ┌───────────┴───────────┐   │            │              │
    │              │              │   │ spawn('sox', args)    │   │            │              │
    │              │              │   │ 🔊 Play "Tink"        │   │            │              │
    │              │              │   └───────────┬───────────┘   │            │              │
    │              │              │               │               │            │              │
    │              │              │◄──────────────┤ Ok(void)      │            │              │
    │              │◄─────────────┤               │               │            │              │
    │              │              │               │               │            │              │
    │   ══════════════════════════════════════════════════════════════════════════════════   │
    │   ║                         USUARIO HABLANDO (~2-10 segundos)                      ║   │
    │   ══════════════════════════════════════════════════════════════════════════════════   │
    │              │              │               │               │            │              │
    │  KEY UP      │              │               │               │            │              │
    ├─────────────►│              │               │               │            │              │
    │              │ handleKeyRelease()           │               │            │              │
    │              ├─────────────►│               │               │            │              │
    │              │              │ stopRecording()               │            │              │
    │              │              ├──────────────►│               │            │              │
    │              │              │               │               │            │              │
    │              │              │   ┌───────────┴───────────┐   │            │              │
    │              │              │   │ kill(SIGTERM)         │   │            │              │
    │              │              │   │ 🔊 Play "Pop"         │   │            │              │
    │              │              │   │ (~100ms)              │   │            │              │
    │              │              │   └───────────┬───────────┘   │            │              │
    │              │              │               │               │            │              │
    │              │              │◄──────────────┤               │            │              │
    │              │              │  Ok(AudioRecording)           │            │              │
    │              │              │               │               │            │              │
    │              │              │ transcribe(recording)         │            │              │
    │              │              ├───────────────────────────────►            │              │
    │              │              │               │               │            │              │
    │              │              │   ┌───────────────────────────┴──┐         │              │
    │              │              │   │ POST /audio/transcriptions   │         │              │
    │              │              │   │ model: whisper-large-v3-turbo│         │              │
    │              │              │   │ (~300-500ms)                 │         │              │
    │              │              │   └───────────────────────────┬──┘         │              │
    │              │              │               │               │            │              │
    │              │              │◄──────────────────────────────┤            │              │
    │              │              │  Ok(Transcription)            │            │              │
    │              │              │               │               │            │              │
    │              │              │───────────────────────────────────────────►│              │
    │              │              │ process(text)                 │            │              │
    │              │              │               │               │            │              │
    │              │              │   ┌─────────────────────────────────────────┴──┐          │
    │              │              │   │ POST /api/generate                         │          │
    │              │              │   │ model: qwen2.5:3b                          │          │
    │              │              │   │ (~500-2000ms)                              │          │
    │              │              │   └─────────────────────────────────────────┬──┘          │
    │              │              │               │               │            │              │
    │              │              │◄──────────────────────────────────────────┤              │
    │              │              │  Ok(processedText)            │            │              │
    │              │              │               │               │            │              │
    │              │              │ delay(200ms)  │               │            │              │
    │              │              │───┐           │               │            │              │
    │              │              │   │           │               │            │              │
    │              │              │◄──┘           │               │            │              │
    │              │              │               │               │            │              │
    │              │              │ injectText(text)              │            │              │
    │              │              ├────────────────────────────────────────────────────────────►
    │              │              │               │               │            │              │
    │              │              │   ┌────────────────────────────────────────────────────────┴──┐
    │              │              │   │ osascript:                                                │
    │              │              │   │   set clipboard to "texto"                                │
    │              │              │   │   delay 0.1                                               │
    │              │              │   │   keystroke "v" using command down                        │
    │              │              │   │ (~200ms)                                                  │
    │              │              │   └────────────────────────────────────────────────────────┬──┘
    │              │              │               │               │            │              │
    │              │              │◄───────────────────────────────────────────────────────────┤
    │              │              │  Ok(void)     │               │            │              │
    │              │◄─────────────┤               │               │            │              │
    │◄─────────────┤              │               │               │            │              │
    │  TEXTO       │              │               │               │            │              │
    │  INSERTADO   │              │               │            │              │
    │              │              │               │               │            │              │

═══════════════════════════════════════════════════════════════════════════════════════════════
                                    TIEMPOS TOTALES
═══════════════════════════════════════════════════════════════════════════════════════════════

 Acción                          │ Tiempo típico │ Notas
─────────────────────────────────┼───────────────┼────────────────────────────────────────────
 Inicio de grabación             │ ~50ms         │ Spawn del proceso sox
 Detener grabación               │ ~100ms        │ SIGTERM + espera proceso
 Transcripción (Groq)            │ 300-500ms     │ Depende de duración del audio
 Post-proceso (Ollama)           │ 500-2000ms    │ Depende del modelo y longitud
 Inyección de texto              │ ~200ms        │ Clipboard + paste
─────────────────────────────────┼───────────────┼────────────────────────────────────────────
 TOTAL (sin Ollama)              │ ~700ms        │ Muy rápido
 TOTAL (con Ollama)              │ ~1500-2500ms  │ Todavía aceptable
═══════════════════════════════════════════════════════════════════════════════════════════════
```

### Flujo de errores

```
┌─────────────────────────────────────────────────────────────────┐
│                    MANEJO DE ERRORES                             │
└─────────────────────────────────────────────────────────────────┘

Cada operación retorna Result<T, DictationError>

     Operación             │  Si falla...                    │  Recuperación
───────────────────────────┼─────────────────────────────────┼─────────────────────
 startRecording()          │  SOX_NOT_INSTALLED              │  Mostrar instrucciones
                           │  AUDIO_RECORDING_START_FAILED   │  Log y continuar
───────────────────────────┼─────────────────────────────────┼─────────────────────
 stopRecording()           │  AUDIO_RECORDING_STOP_FAILED    │  Log y abortar
                           │  (archivo no creado)            │
───────────────────────────┼─────────────────────────────────┼─────────────────────
 transcribe()              │  TRANSCRIPTION_FAILED           │  Mostrar "[Error...]"
                           │  (API error, rate limit)        │  en vez de texto
───────────────────────────┼─────────────────────────────────┼─────────────────────
 process() [Ollama]        │  TEXT_PROCESSING_FAILED         │  Usar texto sin procesar
                           │  (timeout, modelo no disponible)│  (graceful fallback)
───────────────────────────┼─────────────────────────────────┼─────────────────────
 injectText()              │  PERMISSION_DENIED              │  Mostrar instrucciones
                           │  TEXT_INJECTION_FAILED          │  de permisos
───────────────────────────┴─────────────────────────────────┴─────────────────────

El sistema NUNCA crashea por errores de operación - siempre los maneja gracefully.
```

---

## Parte 12: Referencia de API

### Entidades del Dominio

#### `AudioRecording`

Representa un archivo de audio grabado.

```typescript
interface AudioRecording {
  readonly id: string;           // Ej: "rec_1704825600000_a1b2c3"
  readonly filePath: string;     // Ej: "/storage/audio/recording_123.wav"
  readonly durationMs: number;   // Duración en milisegundos
  readonly timestamp: Date;      // Momento de creación
  readonly format: AudioFormat;  // Configuración de audio
}

interface AudioFormat {
  readonly sampleRate: number;   // 16000 Hz (óptimo para Whisper)
  readonly channels: number;     // 1 (mono)
  readonly bitDepth: number;     // 16 bits
  readonly encoding: 'wav';
}
```

**Funciones asociadas:**

| Función | Descripción | Ejemplo |
|---------|-------------|---------|
| `createAudioRecording(filePath, durationMs, format?)` | Crea una nueva entidad | `createAudioRecording('/path/file.wav', 3000)` |
| `formatDuration(recording)` | Formatea duración para mostrar | `"5s"` o `"1m 30s"` |
| `getFilename(recording)` | Extrae nombre del archivo | `"recording_123.wav"` |

---

#### `Transcription`

Representa el resultado de transcribir audio a texto.

```typescript
interface Transcription {
  readonly id: string;              // Ej: "trans_1704825600000_x1y2z3"
  readonly audioId: string;         // ID del AudioRecording original
  readonly rawText: string;         // Texto crudo de Whisper
  readonly processedText: string | null;  // Texto post-procesado (si aplica)
  readonly language: DetectedLanguage;    // Idioma detectado
  readonly confidence: number | null;     // Confianza (si disponible)
  readonly timestamp: Date;
}

type DetectedLanguage = 'es' | 'en' | 'mixed' | 'unknown';
```

**Funciones asociadas:**

| Función | Descripción | Ejemplo |
|---------|-------------|---------|
| `createTranscription(audioId, rawText, options?)` | Crea una nueva entidad | Ver abajo |
| `getFinalText(transcription)` | Retorna `processedText` o `rawText` | `"Hola mundo"` |
| `isEmpty(transcription)` | Verifica si el texto está vacío | `true` / `false` |
| `getWordCount(transcription)` | Cuenta palabras | `5` |

```typescript
// Ejemplo de creación
const transcription = createTranscription('rec_123', 'hola mundo', {
  language: 'es',
  processedText: 'Hola mundo.',
  confidence: 0.95
});
```

---

#### `CustomDictionary`

Configuración para vocabulario personalizado y reemplazos.

```typescript
interface CustomDictionary {
  readonly description?: string;
  readonly vocabulary: VocabularyConfig;
  readonly replacements: ReplacementsConfig;
}

interface VocabularyConfig {
  readonly enabled: boolean;
  readonly terms: readonly string[];  // Términos para hint a Whisper
}

interface ReplacementsConfig {
  readonly enabled: boolean;
  readonly patterns: readonly ReplacementPattern[];
}

interface ReplacementPattern {
  readonly from: string;  // Texto a buscar (case-insensitive)
  readonly to: string;    // Texto de reemplazo
}
```

**Funciones asociadas:**

| Función | Descripción | Ejemplo |
|---------|-------------|---------|
| `generateVocabularyPrompt(dict)` | Genera prompt para Whisper | `"TypeScript, React, API"` |
| `applyReplacements(text, dict)` | Aplica patrones de reemplazo | `"javascript"` → `"JavaScript"` |
| `parseDictionary(data)` | Parsea JSON a entidad | Valida y normaliza |

---

### Interfaces (Ports)

#### `IAudioRecorder`

Contrato para grabación de audio.

```typescript
interface IAudioRecorder {
  startRecording(): Promise<DictationResult<void>>;
  stopRecording(): Promise<DictationResult<AudioRecording>>;
  isRecording(): boolean;
  getRecordingDuration(): number;
}
```

**Implementación:** `SoxAudioRecorder`

| Método | Comportamiento |
|--------|----------------|
| `startRecording()` | Spawns `sox -d -r 16000 -c 1 -b 16 -t wav <file>` |
| `stopRecording()` | Envía `SIGTERM` al proceso sox, retorna metadatos |
| `isRecording()` | `true` si hay un proceso sox activo |
| `getRecordingDuration()` | `Date.now() - startTime` en ms |

---

#### `ITextInjector`

Contrato para insertar texto en aplicaciones.

```typescript
interface ITextInjector {
  injectText(text: string): Promise<DictationResult<void>>;
  getActiveApp(): Promise<DictationResult<string>>;
}
```

**Implementación:** `AppleScriptTextInjector`

| Método | Comportamiento |
|--------|----------------|
| `injectText(text)` | 1. Copia al clipboard, 2. Simula Cmd+V con AppleScript |
| `getActiveApp()` | Usa AppleScript para obtener nombre de app frontal |

```applescript
-- Lo que ejecuta injectText internamente:
set the clipboard to "texto escapado"
delay 0.1
tell application "System Events" to keystroke "v" using command down
```

---

#### `ITranscriptionService`

Contrato para servicios de transcripción (STT).

```typescript
interface ITranscriptionService {
  transcribe(recording: AudioRecording): Promise<DictationResult<Transcription>>;
}
```

**Implementación:** `GroqTranscriptionService`

| Método | Comportamiento |
|--------|----------------|
| `transcribe(recording)` | POST a `api.groq.com/v1/audio/transcriptions` |

```typescript
// Configuración interna
const config = {
  apiKey: 'gsk_xxx',
  model: 'whisper-large-v3-turbo',
  language: undefined,  // auto-detect
  dictionary: customDictionary,
};
```

---

#### `ITextProcessor`

Contrato para post-procesamiento de texto con LLM.

```typescript
interface ITextProcessor {
  process(text: string): Promise<DictationResult<string>>;
  isAvailable(): Promise<boolean>;
}
```

**Implementación:** `OllamaTextProcessor`

| Método | Comportamiento |
|--------|----------------|
| `process(text)` | POST a `localhost:11434/api/generate` |
| `isAvailable()` | GET a `localhost:11434/api/tags` |

```typescript
// Prompt usado internamente
const prompt = `You are a text correction assistant...
- Adding proper punctuation
- Fixing capitalization
- Correcting technical terms

Text to correct:
${userText}`;
```

---

### Result Pattern API

#### Tipos

```typescript
type Result<T, E = Error> = Success<T> | Failure<E>;

interface Success<T> {
  readonly _tag: 'Success';
  readonly value: T;
}

interface Failure<E> {
  readonly _tag: 'Failure';
  readonly error: E;
}
```

#### Constructores

| Función | Uso |
|---------|-----|
| `Ok(value)` | Crea un `Success<T>` |
| `Err(error)` | Crea un `Failure<E>` |

#### Type Guards

| Función | Retorna |
|---------|---------|
| `isOk(result)` | `result is Success<T>` |
| `isErr(result)` | `result is Failure<E>` |

#### Transformaciones

| Función | Descripción |
|---------|-------------|
| `map(result, fn)` | Transforma el valor si es Success |
| `flatMap(result, fn)` | Encadena operaciones que retornan Result |
| `mapErr(result, fn)` | Transforma el error si es Failure |
| `getOrElse(result, default)` | Extrae valor o retorna default |
| `unwrap(result)` | Extrae valor o lanza excepción |
| `match(result, { onSuccess, onFailure })` | Pattern matching |

#### Ejemplo completo

```typescript
import { Ok, Err, isOk, match, flatMap } from './application/types';

// Encadenar operaciones
const result = await flatMap(
  await audioRecorder.stopRecording(),
  (recording) => transcriptionService.transcribe(recording)
);

// Pattern matching
match(result, {
  onSuccess: (transcription) => {
    console.log(`Texto: ${getFinalText(transcription)}`);
  },
  onFailure: (error) => {
    console.error(`Error ${error.code}: ${error.message}`);
  },
});
```

---

### Códigos de Error

```typescript
type DictationErrorCode =
  | 'AUDIO_RECORDING_FAILED'        // Error genérico de grabación
  | 'AUDIO_RECORDING_START_FAILED'  // No se pudo iniciar sox
  | 'AUDIO_RECORDING_STOP_FAILED'   // No se pudo detener sox
  | 'TRANSCRIPTION_FAILED'          // Error de API Groq
  | 'TEXT_INJECTION_FAILED'         // Error de AppleScript
  | 'TEXT_PROCESSING_FAILED'        // Error de Ollama
  | 'CONFIG_ERROR'                  // Error de configuración
  | 'SOX_NOT_INSTALLED'             // sox no encontrado
  | 'PERMISSION_DENIED';            // Permisos de Accessibility
```

---

## Parte 13: Guía de Contribución

### Configuración del entorno de desarrollo

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/jarvis.git
cd jarvis/voice-dictation

# 2. Instalar dependencias
npm install

# 3. Instalar dependencias del sistema
brew install sox

# 4. Configurar API key
cp config/.env.example config/.env
# Editar config/.env y agregar GROQ_API_KEY

# 5. Ejecutar en modo desarrollo
npm run dev

# 6. (Opcional) Modo debug para ver teclas
DEBUG_KEYS=1 npm run dev
```

### Estructura de un cambio

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUJO DE CONTRIBUCIÓN                         │
└─────────────────────────────────────────────────────────────────┘

1. Fork + Clone
       │
       ▼
2. Crear branch descriptivo
   git checkout -b feature/whisper-local
       │
       ▼
3. Hacer cambios siguiendo la arquitectura
   - Entidades nuevas → src/domain/entities/
   - Interfaces nuevas → src/domain/ports/
   - Implementaciones → src/infrastructure/
       │
       ▼
4. Escribir tests
   npm test
       │
       ▼
5. Verificar tipos
   npm run build
       │
       ▼
6. Commit con mensaje descriptivo
   git commit -m "feat: add local Whisper transcription support"
       │
       ▼
7. Push + Pull Request
   git push origin feature/whisper-local
```

### Convenciones de código

#### Nombrado

| Tipo | Convención | Ejemplo |
|------|------------|---------|
| Archivos | PascalCase para clases/entidades | `AudioRecording.ts` |
| Interfaces | Prefijo `I` | `IAudioRecorder` |
| Funciones factory | Prefijo `create` | `createSoxAudioRecorder()` |
| Constantes | UPPER_SNAKE_CASE | `DEFAULT_AUDIO_FORMAT` |
| Variables/funciones | camelCase | `formatDuration()` |

#### Patrones requeridos

1. **Siempre usar Result Pattern** para operaciones que pueden fallar:

```typescript
// ✅ Correcto
const transcribe = async (recording: AudioRecording): Promise<DictationResult<Transcription>> => {
  try {
    // ...
    return Ok(transcription);
  } catch (error) {
    return Err(createError('TRANSCRIPTION_FAILED', error.message));
  }
};

// ❌ Incorrecto (lanzar excepciones)
const transcribe = async (recording: AudioRecording): Promise<Transcription> => {
  // ...
  throw new Error('Transcription failed');
};
```

2. **Usar factory functions** en lugar de clases:

```typescript
// ✅ Correcto
export const createMyService = (deps: Dependencies): MyService => {
  const doSomething = async () => { /* ... */ };
  return { doSomething };
};

// ❌ Incorrecto
export class MyService {
  constructor(private deps: Dependencies) {}
  async doSomething() { /* ... */ }
}
```

3. **Mantener inmutabilidad** con `readonly`:

```typescript
// ✅ Correcto
interface Config {
  readonly apiKey: string;
  readonly timeout: number;
}

// ❌ Incorrecto
interface Config {
  apiKey: string;
  timeout: number;
}
```

### Agregar una nueva funcionalidad

#### Ejemplo: Agregar soporte para OpenAI Whisper

**Paso 1:** Verificar que la interfaz existente es suficiente

```typescript
// src/domain/ports/ITranscriptionService.ts
// La interfaz ya existe, solo necesitamos implementarla
interface ITranscriptionService {
  transcribe(recording: AudioRecording): Promise<DictationResult<Transcription>>;
}
```

**Paso 2:** Crear la implementación

```typescript
// src/infrastructure/transcription/OpenAITranscriptionService.ts

import OpenAI from 'openai';
import { ITranscriptionService } from '../../domain/ports/ITranscriptionService';
import { DictationResult, Ok, Err, createError } from '../../application/types';

interface OpenAITranscriptionServiceConfig {
  readonly apiKey: string;
  readonly model?: string;
}

export const createOpenAITranscriptionService = (
  config: OpenAITranscriptionServiceConfig
): ITranscriptionService => {
  const openai = new OpenAI({ apiKey: config.apiKey });
  const model = config.model ?? 'whisper-1';

  const transcribe = async (recording: AudioRecording): Promise<DictationResult<Transcription>> => {
    try {
      const audioFile = fs.createReadStream(recording.filePath);

      const response = await openai.audio.transcriptions.create({
        file: audioFile,
        model: model,
        response_format: 'verbose_json',
      });

      const transcription = createTranscription(recording.id, response.text, {
        language: mapLanguage(response.language),
      });

      return Ok(transcription);
    } catch (error) {
      return Err(createError('TRANSCRIPTION_FAILED', error.message));
    }
  };

  return { transcribe };
};
```

**Paso 3:** Integrar en main.ts

```typescript
// src/main.ts

const createTranscriptionService = (config: AppConfig, env: Record<string, string>) => {
  switch (config.stt.provider) {
    case 'groq':
      return createGroqTranscriptionService({ apiKey: env.GROQ_API_KEY });
    case 'openai':
      return createOpenAITranscriptionService({ apiKey: env.OPENAI_API_KEY });
    default:
      return undefined; // Modo simulación
  }
};
```

**Paso 4:** Actualizar configuración

```typescript
// src/domain/entities/AppConfig.ts

interface STTConfig {
  readonly provider: 'groq' | 'openai' | 'local';  // Agregar 'openai'
  readonly model: string;
}
```

### Escribir tests

```typescript
// src/infrastructure/transcription/OpenAITranscriptionService.test.ts

import { describe, it, expect, vi } from 'vitest';
import { createOpenAITranscriptionService } from './OpenAITranscriptionService';
import { isOk, isErr } from '../../application/types';

describe('OpenAITranscriptionService', () => {
  it('should transcribe audio successfully', async () => {
    const service = createOpenAITranscriptionService({
      apiKey: 'test-key',
    });

    const recording = createAudioRecording('/path/to/test.wav', 1000);
    const result = await service.transcribe(recording);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.rawText).toBeDefined();
    }
  });

  it('should handle API errors gracefully', async () => {
    // Mock de error
    const service = createOpenAITranscriptionService({
      apiKey: 'invalid-key',
    });

    const recording = createAudioRecording('/path/to/test.wav', 1000);
    const result = await service.transcribe(recording);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('TRANSCRIPTION_FAILED');
    }
  });
});
```

### Checklist antes de hacer PR

- [ ] El código compila sin errores: `npm run build`
- [ ] Los tests pasan: `npm test`
- [ ] No hay warnings de TypeScript
- [ ] Se sigue el Result Pattern para errores
- [ ] Las funciones nuevas son puras cuando es posible
- [ ] Se usan `readonly` para propiedades inmutables
- [ ] Los factory functions tienen nombre `create*`
- [ ] La documentación está actualizada si es necesario

### Recursos útiles

| Recurso | URL |
|---------|-----|
| Clean Architecture | https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html |
| Result Pattern | https://www.youtube.com/watch?v=JTEVQZvR1rM |
| Groq API Docs | https://console.groq.com/docs |
| Ollama Docs | https://ollama.ai/docs |
| sox Manual | https://sox.sourceforge.net/sox.html |

---

## Índice Rápido

| Sección | Descripción |
|---------|-------------|
| [Parte 1](#parte-1-visión-general) | Qué es y qué problema resuelve |
| [Parte 2](#parte-2-pipeline-de-procesamiento) | Las 4 etapas del procesamiento |
| [Parte 3](#parte-3-arquitectura-de-software) | Clean Architecture explicada |
| [Parte 4](#parte-4-patrones-de-programación) | Result Pattern, Factory Functions |
| [Parte 5](#parte-5-flujo-de-código-detallado) | Qué pasa al presionar/soltar tecla |
| [Parte 6](#parte-6-estructura-de-archivos) | Árbol de directorios |
| [Parte 7](#parte-7-dependencias-externas) | sox, Groq, Ollama |
| [Parte 8](#parte-8-configuración) | jarvisConfig.json explicado |
| [Parte 9](#parte-9-cómo-extender-la-aplicación) | Agregar proveedores/comandos |
| [Parte 10](#parte-10-troubleshooting) | Solución de problemas |
| [Parte 11](#parte-11-diagrama-de-secuencia-detallado) | Flujo con tiempos |
| [Parte 12](#parte-12-referencia-de-api) | Documentación técnica completa |
| [Parte 13](#parte-13-guía-de-contribución) | Cómo contribuir al proyecto |
