import { describe, expect, test } from "bun:test";
import { Blend } from "@matter/graphics";
import { BatchList, Pipeline } from "../src/index";

describe("BatchList", () => {
  test("merges a uniform run into a single batch", () => {
    const list = new BatchList();
    for (let i = 0; i < 1000; i++) list.push(Blend.Normal);
    const batches = list.finish();

    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual({
      start: 0,
      count: 1000,
      blend: Blend.Normal,
      pipeline: Pipeline.Shape,
      texture: -1,
      fanCount: 0,
    });
  });

  test("splits when the pipeline changes", () => {
    const list = new BatchList();
    list.push(Blend.Normal);
    list.push(Blend.Normal);
    list.push(Blend.Add);
    list.push(Blend.Normal);

    expect(list.finish()).toEqual([
      {
        start: 0,
        count: 2,
        blend: Blend.Normal,
        pipeline: Pipeline.Shape,
        texture: -1,
        fanCount: 0,
      },
      { start: 2, count: 1, blend: Blend.Add, pipeline: Pipeline.Shape, texture: -1, fanCount: 0 },
      {
        start: 3,
        count: 1,
        blend: Blend.Normal,
        pipeline: Pipeline.Shape,
        texture: -1,
        fanCount: 0,
      },
    ]);
  });

  /**
   * The rule that keeps transparency correct: only adjacent instances merge.
   * Grouping all Normal together and all Add together would give two batches
   * instead of many, but it would reorder overlapping transparent shapes and
   * change the image.
   */
  test("does not reorder to reduce batch count", () => {
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

  test("sorting the same input would collapse it — proving the cost is real", () => {
    const modes = Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? Blend.Normal : Blend.Add));

    const adjacent = new BatchList();
    for (const mode of modes) adjacent.push(mode);

    const sorted = new BatchList();
    for (const mode of modes.toSorted((a, b) => a - b)) sorted.push(mode);

    // Sorting would be 5x cheaper and visually wrong.
    expect(sorted.finish()).toHaveLength(2);
    expect(adjacent.finish()).toHaveLength(10);
  });

  test("batch ranges cover every instance exactly once", () => {
    const list = new BatchList();
    const modes = [0, 0, 1, 1, 1, 0, 1, 0, 0] as const;
    for (const m of modes) list.push(m as Blend);

    const batches = list.finish();
    const total = batches.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(modes.length);
    expect(batches[0]?.start).toBe(0);
  });

  test("a pipeline change splits a batch even when blend matches", () => {
    const list = new BatchList();
    list.push(Blend.Normal, Pipeline.Shape);
    list.push(Blend.Normal, Pipeline.Glyph);
    list.push(Blend.Normal, Pipeline.Shape);

    const batches = list.finish();
    expect(batches).toHaveLength(3);
    expect(batches.map((b) => b.pipeline)).toEqual([
      Pipeline.Shape,
      Pipeline.Glyph,
      Pipeline.Shape,
    ]);
  });

  test("path fills and strokes share one vertex cursor", () => {
    const list = new BatchList();
    list.pushSolo(Blend.Normal, Pipeline.PathFill, 9, 3);
    list.pushSolo(Blend.Normal, Pipeline.PathStroke, 6);
    list.pushSolo(Blend.Normal, Pipeline.PathFill, 12, 6);

    const batches = list.finish();
    // One array, so starts advance by vertex count rather than restarting.
    expect(batches.map((b) => b.start)).toEqual([0, 9, 15]);
    expect(batches.map((b) => b.fanCount)).toEqual([3, 0, 6]);
  });

  test("solo batches never merge, even when identical", () => {
    // Two fills in a row must stay separate: one stencil pass each, or the
    // first path's winding count decides the second one's interior.
    const list = new BatchList();
    list.pushSolo(Blend.Normal, Pipeline.PathFill, 6, 3);
    list.pushSolo(Blend.Normal, Pipeline.PathFill, 6, 3);
    expect(list.finish()).toHaveLength(2);
  });

  test("a solo batch closes any open run first, preserving order", () => {
    const list = new BatchList();
    list.push(Blend.Normal, Pipeline.Shape);
    list.push(Blend.Normal, Pipeline.Shape);
    list.pushSolo(Blend.Normal, Pipeline.PathFill, 3);
    list.push(Blend.Normal, Pipeline.Shape);

    const batches = list.finish();
    expect(batches.map((b) => b.pipeline)).toEqual([
      Pipeline.Shape,
      Pipeline.PathFill,
      Pipeline.Shape,
    ]);
    // The shape cursor resumes where it left off.
    expect(batches[2]?.start).toBe(2);
  });

  test("an empty solo batch is ignored", () => {
    const list = new BatchList();
    list.pushSolo(Blend.Normal, Pipeline.PathFill, 0);
    expect(list.finish()).toEqual([]);
  });

  test("each pipeline indexes its own instance array", () => {
    const list = new BatchList();
    list.push(Blend.Normal, Pipeline.Shape);
    list.push(Blend.Normal, Pipeline.Shape);
    list.push(Blend.Normal, Pipeline.Glyph);
    list.push(Blend.Normal, Pipeline.Shape);

    const batches = list.finish();
    // Shapes: 0..2 then 2..3. Glyphs restart at 0 — they are a separate array.
    expect(batches[0]).toMatchObject({ start: 0, count: 2, pipeline: Pipeline.Shape });
    expect(batches[1]).toMatchObject({ start: 0, count: 1, pipeline: Pipeline.Glyph });
    expect(batches[2]).toMatchObject({ start: 2, count: 1, pipeline: Pipeline.Shape });
  });

  test("a texture change splits a batch even when pipeline and blend match", () => {
    // Two fonts in one frame. Merging these would draw the first font's
    // glyphs with the second font's atlas.
    const list = new BatchList();
    list.push(Blend.Normal, Pipeline.Glyph, 7);
    list.push(Blend.Normal, Pipeline.Glyph, 7);
    list.push(Blend.Normal, Pipeline.Glyph, 9);

    const batches = list.finish();
    expect(batches).toHaveLength(2);
    expect(batches[0]).toMatchObject({ count: 2, texture: 7 });
    expect(batches[1]).toMatchObject({ count: 1, texture: 9 });
  });

  test("shapes report no texture", () => {
    const list = new BatchList();
    list.push(Blend.Normal);
    expect(list.finish()[0]?.texture).toBe(-1);
    expect(new BatchList().finish()).toEqual([]);
  });

  test("an empty list produces no batches", () => {
    expect(new BatchList().finish()).toEqual([]);
  });

  test("reset clears everything", () => {
    const list = new BatchList();
    list.push(Blend.Normal);
    list.finish();
    list.reset();
    expect(list.finish()).toEqual([]);
    expect(list.length).toBe(0);
  });

  test("finish is idempotent for a closed list", () => {
    const list = new BatchList();
    list.push(Blend.Normal);
    const first = list.finish();
    expect(list.finish()).toEqual(first);
  });
});
