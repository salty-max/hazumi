import { describe, expect, test } from 'bun:test';
import { Blend } from '@matter/graphics';
import { BatchList } from '../src/index';

describe('BatchList', () => {
  test('merges a uniform run into a single batch', () => {
    const list = new BatchList();
    for (let i = 0; i < 1000; i++) list.push(Blend.Normal);
    const batches = list.finish();

    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual({ start: 0, count: 1000, blend: Blend.Normal });
  });

  test('splits when the pipeline changes', () => {
    const list = new BatchList();
    list.push(Blend.Normal);
    list.push(Blend.Normal);
    list.push(Blend.Add);
    list.push(Blend.Normal);

    expect(list.finish()).toEqual([
      { start: 0, count: 2, blend: Blend.Normal },
      { start: 2, count: 1, blend: Blend.Add },
      { start: 3, count: 1, blend: Blend.Normal },
    ]);
  });

  /**
   * The rule that keeps transparency correct: only adjacent instances merge.
   * Grouping all Normal together and all Add together would give two batches
   * instead of many, but it would reorder overlapping transparent shapes and
   * change the image.
   */
  test('does not reorder to reduce batch count', () => {
    const list = new BatchList();
    for (let i = 0; i < 10; i++) {
      list.push(i % 2 === 0 ? Blend.Normal : Blend.Add);
    }
    const batches = list.finish();

    expect(batches).toHaveLength(10);
    // Draw order is preserved: the ranges tile the instance array in order.
    let expectedStart = 0;
    for (const batch of batches) {
      expect(batch.start).toBe(expectedStart);
      expectedStart += batch.count;
    }
  });

  test('sorting the same input would collapse it — proving the cost is real', () => {
    const modes = Array.from({ length: 10 }, (_, i) =>
      i % 2 === 0 ? Blend.Normal : Blend.Add,
    );

    const adjacent = new BatchList();
    for (const mode of modes) adjacent.push(mode);

    const sorted = new BatchList();
    for (const mode of modes.toSorted((a, b) => a - b)) sorted.push(mode);

    // Sorting would be 5x cheaper and visually wrong.
    expect(sorted.finish()).toHaveLength(2);
    expect(adjacent.finish()).toHaveLength(10);
  });

  test('batch ranges cover every instance exactly once', () => {
    const list = new BatchList();
    const modes = [0, 0, 1, 1, 1, 0, 1, 0, 0] as const;
    for (const m of modes) list.push(m as Blend);

    const batches = list.finish();
    const total = batches.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(modes.length);
    expect(batches[0]?.start).toBe(0);
  });

  test('an empty list produces no batches', () => {
    expect(new BatchList().finish()).toEqual([]);
  });

  test('reset clears everything', () => {
    const list = new BatchList();
    list.push(Blend.Normal);
    list.finish();
    list.reset();
    expect(list.finish()).toEqual([]);
    expect(list.length).toBe(0);
  });

  test('finish is idempotent for a closed list', () => {
    const list = new BatchList();
    list.push(Blend.Normal);
    const first = list.finish();
    expect(list.finish()).toEqual(first);
  });
});
