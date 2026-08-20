/**
 * Seeded, reproducible randomness.
 *
 * Seeded by default rather than as an opt-in: re-running a generative sketch
 * and getting the same image back is table stakes, and it is what makes the
 * deterministic offline rendering in the architecture doc possible. There is no
 * global RNG here — an Rng is a value you hold, so two systems cannot perturb
 * each other's sequence by drawing in a different order.
 */

export interface Rng {
  /** The seed this generator was created from. */
  readonly seed: number;
  /** Next value in [0, 1). */
  next: () => number;
  /** Float in [min, max). */
  range: (min: number, max: number) => number;
  /** Integer in [min, max). */
  int: (min: number, max: number) => number;
  /** True with probability `p`. */
  bool: (p?: number) => boolean;
  /** Uniform choice from a non-empty array. */
  pick: <T>(items: readonly T[]) => T;
  /** Normally distributed, mean 0, standard deviation 1. */
  gaussian: () => number;
  /** An independent copy positioned at the same point in the sequence. */
  clone: () => Rng;
}

/**
 * mulberry32: small, fast, and good enough for visual work. Not for anything
 * cryptographic.
 */
export function seeded(seed: number): Rng {
  return create(seed, seed >>> 0);
}

function create(seed: number, initialState: number): Rng {
  let state = initialState >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const range = (min: number, max: number): number => min + next() * (max - min);

  return {
    seed,
    next,
    range,
    int: (min: number, max: number): number => Math.floor(range(min, max)),
    bool: (p = 0.5): boolean => next() < p,
    pick: <T,>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('pick() needs a non-empty array');
      return items[Math.floor(next() * items.length)] as T;
    },
    gaussian: (): number => {
      // Box-Muller. u must be non-zero or log() diverges.
      let u = 0;
      while (u === 0) u = next();
      const v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    // Captures the current state, so the copy continues the sequence rather
    // than restarting it.
    clone: (): Rng => create(seed, state),
  };
}
