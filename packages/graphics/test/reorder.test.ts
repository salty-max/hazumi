import { describe, expect, test } from "bun:test";
import { CommandBuffer, decode } from "../src/index";

/**
 * Depth ordering rewrites the stream before any backend sees it, so these
 * assert on the decoded order — the thing a renderer actually walks, rather
 * than on the word array, which would pass even if the opcodes desynced.
 */
function circleXs(buffer: CommandBuffer): number[] {
  const xs: number[] = [];
  decode(buffer, { circle: (x: number): void => void xs.push(x) });
  return xs;
}

function texts(buffer: CommandBuffer): string[] {
  const seen: string[] = [];
  decode(buffer, {
    text: (_x: number, _y: number, content: string): void => void seen.push(content),
  });
  return seen;
}

/** Encode one circle per x, returning the word boundary after each. */
function marks(buffer: CommandBuffer, groups: readonly (readonly number[])[]): number[] {
  const bounds = [buffer.length];
  for (const group of groups) {
    for (const x of group) buffer.circle(x, 0, 1);
    bounds.push(buffer.length);
  }
  return bounds;
}

describe("reorderSegments", () => {
  test("paints lower depth first", () => {
    const b = new CommandBuffer();
    const m = marks(b, [[1], [2]]);
    b.reorderSegments([
      { depth: 5, start: m[0]!, end: m[1]! },
      { depth: 1, start: m[1]!, end: m[2]! },
    ]);
    expect(circleXs(b)).toEqual([2, 1]);
  });

  test("leaves commands encoded before the first segment where they are", () => {
    // The failure this guards: segments start after the frame's opening style,
    // so writing the reordered words back at index 0 would overwrite that
    // prefix and shift everything after it, desyncing opcodes from operands.
    const b = new CommandBuffer();
    b.setFill(1, 0, 0, 1);
    b.setBlend(0);
    const m = marks(b, [[1], [2]]);
    b.reorderSegments([
      { depth: 5, start: m[0]!, end: m[1]! },
      { depth: 1, start: m[1]!, end: m[2]! },
    ]);

    const seen: string[] = [];
    decode(b, {
      setFill: (): void => void seen.push("fill"),
      setBlend: (): void => void seen.push("blend"),
      circle: (x: number): void => void seen.push(`circle${x}`),
    });
    expect(seen).toEqual(["fill", "blend", "circle2", "circle1"]);
  });

  test("keeps call order within one depth", () => {
    const b = new CommandBuffer();
    const m = marks(b, [[1], [2], [3]]);
    b.reorderSegments([
      { depth: 0, start: m[0]!, end: m[1]! },
      { depth: 0, start: m[1]!, end: m[2]! },
      { depth: 0, start: m[2]!, end: m[3]! },
    ]);
    expect(circleXs(b)).toEqual([1, 2, 3]);
  });

  test("a segment of several commands travels whole", () => {
    const b = new CommandBuffer();
    const m = marks(b, [[1, 2], [3]]);
    b.reorderSegments([
      { depth: 9, start: m[0]!, end: m[1]! },
      { depth: 0, start: m[1]!, end: m[2]! },
    ]);
    expect(circleXs(b)).toEqual([3, 1, 2]);
  });

  test("interleaves depths across many segments", () => {
    const b = new CommandBuffer();
    const m = marks(b, [[1], [2], [3], [4]]);
    b.reorderSegments([
      { depth: 2, start: m[0]!, end: m[1]! },
      { depth: 0, start: m[1]!, end: m[2]! },
      { depth: 2, start: m[2]!, end: m[3]! },
      { depth: 1, start: m[3]!, end: m[4]! },
    ]);
    // depth 0, then 1, then the two at depth 2 in the order they were written.
    expect(circleXs(b)).toEqual([2, 4, 1, 3]);
  });

  test("leaves the stream alone when the order already holds", () => {
    const b = new CommandBuffer();
    const m = marks(b, [[1], [2]]);
    b.reorderSegments([
      { depth: 0, start: m[0]!, end: m[1]! },
      { depth: 3, start: m[1]!, end: m[2]! },
    ]);
    expect(circleXs(b)).toEqual([1, 2]);
  });

  test("fewer than two segments is a no-op", () => {
    const b = new CommandBuffer();
    const m = marks(b, [[1, 2]]);
    b.reorderSegments([{ depth: 4, start: m[0]!, end: m[1]! }]);
    expect(circleXs(b)).toEqual([1, 2]);
  });

  test("string ids survive the move", () => {
    const b = new CommandBuffer();
    b.setFont("Georgia");
    const a0 = b.length;
    b.text(0, 0, "second");
    const a1 = b.length;
    b.text(0, 0, "first");
    const a2 = b.length;
    b.reorderSegments([
      { depth: 2, start: a0, end: a1 },
      { depth: 1, start: a1, end: a2 },
    ]);
    expect(texts(b)).toEqual(["first", "second"]);
  });

  test("the reused scratch does not leak a previous frame into this one", () => {
    // The scratch array is kept across calls so a frame allocates nothing. That
    // is only safe if every reorder overwrites what it reads, so run a wide
    // frame and then a narrow one and check the narrow result is not padded
    // with the wide frame's leftovers.
    const wide = new CommandBuffer();
    const wm = marks(wide, [[1], [2], [3], [4], [5], [6]]);
    wide.reorderSegments(
      wm.slice(0, -1).map((start, i) => ({ depth: 6 - i, start, end: wm[i + 1]! })),
    );
    expect(circleXs(wide)).toEqual([6, 5, 4, 3, 2, 1]);

    wide.reset();
    const nm = marks(wide, [[7], [8]]);
    wide.reorderSegments([
      { depth: 1, start: nm[0]!, end: nm[1]! },
      { depth: 0, start: nm[1]!, end: nm[2]! },
    ]);
    expect(circleXs(wide)).toEqual([8, 7]);
  });
});
