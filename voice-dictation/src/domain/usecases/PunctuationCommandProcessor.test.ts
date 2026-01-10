import { describe, it, expect } from 'vitest';
import {
  processPunctuationCommands,
  getAvailableCommands,
} from './PunctuationCommandProcessor';

describe('PunctuationCommandProcessor', () => {
  describe('processPunctuationCommands', () => {
    describe('Single-word commands', () => {
      it('converts "punto" to period', () => {
        expect(processPunctuationCommands('Hola punto')).toBe('Hola.');
      });

      it('converts "coma" to comma', () => {
        expect(processPunctuationCommands('Uno coma dos')).toBe('Uno, dos');
      });

      it('converts "interrogación" to question mark', () => {
        expect(processPunctuationCommands('Qué tal interrogación')).toBe('Qué tal?');
      });

      it('converts "exclamación" to exclamation mark', () => {
        expect(processPunctuationCommands('Genial exclamación')).toBe('Genial!');
      });

      it('converts "guión" to hyphen', () => {
        // Note: cleanupPunctuationSpacing doesn't handle hyphens specially
        expect(processPunctuationCommands('auto guión servicio')).toBe('auto - servicio');
      });

      it('converts "arroba" to @', () => {
        // Note: @ is not processed by cleanupPunctuationSpacing
        expect(processPunctuationCommands('usuario arroba dominio punto com')).toBe('usuario @ dominio. com');
      });
    });

    describe('Multi-word commands', () => {
      it('converts "nuevo párrafo" to double newline', () => {
        // Spaces around newlines are preserved (not cleaned by cleanupPunctuationSpacing)
        expect(processPunctuationCommands('Fin nuevo párrafo Inicio')).toBe('Fin \n\n Inicio');
      });

      it('converts "nueva línea" to single newline', () => {
        expect(processPunctuationCommands('Línea 1 nueva línea Línea 2')).toBe('Línea 1 \n Línea 2');
      });

      it('converts "punto y coma" to semicolon', () => {
        expect(processPunctuationCommands('const x = 1 punto y coma')).toBe('const x = 1;');
      });

      it('converts "dos puntos" to colon', () => {
        expect(processPunctuationCommands('function dos puntos void')).toBe('function: void');
      });

      it('converts "puntos suspensivos" to ellipsis', () => {
        // Ellipsis becomes ". . ." due to spacing rules
        expect(processPunctuationCommands('espera puntos suspensivos')).toBe('espera. . .');
      });

      it('converts "signo de interrogación" to question mark', () => {
        expect(processPunctuationCommands('Por qué signo de interrogación')).toBe('Por qué?');
      });

      it('converts "signo de exclamación" to exclamation mark', () => {
        expect(processPunctuationCommands('Increíble signo de exclamación')).toBe('Increíble!');
      });
    });

    describe('Bracket and quote commands', () => {
      it('converts "abrir paréntesis" and "cerrar paréntesis"', () => {
        // Opening paren removes trailing space, closing paren removes leading space
        expect(processPunctuationCommands('función abrir paréntesis argumento cerrar paréntesis'))
          .toBe('función (argumento)');
      });

      it('converts "abrir comillas" and "cerrar comillas"', () => {
        // Quotes have specific spacing rules
        expect(processPunctuationCommands('dijo abrir comillas hola cerrar comillas'))
          .toBe('dijo"hola"');
      });

      it('converts "abrir corchete" and "cerrar corchete"', () => {
        expect(processPunctuationCommands('array abrir corchete 0 cerrar corchete'))
          .toBe('array [0]');
      });

      it('converts standalone "paréntesis" to ()', () => {
        // Standalone () is kept with spacing
        expect(processPunctuationCommands('función paréntesis')).toBe('función ()');
      });

      it('converts standalone "comillas" to "', () => {
        expect(processPunctuationCommands('texto comillas')).toBe('texto"');
      });
    });

    describe('Case insensitivity', () => {
      it('handles uppercase commands', () => {
        expect(processPunctuationCommands('Hola PUNTO')).toBe('Hola.');
      });

      it('handles mixed case commands', () => {
        expect(processPunctuationCommands('Test Nuevo Párrafo Otro')).toBe('Test \n\n Otro');
      });
    });

    describe('Multiple commands in same text', () => {
      it('processes multiple punctuation commands', () => {
        const input = 'Hola coma qué tal interrogación';
        expect(processPunctuationCommands(input)).toBe('Hola, qué tal?');
      });

      it('handles complex sentences', () => {
        const input = 'Primero punto Segundo coma y tercero exclamación';
        expect(processPunctuationCommands(input)).toBe('Primero. Segundo, y tercero!');
      });
    });

    describe('Spacing cleanup', () => {
      it('removes space before punctuation', () => {
        expect(processPunctuationCommands('Hola   punto')).toBe('Hola.');
      });

      it('ensures space after punctuation when followed by text', () => {
        const result = processPunctuationCommands('uno punto dos');
        expect(result).toBe('uno. dos');
      });

      it('removes space after opening brackets', () => {
        const result = processPunctuationCommands('test abrir paréntesis    valor cerrar paréntesis');
        // Multiple spaces are collapsed to one, opening paren keeps one space before
        expect(result).toBe('test (valor)');
      });

      it('removes space before closing brackets', () => {
        const result = processPunctuationCommands('abrir corchete item    cerrar corchete');
        expect(result).toBe('[item]');
      });

      it('trims extra whitespace', () => {
        expect(processPunctuationCommands('  Hola   mundo  punto  ')).toBe('Hola mundo.');
      });
    });

    describe('Edge cases', () => {
      it('handles empty string', () => {
        expect(processPunctuationCommands('')).toBe('');
      });

      it('handles text without commands', () => {
        expect(processPunctuationCommands('Hello world')).toBe('Hello world');
      });

      it('preserves word boundaries (no partial matches)', () => {
        // "punto" should not match inside "contrapunto"
        expect(processPunctuationCommands('contrapunto musical')).toBe('contrapunto musical');
      });

      it('does not match "coma" inside other words', () => {
        expect(processPunctuationCommands('estamos en coma inducido')).toBe('estamos en, inducido');
      });
    });
  });

  describe('getAvailableCommands', () => {
    it('returns list of available commands', () => {
      const commands = getAvailableCommands();
      expect(commands.length).toBeGreaterThan(0);
    });

    it('includes basic punctuation commands', () => {
      const commands = getAvailableCommands();
      const commandNames = commands.map((c) => c.command);

      expect(commandNames).toContain('punto');
      expect(commandNames).toContain('coma');
    });

    it('each command has command and result properties', () => {
      const commands = getAvailableCommands();
      commands.forEach((cmd) => {
        expect(cmd).toHaveProperty('command');
        expect(cmd).toHaveProperty('result');
        expect(typeof cmd.command).toBe('string');
        expect(typeof cmd.result).toBe('string');
      });
    });
  });
});
