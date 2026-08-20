/**
 * L1 — pure, stateless math.
 *
 * Matrices are 4x4 from day one: 2D is a constrained use of Mat4 so the 3D
 * addon does not require a migration later. See the "Shipping 2D, staying
 * 3D-capable" note in the architecture doc.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Column-major 4x4, matching the layout uploaded to GL. */
export type Mat4 = Float32Array;

/** A seeded, reproducible source of randomness. */
export interface Rng {
  next: () => number;
  readonly seed: number;
}

// TODO(P2): vec/mat ops, seeded PRNG, simplex noise, easing, remap.
