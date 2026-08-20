import { describe, expect, test } from 'bun:test';
import { oklch } from '@matter/color';
import { ColorCache } from '../src/color-cache';

describe('ColorCache', () => {
  test('parses a string once and serves the rest from cache', () => {
    const cache = new ColorCache();
    const first = cache.resolve('#ff0000');
    for (let i = 0; i < 99; i++) cache.resolve('#ff0000');

    expect(cache.misses).toBe(1);
    expect(cache.hits).toBe(99);
    expect(cache.resolve('#ff0000')).toBe(first);
  });

  test('converts Oklch values without touching the cache', () => {
    const cache = new ColorCache();
    const rgba = cache.resolve(oklch(0.7, 0.15, 250));

    expect(rgba).toHaveLength(4);
    // No key to cache, so neither counter moves.
    expect(cache.misses).toBe(0);
    expect(cache.hits).toBe(0);
    expect(cache.size).toBe(0);
  });

  test('resolves a string and an equivalent object to the same colour', () => {
    const cache = new ColorCache();
    const fromString = cache.resolve('oklch(0.7 0.15 250)');
    const fromObject = cache.resolve(oklch(0.7, 0.15, 250));
    for (let i = 0; i < 4; i++) {
      expect(fromString[i]).toBeCloseTo(fromObject[i] as number, 6);
    }
  });

  test('propagates a parse failure rather than caching garbage', () => {
    const cache = new ColorCache();
    expect(() => cache.resolve('not-a-colour')).toThrow();
    expect(cache.size).toBe(0);
  });

  /**
   * The case an unbounded map gets wrong: building a colour from a continuous
   * value is ordinary sketch code, and it produces a fresh key every frame.
   */
  test('stays bounded when every colour is unique', () => {
    const cache = new ColorCache(64);
    for (let frame = 0; frame < 10_000; frame++) {
      cache.resolve(`oklch(0.7 0.2 ${(frame * 0.37).toFixed(3)})`);
    }

    expect(cache.size).toBeLessThanOrEqual(64);
    expect(cache.evictions).toBeGreaterThan(0);
    expect(cache.misses).toBe(10_000);
  });

  test('never evicts for a sketch that only uses literals', () => {
    const cache = new ColorCache(64);
    const palette = ['#ff0000', '#00ff00', '#0000ff', 'oklch(0.7 0.1 200)'];
    for (let frame = 0; frame < 5000; frame++) {
      for (const color of palette) cache.resolve(color);
    }

    expect(cache.evictions).toBe(0);
    expect(cache.size).toBe(palette.length);
    expect(cache.misses).toBe(palette.length);
  });

  test('rejects a capacity too small to evict meaningfully', () => {
    expect(() => new ColorCache(1)).toThrow(/at least 2/);
  });
});
