import { describe, expect, test } from 'bun:test';
import { createNoise, seeded } from '../src/index';

/**
 * These are property tests, not comparisons against a reference
 * implementation. They catch gross errors — wrong range, discontinuity,
 * a seed that does nothing, constant output — but would not catch a subtly
 * wrong gradient table.
 */
describe('noise2', () => {
  test('is deterministic for a given seed', () => {
    const a = createNoise(42);
    const b = createNoise(42);
    for (let i = 0; i < 100; i++) {
      const x = i * 0.37;
      expect(a.noise2(x, x * 1.7)).toBe(b.noise2(x, x * 1.7));
    }
  });

  test('different seeds give different fields', () => {
    const a = createNoise(1);
    const b = createNoise(2);
    let differences = 0;
    for (let i = 0; i < 100; i++) {
      if (a.noise2(i * 0.1, 0) !== b.noise2(i * 0.1, 0)) differences++;
    }
    expect(differences).toBeGreaterThan(90);
  });

  test('accepts an Rng as well as a seed number', () => {
    const fromRng = createNoise(seeded(5));
    const fromSeed = createNoise(5);
    expect(fromRng.noise2(1.5, 2.5)).toBe(fromSeed.noise2(1.5, 2.5));
  });

  test('stays within [-1, 1]', () => {
    const n = createNoise(3);
    for (let i = 0; i < 5000; i++) {
      const v = n.noise2(i * 0.013, i * 0.027);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test('is not constant', () => {
    const n = createNoise(4);
    const values = new Set<number>();
    for (let i = 0; i < 200; i++) values.add(n.noise2(i * 0.1, i * 0.05));
    expect(values.size).toBeGreaterThan(100);
  });

  test('uses most of its output range', () => {
    const n = createNoise(4);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 20_000; i++) {
      const v = n.noise2(i * 0.0137, i * 0.0211);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBeLessThan(-0.8);
    expect(max).toBeGreaterThan(0.8);
  });

  test('is continuous — small steps give small changes', () => {
    const n = createNoise(6);
    let maxJump = 0;
    for (let i = 0; i < 2000; i++) {
      const x = i * 0.001;
      maxJump = Math.max(maxJump, Math.abs(n.noise2(x, 0.5) - n.noise2(x + 0.001, 0.5)));
    }
    // A discontinuous field would show jumps near the full output range.
    expect(maxJump).toBeLessThan(0.1);
  });

  test('varies along both axes', () => {
    const n = createNoise(9);
    const alongX = new Set<number>();
    const alongY = new Set<number>();
    for (let i = 0; i < 100; i++) {
      alongX.add(n.noise2(i * 0.1, 0));
      alongY.add(n.noise2(0, i * 0.1));
    }
    expect(alongX.size).toBeGreaterThan(50);
    expect(alongY.size).toBeGreaterThan(50);
  });
});

describe('noise3', () => {
  test('is deterministic and seed-dependent', () => {
    // Sample off the lattice: gradient noise is exactly 0 at lattice points, so
    // integer coordinates compare equal under every seed and prove nothing.
    const p: readonly [number, number, number] = [1.31, 2.17, 3.73];
    expect(createNoise(42).noise3(...p)).toBe(createNoise(42).noise3(...p));
    expect(createNoise(1).noise3(...p)).not.toBe(createNoise(2).noise3(...p));
  });

  test('is zero exactly on simplex vertices', () => {
    // Gradient noise is 0 wherever the sample sits on a vertex, because every
    // gradient is dotted with a zero displacement. In 3D the skew is (x+y+z)/3,
    // so an integer coordinate lands on a vertex iff its components sum to a
    // multiple of 3 — integerness alone is not the condition.
    const n = createNoise(42);

    for (const [x, y, z] of [[1, 2, 3], [0, 0, 0], [5, 5, 5], [2, 0, 1]]) {
      expect((x! + y! + z!) % 3).toBe(0);
      expect(n.noise3(x!, y!, z!)).toBe(0);
    }

    // Integer, but not a vertex: sums to 5.
    expect(n.noise3(-4, 7, 2)).not.toBe(0);
  });

  test('uses most of its output range', () => {
    const n = createNoise(3);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 20_000; i++) {
      const v = n.noise3(i * 0.0137, i * 0.0211, i * 0.0173);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    // A field stuck near zero would pass the range check but be useless.
    expect(min).toBeLessThan(-0.8);
    expect(max).toBeGreaterThan(0.8);
  });

  test('stays within [-1, 1]', () => {
    const n = createNoise(7);
    for (let i = 0; i < 5000; i++) {
      const v = n.noise3(i * 0.013, i * 0.021, i * 0.017);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test('varies along the third axis', () => {
    const n = createNoise(8);
    const values = new Set<number>();
    for (let i = 0; i < 100; i++) values.add(n.noise3(0.5, 0.5, i * 0.1));
    expect(values.size).toBeGreaterThan(50);
  });

  test('is continuous', () => {
    const n = createNoise(10);
    let maxJump = 0;
    for (let i = 0; i < 2000; i++) {
      const z = i * 0.001;
      maxJump = Math.max(
        maxJump,
        Math.abs(n.noise3(0.5, 0.5, z) - n.noise3(0.5, 0.5, z + 0.001)),
      );
    }
    expect(maxJump).toBeLessThan(0.1);
  });
});

describe('fbm2', () => {
  test('stays in range and is deterministic', () => {
    const n = createNoise(11);
    for (let i = 0; i < 1000; i++) {
      const v = n.fbm2(i * 0.01, i * 0.02);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(createNoise(11).fbm2(1, 2)).toBe(n.fbm2(1, 2));
  });

  test('one octave equals plain noise', () => {
    const n = createNoise(12);
    expect(n.fbm2(1.5, 2.5, 1)).toBeCloseTo(n.noise2(1.5, 2.5), 10);
  });

  test('more octaves add detail', () => {
    const n = createNoise(13);
    expect(n.fbm2(1.5, 2.5, 6)).not.toBe(n.fbm2(1.5, 2.5, 1));
  });

  test('zero octaves returns 0 rather than NaN', () => {
    expect(createNoise(14).fbm2(1, 1, 0)).toBe(0);
  });
});
