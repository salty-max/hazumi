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
  TEXTURED_INSTANCE_BYTES,
  TEXTURED_INSTANCE_WORDS,
  rgba8Word,
  toUnorm8,
} from "../src/instance-layout";

describe("packed WebGL layouts", () => {
  test("pin every stride and colour offset", () => {
    expect([
      SHAPE_INSTANCE_WORDS,
      SHAPE_INSTANCE_BYTES,
      SHAPE_COLOR_OFFSET,
      SHAPE_PARAMS_OFFSET,
    ]).toEqual([11, 44, 32, 36]);
    expect([TEXTURED_INSTANCE_WORDS, TEXTURED_INSTANCE_BYTES, TEXTURED_COLOR_OFFSET]).toEqual([
      11, 44, 40,
    ]);
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
});
