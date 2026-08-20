import { describe, expect, test } from 'bun:test';
import {
  ColorParseError,
  parse,
  toCss,
  toHex,
  toRgbCss,
  tryParse,
} from '../src/index';

describe('parse hex', () => {
  test('6-digit', () => {
    expect(toHex(parse('#ff0000'))).toBe('#ff0000');
    expect(toHex(parse('#00ff00'))).toBe('#00ff00');
    expect(toHex(parse('#336699'))).toBe('#336699');
  });

  test('3-digit expands each nibble', () => {
    expect(toHex(parse('#f00'))).toBe('#ff0000');
    expect(toHex(parse('#369'))).toBe('#336699');
  });

  test('8-digit carries alpha', () => {
    expect(parse('#ff000080').alpha).toBeCloseTo(128 / 255, 4);
  });

  test('4-digit carries alpha', () => {
    expect(parse('#f008').alpha).toBeCloseTo(136 / 255, 4);
  });

  test('is case-insensitive', () => {
    expect(toHex(parse('#FF00AA'))).toBe(toHex(parse('#ff00aa')));
  });
});

describe('parse rgb()', () => {
  test('space-separated', () => {
    expect(toHex(parse('rgb(255 0 0)'))).toBe('#ff0000');
  });

  test('comma-separated', () => {
    expect(toHex(parse('rgb(51, 102, 153)'))).toBe('#336699');
  });

  test('slash alpha', () => {
    expect(parse('rgb(255 0 0 / 0.5)').alpha).toBeCloseTo(0.5);
  });

  test('percentages', () => {
    expect(toHex(parse('rgb(100% 0% 0%)'))).toBe('#ff0000');
  });

  test('rgba is accepted as an alias', () => {
    expect(parse('rgba(255, 0, 0, 0.25)').alpha).toBeCloseTo(0.25);
  });
});

describe('parse oklch()', () => {
  test('plain components', () => {
    const c = parse('oklch(0.7 0.18 250)');
    expect(c.l).toBeCloseTo(0.7);
    expect(c.c).toBeCloseTo(0.18);
    expect(c.h).toBeCloseTo(250);
    expect(c.alpha).toBe(1);
  });

  test('percentage lightness', () => {
    expect(parse('oklch(70% 0.18 250)').l).toBeCloseTo(0.7);
  });

  test('percentage chroma is relative to 0.4', () => {
    expect(parse('oklch(0.7 50% 250)').c).toBeCloseTo(0.2);
  });

  test('slash alpha', () => {
    expect(parse('oklch(0.7 0.18 250 / 0.4)').alpha).toBeCloseTo(0.4);
  });

  test('survives a toCss round-trip', () => {
    const original = parse('oklch(0.7 0.18 250 / 0.4)');
    const back = parse(toCss(original));
    expect(back.l).toBeCloseTo(original.l, 4);
    expect(back.c).toBeCloseTo(original.c, 4);
    expect(back.h).toBeCloseTo(original.h, 2);
    expect(back.alpha).toBeCloseTo(original.alpha, 4);
  });
});

describe('parse failures', () => {
  test('rejects malformed input with the offending string', () => {
    for (const bad of ['', 'nonsense', '#12345', 'rgb(1 2)', 'hsl(1 2 3)', '#gg0000']) {
      expect(() => parse(bad)).toThrow(ColorParseError);
    }
    try {
      parse('nonsense');
    } catch (error) {
      expect((error as ColorParseError).input).toBe('nonsense');
    }
  });

  test('tryParse returns null instead of throwing', () => {
    expect(tryParse('nonsense')).toBeNull();
    expect(tryParse('#f00')).not.toBeNull();
  });

  test('tolerates surrounding whitespace and mixed case', () => {
    expect(toHex(parse('  #FF0000  '))).toBe('#ff0000');
    expect(toHex(parse('  RGB(255 0 0)  '))).toBe('#ff0000');
  });
});

describe('formatting', () => {
  test('toCss omits alpha when opaque', () => {
    expect(toCss(parse('oklch(0.7 0.1 200)'))).not.toContain('/');
    expect(toCss(parse('oklch(0.7 0.1 200 / 0.5)'))).toContain('/');
  });

  test('toHex omits the alpha byte when opaque', () => {
    expect(toHex(parse('#ff0000'))).toHaveLength(7);
    expect(toHex(parse('#ff000080'))).toHaveLength(9);
  });

  test('toRgbCss round-trips through parse', () => {
    expect(toHex(parse(toRgbCss(parse('#336699'))))).toBe('#336699');
  });
});
