/** Shape instance: affine + offset/extent + RGBA8 + edge/shape. */
export const SHAPE_INSTANCE_WORDS: number = 11;
export const SHAPE_INSTANCE_BYTES: number = SHAPE_INSTANCE_WORDS * 4;
export const SHAPE_COLOR_OFFSET: number = 8 * 4;
export const SHAPE_PARAMS_OFFSET: number = 9 * 4;

/** Textured instance: affine + offset + UV rectangle + RGBA8. */
export const TEXTURED_INSTANCE_WORDS: number = 11;
export const TEXTURED_INSTANCE_BYTES: number = TEXTURED_INSTANCE_WORDS * 4;
export const TEXTURED_COLOR_OFFSET: number = 10 * 4;

/** Path vertex: position + RGBA8. */
export const PATH_VERTEX_WORDS: number = 3;
export const PATH_VERTEX_BYTES: number = PATH_VERTEX_WORDS * 4;
export const PATH_COLOR_OFFSET: number = 2 * 4;

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
