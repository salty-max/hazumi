import { describe, expect, test } from 'bun:test';
import { ClipEnd, createClip, EmptyClipError } from '../src/animation';
import type { SpriteFrame } from '../src/spritesheet';

const frame = (id: number): SpriteFrame =>
  ({ source: {} as never, x: id, y: 0, width: 16, height: 16 });

// A tuple, not an array: under noUncheckedIndexedAccess an array index is
// possibly-undefined, and every assertion below compares against one.
const four: readonly [SpriteFrame, SpriteFrame, SpriteFrame, SpriteFrame] = [
  frame(0), frame(1), frame(2), frame(3),
];

describe('createClip', () => {
  test('reports its timing', () => {
    const clip = createClip('run', four, { fps: 8 });
    expect(clip.name).toBe('run');
    expect(clip.fps).toBe(8);
    expect(clip.duration).toBe(0.5);
  });

  test('defaults to 12fps and looping', () => {
    const clip = createClip('idle', four);
    expect(clip.fps).toBe(12);
    expect(clip.end).toBe(ClipEnd.Loop);
  });

  test('rejects an empty clip rather than sampling nothing', () => {
    expect(() => createClip('broken', [])).toThrow(EmptyClipError);
  });
});

describe('sampling', () => {
  const clip = createClip('run', four, { fps: 4 });

  test('advances one frame per interval', () => {
    expect(clip.at(0)).toBe(four[0]);
    expect(clip.at(0.25)).toBe(four[1]);
    expect(clip.at(0.5)).toBe(four[2]);
    expect(clip.at(0.75)).toBe(four[3]);
  });

  test('holds a frame for its whole interval', () => {
    expect(clip.at(0.0)).toBe(four[0]);
    expect(clip.at(0.24)).toBe(four[0]);
    expect(clip.at(0.26)).toBe(four[1]);
  });

  test('is stateless — the same time always gives the same frame', () => {
    // What lets one clip be shared by many entities, and what makes a replay
    // driven by the seeded clock reproduce exactly.
    for (const t of [0, 0.3, 1.1, 7.7]) expect(clip.at(t)).toBe(clip.at(t));
  });

  test('a single-frame clip ignores time entirely', () => {
    const still = createClip('stand', [frame(9)]);
    expect(still.at(0)).toBe(still.at(1000));
  });
});

describe('loop', () => {
  const clip = createClip('run', four, { fps: 4, end: ClipEnd.Loop });

  test('wraps to the start', () => {
    expect(clip.at(1)).toBe(four[0]);
    expect(clip.at(1.25)).toBe(four[1]);
  });

  test('handles negative time', () => {
    // Time can run backwards in a scrubbing tool or a rewind.
    expect(clip.at(-0.25)).toBe(four[3]);
  });

  test('never reports finished', () => {
    expect(clip.finished(100)).toBe(false);
  });
});

describe('hold', () => {
  const clip = createClip('jump', four, { fps: 4, end: ClipEnd.Hold });

  test('stops on the last frame', () => {
    // A one-shot snapping back to frame 0 is the classic animation bug.
    expect(clip.at(0.75)).toBe(four[3]);
    expect(clip.at(5)).toBe(four[3]);
  });

  test('reports finished once it reaches the last frame', () => {
    expect(clip.finished(0)).toBe(false);
    expect(clip.finished(0.5)).toBe(false);
    expect(clip.finished(0.75)).toBe(true);
    expect(clip.finished(9)).toBe(true);
  });

  test('clamps negative time to the first frame', () => {
    expect(clip.at(-1)).toBe(four[0]);
  });
});

describe('ping-pong', () => {
  const clip = createClip('bob', four, { fps: 4, end: ClipEnd.PingPong });

  test('runs forward then back without repeating the endpoints', () => {
    const seen = [0, 1, 2, 3, 4, 5, 6, 7].map((step) => clip.at(step * 0.25));
    // 0 1 2 3 2 1 then back to 0 — six steps per cycle for four frames.
    expect(seen).toEqual([
      four[0], four[1], four[2], four[3], four[2], four[1], four[0], four[1],
    ]);
  });

  test('a two-frame clip alternates', () => {
    const two: readonly [SpriteFrame, SpriteFrame] = [frame(0), frame(1)];
    const pp = createClip('blink', two, { fps: 2, end: ClipEnd.PingPong });
    expect([0, 1, 2, 3].map((n) => pp.at(n * 0.5))).toEqual([two[0], two[1], two[0], two[1]]);
  });
});

describe('repeated frames hold longer', () => {
  test('a repeat doubles a frame’s screen time', () => {
    // The idiom instead of per-frame durations.
    const held = createClip('idle', [four[0], four[0], four[1]], { fps: 3 });
    expect(held.at(0)).toBe(four[0]);
    expect(held.at(1 / 3)).toBe(four[0]);
    expect(held.at(2 / 3)).toBe(four[1]);
  });
});
