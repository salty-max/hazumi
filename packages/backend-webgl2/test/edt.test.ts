import { describe, expect, test } from 'bun:test';
import { edt2d, signedDistanceField } from '../src/text/edt';

const INF = 1e20;

function field(width: number, height: number, solid: (x: number, y: number) => boolean): Float64Array {
  const out = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) out[y * width + x] = solid(x, y) ? 1 : 0;
  }
  return out;
}

describe('edt2d', () => {
  test('a single feature cell gives exact euclidean distances', () => {
    const w = 5;
    const h = 5;
    const data = new Float64Array(w * h).fill(INF);
    data[2 * w + 2] = 0; // centre

    edt2d(data, w, h);

    // Squared distance from (2,2) — an exact transform, so these must be exact.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const expected = (x - 2) ** 2 + (y - 2) ** 2;
        expect(data[y * w + x]).toBeCloseTo(expected, 9);
      }
    }
  });

  test('picks the nearest of several features', () => {
    const w = 7;
    const data = new Float64Array(w * 1).fill(INF);
    data[0] = 0;
    data[6] = 0;
    edt2d(data, w, 1);
    expect(Array.from(data)).toEqual([0, 1, 4, 9, 4, 1, 0]);
  });

  test('an all-feature grid is all zeros', () => {
    const data = new Float64Array(16).fill(0);
    edt2d(data, 4, 4);
    expect(Array.from(data).every((v) => v === 0)).toBe(true);
  });
});

describe('signedDistanceField', () => {
  test('is negative inside and positive outside', () => {
    const size = 32;
    const r = 10;
    const alpha = field(size, size, (x, y) => Math.hypot(x - 16, y - 16) <= r);
    const sdf = signedDistanceField(alpha, size, size);

    expect(sdf[16 * size + 16]).toBeLessThan(0); // centre
    expect(sdf[0]).toBeGreaterThan(0); // corner
  });

  test('approximates distance to a circle edge', () => {
    // A shape whose distance field is known analytically, which is the only
    // way to tell a working transform from a plausible-looking one.
    const size = 64;
    const cx = 32;
    const cy = 32;
    const r = 16;
    const alpha = field(size, size, (x, y) => Math.hypot(x - cx, y - cy) <= r);
    const sdf = signedDistanceField(alpha, size, size);

    let worst = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const exact = Math.hypot(x - cx, y - cy) - r;
        if (Math.abs(exact) > 8) continue; // only near the boundary
        worst = Math.max(worst, Math.abs((sdf[y * size + x] as number) - exact));
      }
    }
    // Rasterisation quantises the boundary, so about a pixel of error is the
    // floor here; anything much larger means the transform is wrong.
    expect(worst).toBeLessThan(1.5);
  });

  test('is zero-crossing at the boundary', () => {
    const size = 40;
    const alpha = field(size, size, (x) => x >= 20);
    const sdf = signedDistanceField(alpha, size, size);
    const row = 20 * size;
    expect(sdf[row + 19]).toBeGreaterThan(0);
    expect(sdf[row + 20]).toBeLessThanOrEqual(0);
  });

  test('an empty bitmap has no inside', () => {
    const sdf = signedDistanceField(new Float64Array(64), 8, 8);
    expect(Array.from(sdf).every((v) => v > 0)).toBe(true);
  });
});
