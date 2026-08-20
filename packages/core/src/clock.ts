/** Read-only view of time, handed to draw callbacks. */
export interface Clock {
  /** Frames completed since start. */
  readonly frame: number;
  /** Seconds since start. */
  readonly elapsed: number;
  /** Seconds since the previous frame. */
  readonly dt: number;
}

export interface ClockOptions {
  /**
   * Largest dt, in seconds, that will be reported. A backgrounded tab can
   * produce a multi-second gap; without a cap, physics integrates that in one
   * step and everything explodes.
   */
  readonly maxDelta?: number;
  /** Fixed step size, in seconds, for `stepFixed`. Defaults to 1/60. */
  readonly fixedStep?: number;
  /**
   * Ceiling on fixed steps per frame. Without it, a long stall makes each frame
   * run more steps than it can afford and the simulation never catches up.
   */
  readonly maxFixedSteps?: number;
}

const DEFAULT_MAX_DELTA = 0.25;
const DEFAULT_FIXED_STEP = 1 / 60;
const DEFAULT_MAX_FIXED_STEPS = 5;

/**
 * Frame timing, decoupled from any particular clock source.
 *
 * `advance` takes an explicit timestamp rather than reading `performance.now()`
 * so a sketch can be driven frame-by-frame at a fixed rate for deterministic
 * offline rendering — the same reason the RNG is seeded.
 */
export class SketchClock implements Clock {
  #frame = 0;
  #elapsed = 0;
  #dt = 0;
  #last: number | null = null;
  #accumulator = 0;

  readonly maxDelta: number;
  readonly fixedStep: number;
  readonly maxFixedSteps: number;

  constructor(options: ClockOptions = {}) {
    this.maxDelta = options.maxDelta ?? DEFAULT_MAX_DELTA;
    this.fixedStep = options.fixedStep ?? DEFAULT_FIXED_STEP;
    this.maxFixedSteps = options.maxFixedSteps ?? DEFAULT_MAX_FIXED_STEPS;
  }

  get frame(): number {
    return this.#frame;
  }

  get elapsed(): number {
    return this.#elapsed;
  }

  get dt(): number {
    return this.#dt;
  }

  /** Unconsumed time waiting in the fixed-step accumulator, in seconds. */
  get pending(): number {
    return this.#accumulator;
  }

  /**
   * Advance to `nowSeconds`, returning the clamped delta.
   *
   * The first call establishes the origin and reports dt = 0, so a slow startup
   * does not show up as an enormous first frame.
   */
  advance(nowSeconds: number): number {
    if (this.#last === null) {
      this.#last = nowSeconds;
      this.#dt = 0;
      this.#frame++;
      return 0;
    }

    const raw = nowSeconds - this.#last;
    this.#last = nowSeconds;

    // Clamp before accumulating, and never go backwards.
    const dt = Math.min(Math.max(raw, 0), this.maxDelta);
    this.#dt = dt;
    this.#elapsed += dt;
    this.#accumulator += dt;
    this.#frame++;
    return dt;
  }

  /**
   * Drain the accumulator in fixed increments, calling `step` for each.
   *
   * Returns the number of steps taken. Leftover time stays in the accumulator
   * for the next frame; the caller can use `alpha()` to interpolate.
   */
  stepFixed(step: (fixedDt: number) => void): number {
    let steps = 0;
    while (this.#accumulator >= this.fixedStep && steps < this.maxFixedSteps) {
      this.#accumulator -= this.fixedStep;
      step(this.fixedStep);
      steps++;
    }

    // Give up on time we could not afford, rather than accruing a debt that
    // makes every subsequent frame worse.
    if (steps === this.maxFixedSteps) this.#accumulator = 0;

    return steps;
  }

  /** How far between fixed steps we are, 0–1, for render interpolation. */
  alpha(): number {
    return this.#accumulator / this.fixedStep;
  }

  reset(): void {
    this.#frame = 0;
    this.#elapsed = 0;
    this.#dt = 0;
    this.#last = null;
    this.#accumulator = 0;
  }
}
