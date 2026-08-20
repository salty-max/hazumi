/**
 * Euclidean distance transform (Felzenszwalb & Huttenlocher, 2012).
 *
 * Computes, for every cell, the squared distance to the nearest cell where the
 * input is zero — exactly, in O(n), by treating each row and column as a lower
 * envelope of parabolas. Used to turn a rasterised glyph into a signed distance
 * field.
 */

const INF = 1e20;

/**
 * One-dimensional transform over `f[0..n)`, writing squared distances to `d`.
 *
 * `v` and `z` are scratch: the parabola indices and the boundaries between
 * them. They are passed in so a 2D pass can allocate once and reuse.
 */
export function edt1d(
  f: Float64Array,
  d: Float64Array,
  v: Int32Array,
  z: Float64Array,
  n: number,
): void {
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;

  let k = 0;
  for (let q = 1; q < n; q++) {
    let s = 0;
    // Pop parabolas from the envelope until this one's intersection lies to
    // the right of the current boundary.
    for (;;) {
      const vk = v[k] as number;
      s = ((f[q] as number) + q * q - ((f[vk] as number) + vk * vk)) / (2 * q - 2 * vk);
      if (s > (z[k] as number)) break;
      k--;
      if (k < 0) {
        k = 0;
        s = -INF;
        break;
      }
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }

  k = 0;
  for (let q = 0; q < n; q++) {
    while ((z[k + 1] as number) < q) k++;
    const vk = v[k] as number;
    d[q] = (q - vk) * (q - vk) + (f[vk] as number);
  }
}

/**
 * Two-dimensional transform, in place over `data`.
 *
 * `data` holds 0 where the feature is and INF elsewhere; on return it holds
 * squared distance to the nearest feature cell.
 */
export function edt2d(data: Float64Array, width: number, height: number): void {
  const longest = Math.max(width, height);
  const f = new Float64Array(longest);
  const d = new Float64Array(longest);
  const v = new Int32Array(longest);
  const z = new Float64Array(longest + 1);

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = data[y * width + x] as number;
    edt1d(f, d, v, z, height);
    for (let y = 0; y < height; y++) data[y * width + x] = d[y] as number;
  }

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) f[x] = data[row + x] as number;
    edt1d(f, d, v, z, width);
    for (let x = 0; x < width; x++) data[row + x] = d[x] as number;
  }
}

/**
 * Signed distance from a coverage bitmap, in pixels.
 *
 * Positive outside the shape, negative inside — the convention the SDF shader
 * expects. `alpha` is coverage in 0..1; anything at or above 0.5 counts as
 * inside.
 */
export function signedDistanceField(
  alpha: Float64Array,
  width: number,
  height: number,
): Float64Array {
  const inside = new Float64Array(width * height);
  const outside = new Float64Array(width * height);

  for (let i = 0; i < alpha.length; i++) {
    const solid = (alpha[i] as number) >= 0.5;
    // Distance to the nearest solid cell, and to the nearest empty one.
    outside[i] = solid ? 0 : INF;
    inside[i] = solid ? INF : 0;
  }

  edt2d(outside, width, height);
  edt2d(inside, width, height);

  const out = new Float64Array(width * height);
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.sqrt(outside[i] as number) - Math.sqrt(inside[i] as number);
  }
  return out;
}
