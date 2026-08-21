import type { SpriteFrame } from './spritesheet';

/**
 * How a clip behaves once it reaches the end.
 *
 * `hold` is what a one-shot needs — a jump or an attack should finish on its
 * last frame rather than snapping back to the first.
 */
export const ClipEnd = {
  Loop: 0,
  Hold: 1,
  PingPong: 2,
} as const;

export type ClipEnd = (typeof ClipEnd)[keyof typeof ClipEnd];

export interface ClipOptions {
  /**
   * Frames, by grid index or by name.
   *
   * Repeat an entry to hold it longer: `[0, 0, 1, 2]` gives frame 0 twice the
   * screen time. That is simpler than per-frame durations and is how most
   * sprite tooling expresses it.
   */
  readonly frames: readonly (number | string)[];
  /** Frames per second. Defaults to 12. */
  readonly fps?: number;
  /** Defaults to looping. */
  readonly end?: ClipEnd;
}

export class EmptyClipError extends Error {
  constructor(name: string) {
    super(`Animation clip ${JSON.stringify(name)} has no frames`);
    this.name = 'EmptyClipError';
  }
}

/**
 * A named animation.
 *
 * Sampling is stateless: `at(seconds)` is a pure function of time, so the same
 * elapsed time always gives the same frame. That is what lets a replay driven
 * by the seeded clock reproduce exactly, and it means a clip can be shared by
 * any number of entities without one advancing another.
 */
export interface AnimationClip {
  readonly name: string;
  readonly frames: readonly SpriteFrame[];
  readonly fps: number;
  readonly end: ClipEnd;
  /** Seconds for one pass through the frames. */
  readonly duration: number;
  /** Frame showing at `seconds` since the clip started. */
  at: (seconds: number) => SpriteFrame;
  /** Whether a non-looping clip has reached its last frame. */
  finished: (seconds: number) => boolean;
}

const DEFAULT_FPS = 12;

function wrapIndex(value: number, size: number): number {
  const r = value % size;
  return r < 0 ? r + size : r;
}

/**
 * Build a clip from frames already resolved out of a sheet.
 *
 * Resolution happens once, here — sampling never looks anything up, so a draw
 * loop calling `at()` per entity per frame does no work beyond arithmetic.
 */
export function createClip(
  name: string,
  frames: readonly SpriteFrame[],
  options: { fps?: number; end?: ClipEnd } = {},
): AnimationClip {
  if (frames.length === 0) throw new EmptyClipError(name);

  const fps = options.fps ?? DEFAULT_FPS;
  const end = options.end ?? ClipEnd.Loop;
  const count = frames.length;
  const duration = count / fps;

  const at = (seconds: number): SpriteFrame => {
    // A still frame has no timeline to sample.
    if (count === 1) return frames[0] as SpriteFrame;

    const step = Math.floor(seconds * fps);

    if (end === ClipEnd.Hold) {
      const clamped = Math.min(Math.max(step, 0), count - 1);
      return frames[clamped] as SpriteFrame;
    }

    if (end === ClipEnd.PingPong) {
      // A cycle runs forward then back without repeating either endpoint.
      const cycle = count * 2 - 2;
      const position = wrapIndex(step, cycle);
      const index = position < count ? position : cycle - position;
      return frames[index] as SpriteFrame;
    }

    return frames[wrapIndex(step, count)] as SpriteFrame;
  };

  return {
    name,
    frames,
    fps,
    end,
    duration,
    at,
    finished: (seconds: number): boolean =>
      end !== ClipEnd.Loop && seconds >= duration - 1 / fps,
  };
}
