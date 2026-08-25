import { MaterialKind } from "@hazumi/graphics";

/** Shape instance: affine + offset/extent + RGBA8 + edge/shape. */
export const SHAPE_INSTANCE_WORDS: number = 11;
export const SHAPE_INSTANCE_BYTES: number = SHAPE_INSTANCE_WORDS * 4;
export const SHAPE_COLOR_OFFSET: number = 8 * 4;
export const SHAPE_PARAMS_OFFSET: number = 9 * 4;

/**
 * Textured instance: affine + offset + UV rectangle + RGBA8 + material.
 *
 * Thirteen words rather than eleven, and the two extra are the whole price of
 * materials: they are paid on every sprite and glyph, whether or not it wears
 * one. The alternative was a program per material, which costs a draw call per
 * material change instead — far worse for the case materials exist to serve,
 * a crowd of sprites flashing and dissolving on their own schedules.
 */
export const TEXTURED_INSTANCE_WORDS: number = 13;
export const TEXTURED_INSTANCE_BYTES: number = TEXTURED_INSTANCE_WORDS * 4;
export const TEXTURED_COLOR_OFFSET: number = 10 * 4;
/** The material's colour: flash target, outline, or dissolve edge. */
export const TEXTURED_MATERIAL_COLOR_OFFSET: number = 11 * 4;
/** Kind and three parameters, one byte each. Read as an integer attribute. */
export const TEXTURED_MATERIAL_OFFSET: number = 12 * 4;

/** Path vertex: position + RGBA8. */
export const PATH_VERTEX_WORDS: number = 3;
export const PATH_VERTEX_BYTES: number = PATH_VERTEX_WORDS * 4;
export const PATH_COLOR_OFFSET: number = 2 * 4;

/**
 * Pack a material into one word: kind, then three parameter bytes.
 *
 * A byte per parameter, because every one of them is either a strength an
 * artist picked by eye or a small whole count — neither needs more than 8 bits,
 * and the alternative is three more floats on every sprite in the frame.
 *
 * What each parameter means depends on the kind, so its scaling does too. The
 * switch lives here rather than in the shader because this is the one place
 * that has to agree with the shader, and a rule written twice is a rule that
 * will disagree with itself eventually.
 */
export function materialWord(kind: MaterialKind, p0: number, p1: number, p2: number): number {
  let a = 0;
  let b = 0;
  let c = 0;
  switch (kind) {
    case MaterialKind.Flash: // Amount, a fraction.
      a = toUnorm8(p0);
      break;
    case MaterialKind.Outline: // Width in whole source texels; eight taps at that radius.
      a = clampByte(Math.round(p0), 1, 8);
      break;
    case MaterialKind.Dissolve: // Progress and edge as fractions, scale as a count.
      a = toUnorm8(p0);
      b = toUnorm8(p1);
      c = clampByte(Math.round(p2), 1, 255);
      break;
    default:
      return 0;
  }
  return rgba8Word(kind, a, b, c);
}

function clampByte(value: number, low: number, high: number): number {
  if (!(value > low)) return low;
  return value > high ? high : value;
}

const endianProbe = new Uint32Array([0x01020304]);
const LITTLE_ENDIAN = new Uint8Array(endianProbe.buffer)[0] === 0x04;

/** Clamp a floating colour channel and quantize it to normalized eight-bit. */
export function toUnorm8(value: number): number {
  if (!(value > 0)) return 0;
  if (value >= 1) return 255;
  return (value * 255 + 0.5) | 0;
}

/** Pack quantized channels into one native-endian word whose bytes are RGBA. */
export function rgba8Word(r: number, g: number, b: number, a: number): number {
  if (LITTLE_ENDIAN) return (r | (g << 8) | (b << 16) | (a << 24)) >>> 0;
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}
