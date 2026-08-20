import { describe, expect, test } from 'bun:test';
import { seeded } from '../src/index';

describe('seeded', () => {
  test('the same seed produces the same sequence', () => {
    const a = seeded(1234);
    const b = seeded(1234);
    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  test('different seeds produce different sequences', () => {
    const a = Array.from({ length: 20 }, ((r) => () => r.next())(seeded(1)));
    const b = Array.from({ length: 20 }, ((r) => () => r.next())(seeded(2)));
    expect(a).not.toEqual(b);
  });

  test('output stays in [0, 1)', () => {
    const rng = seeded(99);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test('is reasonably uniform across ten buckets', () => {
    const rng = seeded(7);
    const buckets: number[] = Array.from({ length: 10 }, () => 0);
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      const bucket = Math.floor(rng.next() * 10);
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }
    for (const count of buckets) {
      // Expect n/10; allow a generous 10% band so this never flakes.
      expect(count).toBeGreaterThan(n / 10 - n / 100);
      expect(count).toBeLessThan(n / 10 + n / 100);
    }
  });

  test('range and int respect their bounds', () => {
    const rng = seeded(3);
    for (let i = 0; i < 1000; i++) {
      const f = rng.range(-5, 5);
      expect(f).toBeGreaterThanOrEqual(-5);
      expect(f).toBeLessThan(5);

      const n = rng.int(0, 4);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(4);
    }
  });

  test('int covers every value in a small range', () => {
    const rng = seeded(11);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rng.int(0, 3));
    expect([...seen].toSorted((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  test('bool honours its probability', () => {
    const rng = seeded(5);
    let trues = 0;
    for (let i = 0; i < 10_000; i++) if (rng.bool(0.25)) trues++;
    expect(trues / 10_000).toBeCloseTo(0.25, 1);

    expect(seeded(1).bool(0)).toBe(false);
    expect(seeded(1).bool(1)).toBe(true);
  });

  test('pick returns members and rejects empty arrays', () => {
    const rng = seeded(42);
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 50; i++) expect(items).toContain(rng.pick(items));
    expect(() => rng.pick([])).toThrow(/non-empty/);
  });

  test('gaussian has roughly unit mean and deviation', () => {
    const rng = seeded(8);
    const n = 50_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const v = rng.gaussian();
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / n;
    const sd = Math.sqrt(sumSq / n - mean * mean);
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(sd).toBeCloseTo(1, 1);
  });

  test('clone continues the sequence rather than restarting it', () => {
    const rng = seeded(77);
    for (let i = 0; i < 10; i++) rng.next();

    const copy = rng.clone();
    const fromOriginal = Array.from({ length: 5 }, () => rng.next());
    const fromCopy = Array.from({ length: 5 }, () => copy.next());

    expect(fromCopy).toEqual(fromOriginal);
  });

  test('a clone is independent of its source', () => {
    const rng = seeded(77);
    const copy = rng.clone();
    rng.next();
    rng.next();
    // Advancing the original must not move the copy.
    expect(copy.next()).toEqual(seeded(77).next());
  });

  test('exposes the seed it was built from', () => {
    expect(seeded(1234).seed).toBe(1234);
    expect(seeded(1234).clone().seed).toBe(1234);
  });
});
