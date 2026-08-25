/**
 * Interpolating a value over time.
 *
 * Sampled rather than ticked, like animation clips: `at(seconds)` is a pure
 * function of elapsed time, holding no state and mutating nothing. That is the
 * whole design. A tween object that advances itself has to be owned, updated
 * once per frame, and cleaned up when whatever it animates disappears; a
 * function of time can be shared by any number of entities, re-read at any
 * point, and rewound by passing a smaller number.
 *
 * It also means a tween costs nothing when nothing is looking at it, and that a
 * scene stays as deterministic as its clock — the same elapsed time always
 * gives the same value.
 *
 * ```ts
 * const fade = tween({ from: 0, to: 1, duration: 0.4, ease: easing.quadOut });
 * fill(withAlpha(colour, fade.at(time.elapsed - startedAt)));
 * ```
 */
import { easing } from "@hazumi/math";
import { ClipEnd } from "./animation";

/** How a tween behaves once its duration has elapsed. Shared with clips. */
export { ClipEnd };

/** How one tween runs. */
export interface TweenOptions {
  /** Value at t = 0. */
  readonly from: number;
  /** Value at the end of `duration`. */
  readonly to: number;
  /** Seconds for one pass. Must be greater than zero. */
  readonly duration: number;
  /** Shapes the pass. Defaults to linear. */
  readonly ease?: (t: number) => number;
  /** Seconds to hold `from` before starting. Defaults to 0. */
  readonly delay?: number;
  /** What happens after one pass. Defaults to holding at `to`. */
  readonly end?: ClipEnd;
}

/**
 * A value over time, sampled rather than ticked.
 *
 * `at(seconds)` is a pure function of elapsed time, so a tween holds no state
 * of its own: it survives a pause, a rewind, and being asked out of order.
 */
export interface Tween {
  /** Seconds for one pass, not counting `delay`. */
  readonly duration: number;
  /** Seconds before the value starts moving. */
  readonly delay: number;
  /** Value at `seconds` since the tween started. */
  at: (seconds: number) => number;
  /** Whether a non-looping tween has reached its end. */
  finished: (seconds: number) => boolean;
}

/** A tween was built with a duration that is not a positive number. */
export class InvalidTweenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTweenError";
  }
}

/** Progress through one pass, in 0..1, after delay and repetition. */
function progress(seconds: number, duration: number, delay: number, end: ClipEnd): number {
  const elapsed = seconds - delay;
  if (elapsed <= 0) return 0;
  if (elapsed >= duration) {
    if (end === ClipEnd.Hold) return 1;
    if (end === ClipEnd.Loop) return (elapsed % duration) / duration;
    // Ping-pong: a full cycle is out and back, so the second half runs in
    // reverse rather than snapping to the start.
    const cycle = (elapsed % (duration * 2)) / duration;
    return cycle <= 1 ? cycle : 2 - cycle;
  }
  return elapsed / duration;
}

/** Interpolate between two numbers over time. */
export function tween(options: TweenOptions): Tween {
  const { from, to, duration } = options;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new InvalidTweenError(`Tween duration must be greater than zero, got ${duration}.`);
  }
  const delay = options.delay ?? 0;
  if (!Number.isFinite(delay) || delay < 0) {
    throw new InvalidTweenError(`Tween delay cannot be negative, got ${delay}.`);
  }
  const ease = options.ease ?? easing.linear;
  const end = options.end ?? ClipEnd.Hold;

  return {
    duration,
    delay,
    at: (seconds: number): number =>
      from + (to - from) * ease(progress(seconds, duration, delay, end)),
    // Looping and ping-ponging never finish, which is what makes this a
    // question worth asking rather than a comparison the caller can inline.
    finished: (seconds: number): boolean => end === ClipEnd.Hold && seconds - delay >= duration,
  };
}

/**
 * Run tweens one after another, as one tween.
 *
 * Each step starts where the previous ended, so only the first needs a `from`.
 * The result is a `Tween` like any other, so a sequence nests inside a sequence.
 */
export function sequence(
  steps: readonly TweenOptions[],
  options: { readonly end?: ClipEnd } = {},
): Tween {
  if (steps.length === 0) throw new InvalidTweenError("A sequence needs at least one step.");
  const parts = steps.map((step) => tween(step));
  const spans = parts.map((part) => part.delay + part.duration);
  const total = spans.reduce((sum, span) => sum + span, 0);
  const end = options.end ?? ClipEnd.Hold;

  const sample = (seconds: number): number => {
    let remaining = seconds;
    for (const [index, span] of spans.entries()) {
      if (remaining < span || index === parts.length - 1) {
        return (parts[index] as Tween).at(remaining);
      }
      remaining -= span;
    }
    // Unreachable: the loop returns on its last iteration.
    return (parts.at(-1) as Tween).at(remaining);
  };

  return {
    duration: total,
    delay: 0,
    at: (seconds: number): number => {
      if (seconds <= 0) return sample(0);
      if (seconds < total || end === ClipEnd.Hold) return sample(Math.min(seconds, total));
      if (end === ClipEnd.Loop) return sample(seconds % total);
      const cycle = (seconds % (total * 2)) / total;
      return sample(cycle <= 1 ? cycle * total : (2 - cycle) * total);
    },
    finished: (seconds: number): boolean => end === ClipEnd.Hold && seconds >= total,
  };
}
