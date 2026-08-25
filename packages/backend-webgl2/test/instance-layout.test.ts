import { describe, expect, test } from "bun:test";
import {
  PATH_COLOR_OFFSET,
  PATH_VERTEX_BYTES,
  PATH_VERTEX_WORDS,
  SHAPE_COLOR_OFFSET,
  SHAPE_INSTANCE_BYTES,
  SHAPE_INSTANCE_WORDS,
  SHAPE_PARAMS_OFFSET,
  TEXTURED_COLOR_OFFSET,
  TEXTURED_MATERIAL_COLOR_OFFSET,
  TEXTURED_MATERIAL_OFFSET,
  materialWord,
  TEXTURED_INSTANCE_BYTES,
  TEXTURED_INSTANCE_WORDS,
  rgba8Word,
  toUnorm8,
} from "../src/instance-layout";
import { MaterialKind } from "@hazumi/graphics";

/** The four bytes of a packed word, in the order the GPU reads them. */
function wordBytes(word: number): number[] {
  return [...new Uint8Array(new Uint32Array([word]).buffer)];
}

describe("packed WebGL layouts", () => {
  test("pin every stride and colour offset", () => {
    expect([
      SHAPE_INSTANCE_WORDS,
      SHAPE_INSTANCE_BYTES,
      SHAPE_COLOR_OFFSET,
      SHAPE_PARAMS_OFFSET,
    ]).toEqual([11, 44, 32, 36]);
    expect([
      TEXTURED_INSTANCE_WORDS,
      TEXTURED_INSTANCE_BYTES,
      TEXTURED_COLOR_OFFSET,
      TEXTURED_MATERIAL_COLOR_OFFSET,
      TEXTURED_MATERIAL_OFFSET,
    ]).toEqual([13, 52, 40, 44, 48]);
    expect([PATH_VERTEX_WORDS, PATH_VERTEX_BYTES, PATH_COLOR_OFFSET]).toEqual([3, 12, 8]);
  });

  test("quantizes to the nearest normalized byte and clamps", () => {
    expect([Number.NaN, -1, 0, 0.25, 0.5, 1, 2].map(toUnorm8)).toEqual([
      0, 0, 0, 64, 128, 255, 255,
    ]);
  });

  test("writes RGBA without corrupting adjacent float words", () => {
    const data = new ArrayBuffer(SHAPE_INSTANCE_BYTES);
    const floats = new Float32Array(data);
    const bytes = new Uint8Array(data);
    floats[7] = 123.5;
    floats[9] = 7.25;

    new Uint32Array(data)[SHAPE_COLOR_OFFSET / 4] = rgba8Word(17, 34, 51, 68);

    expect(Array.from(bytes.slice(SHAPE_COLOR_OFFSET, SHAPE_COLOR_OFFSET + 4))).toEqual([
      17, 34, 51, 68,
    ]);
    expect(floats[7]).toBe(123.5);
    expect(floats[9]).toBe(7.25);
  });

  test("packs a material into the byte each parameter deserves", () => {
    // No material is the zero word, so a plain sprite costs nothing to say.
    expect(materialWord(MaterialKind.None, 1, 1, 1)).toBe(0);

    // A flash is a fraction: quantized, like a colour channel.
    expect(wordBytes(materialWord(MaterialKind.Flash, 0.5, 0, 0))).toEqual([1, 128, 0, 0]);

    // An outline is a whole count of texels, and eight taps is the ring the
    // shader draws — asking for more than that would silently do nothing.
    expect(wordBytes(materialWord(MaterialKind.Outline, 2.4, 0, 0))).toEqual([2, 2, 0, 0]);
    expect(wordBytes(materialWord(MaterialKind.Outline, 99, 0, 0))).toEqual([2, 8, 0, 0]);
    expect(wordBytes(materialWord(MaterialKind.Outline, 0, 0, 0))).toEqual([2, 1, 0, 0]);

    // A dissolve mixes both: two fractions and a count.
    expect(wordBytes(materialWord(MaterialKind.Dissolve, 1, 0.25, 12))).toEqual([3, 255, 64, 12]);
  });
});
