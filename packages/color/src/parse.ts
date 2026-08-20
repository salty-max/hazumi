import { oklch, type Oklch, fromSrgb } from './oklch';
import { namedColorHex, TRANSPARENT_HEX } from './named';

/** Thrown when a colour string cannot be understood. */
export class ColorParseError extends Error {
  readonly input: string;

  constructor(input: string) {
    super(`Cannot parse colour: ${JSON.stringify(input)}`);
    this.name = 'ColorParseError';
    this.input = input;
  }
}

const HEX = /^#([0-9a-f]{3,8})$/i;
const FUNC = /^([a-z]+)\(([^)]*)\)$/i;

/** One hex nibble, doubled: "f" -> 1.0. */
function expand(c: string): number {
  return Number.parseInt(c + c, 16) / 255;
}

/** One hex byte: "ff" -> 1.0. */
function byte(c: string): number {
  return Number.parseInt(c, 16) / 255;
}

function parseHex(hex: string, input: string): Oklch {
  switch (hex.length) {
    case 3:
      return fromSrgb({
        r: expand(hex[0] as string),
        g: expand(hex[1] as string),
        b: expand(hex[2] as string),
        alpha: 1,
      });
    case 4:
      return fromSrgb({
        r: expand(hex[0] as string),
        g: expand(hex[1] as string),
        b: expand(hex[2] as string),
        alpha: expand(hex[3] as string),
      });
    case 6:
      return fromSrgb({
        r: byte(hex.slice(0, 2)),
        g: byte(hex.slice(2, 4)),
        b: byte(hex.slice(4, 6)),
        alpha: 1,
      });
    case 8:
      return fromSrgb({
        r: byte(hex.slice(0, 2)),
        g: byte(hex.slice(2, 4)),
        b: byte(hex.slice(4, 6)),
        alpha: byte(hex.slice(6, 8)),
      });
    default:
      throw new ColorParseError(input);
  }
}

/** Split "1 2 3 / 0.5" or "1, 2, 3, 0.5" into components. */
function splitArgs(body: string): string[] {
  return body
    .replace(/\//g, ' ')
    .split(/[\s,]+/)
    .filter((part) => part.length > 0);
}

function number(token: string, scaleIfPercent: number, input: string): number {
  const value = token.endsWith('%')
    ? (Number.parseFloat(token) / 100) * scaleIfPercent
    : Number.parseFloat(token);
  if (Number.isNaN(value)) throw new ColorParseError(input);
  return value;
}

function alphaOf(tokens: string[], index: number, input: string): number {
  const token = tokens[index];
  return token === undefined ? 1 : number(token, 1, input);
}

/**
 * Parse a CSS colour string into OKLCH.
 *
 * Supports CSS named colours, hex (3/4/6/8 digit), `rgb()`, and `oklch()`,
 * with either space-separated or comma-separated components.
 */
export function parse(input: string): Oklch {
  const text = input.trim().toLowerCase();

  const hex = HEX.exec(text);
  if (hex !== null) return parseHex(hex[1] as string, input);

  if (text === 'transparent') return parseHex(TRANSPARENT_HEX, input);
  const named = namedColorHex(text);
  if (named !== undefined) return parseHex(named, input);

  const func = FUNC.exec(text);
  if (func === null) throw new ColorParseError(input);

  const name = func[1] as string;
  const args = splitArgs(func[2] as string);

  if (name === 'rgb' || name === 'rgba') {
    if (args.length < 3) throw new ColorParseError(input);
    return fromSrgb({
      r: number(args[0] as string, 255, input) / 255,
      g: number(args[1] as string, 255, input) / 255,
      b: number(args[2] as string, 255, input) / 255,
      alpha: alphaOf(args, 3, input),
    });
  }

  if (name === 'oklch') {
    if (args.length < 3) throw new ColorParseError(input);
    return oklch(
      number(args[0] as string, 1, input),
      number(args[1] as string, 0.4, input),
      number(args[2] as string, 360, input),
      alphaOf(args, 3, input),
    );
  }

  throw new ColorParseError(input);
}

/** `parse`, but returns null instead of throwing. */
export function tryParse(input: string): Oklch | null {
  try {
    return parse(input);
  } catch {
    return null;
  }
}
