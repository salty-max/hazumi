/**
 * Simplex noise, seeded.
 *
 * Ken Perlin's simplex algorithm (the Gustavson formulation), with the
 * permutation table shuffled from a seeded Rng so a scene's noise field is
 * reproducible alongside its randomness.
 */

import { seeded, type Rng } from './rng';

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const F3 = 1 / 3;
const G3 = 1 / 6;

const GRAD3: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

export interface Noise {
  /** 2D noise, output roughly in [-1, 1]. */
  noise2: (x: number, y: number) => number;
  /** 3D noise, output roughly in [-1, 1]. */
  noise3: (x: number, y: number, z: number) => number;
  /** Fractal Brownian motion over noise2. */
  fbm2: (x: number, y: number, octaves?: number, persistence?: number) => number;
}

export function createNoise(source: Rng | number = 0): Noise {
  const rng = typeof source === 'number' ? seeded(source) : source;

  // Fisher-Yates over 0..255, then doubled to avoid an index wrap in the hot path.
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = rng.int(0, i + 1);
    const tmp = p[i] as number;
    p[i] = p[j] as number;
    p[j] = tmp;
  }

  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    const v = p[i & 255] as number;
    perm[i] = v;
    permMod12[i] = v % 12;
  }

  function grad2(gi: number, x: number, y: number): number {
    const g = GRAD3[gi] as readonly [number, number, number];
    return g[0] * x + g[1] * y;
  }

  function grad3(gi: number, x: number, y: number, z: number): number {
    const g = GRAD3[gi] as readonly [number, number, number];
    return g[0] * x + g[1] * y + g[2] * z;
  }

  const noise2 = (xin: number, yin: number): number => {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;

    const x0 = xin - (i - t);
    const y0 = yin - (j - t);

    // Which of the two triangles of the simplex cell are we in?
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;

    let n = 0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      t0 *= t0;
      n += t0 * t0 * grad2(permMod12[ii + (perm[jj] as number)] as number, x0, y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      t1 *= t1;
      n += t1 * t1 * grad2(permMod12[ii + i1 + (perm[jj + j1] as number)] as number, x1, y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      t2 *= t2;
      n += t2 * t2 * grad2(permMod12[ii + 1 + (perm[jj + 1] as number)] as number, x2, y2);
    }

    return 70 * n;
  };

  const noise3 = (xin: number, yin: number, zin: number): number => {
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;

    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const z0 = zin - (k - t);

    // Rank the coordinates to find which of the six tetrahedra we are in.
    let i1 = 0, j1 = 0, k1 = 0;
    let i2 = 0, j2 = 0, k2 = 0;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; i2 = 1; j2 = 1; }
      else if (x0 >= z0) { i1 = 1; i2 = 1; k2 = 1; }
      else { k1 = 1; i2 = 1; k2 = 1; }
    } else {
      if (y0 < z0) { k1 = 1; j2 = 1; k2 = 1; }
      else if (x0 < z0) { j1 = 1; j2 = 1; k2 = 1; }
      else { j1 = 1; i2 = 1; j2 = 1; }
    }

    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;

    const ii = i & 255, jj = j & 255, kk = k & 255;
    let n = 0;

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) {
      t0 *= t0;
      const gi = permMod12[ii + (perm[jj + (perm[kk] as number)] as number)] as number;
      n += t0 * t0 * grad3(gi, x0, y0, z0);
    }

    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) {
      t1 *= t1;
      const gi = permMod12[ii + i1 + (perm[jj + j1 + (perm[kk + k1] as number)] as number)] as number;
      n += t1 * t1 * grad3(gi, x1, y1, z1);
    }

    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) {
      t2 *= t2;
      const gi = permMod12[ii + i2 + (perm[jj + j2 + (perm[kk + k2] as number)] as number)] as number;
      n += t2 * t2 * grad3(gi, x2, y2, z2);
    }

    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) {
      t3 *= t3;
      const gi = permMod12[ii + 1 + (perm[jj + 1 + (perm[kk + 1] as number)] as number)] as number;
      n += t3 * t3 * grad3(gi, x3, y3, z3);
    }

    return 32 * n;
  };

  return {
    noise2,
    noise3,
    fbm2: (x: number, y: number, octaves = 4, persistence = 0.5): number => {
      let total = 0;
      let amplitude = 1;
      let frequency = 1;
      let max = 0;
      for (let o = 0; o < octaves; o++) {
        total += noise2(x * frequency, y * frequency) * amplitude;
        max += amplitude;
        amplitude *= persistence;
        frequency *= 2;
      }
      return max === 0 ? 0 : total / max;
    },
  };
}
