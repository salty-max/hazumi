/**
 * Column-major 4x4 matrices, matching what GL expects.
 *
 * 4x4 from day one even though the library ships 2D: a separate Mat2D would
 * have to be migrated off when 3D arrives. See "2D now, 3D later" in AGENTS.md.
 *
 * Every function takes an `out` matrix and writes in place, so the transform
 * stack and camera can run per-frame without allocating.
 */

export type Mat4 = Float32Array;

/** A new identity matrix. Allocates — not for the hot path. */
export function mat4(): Mat4 {
  const m = new Float32Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

export function identity(out: Mat4): Mat4 {
  out.fill(0);
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}

export function copy(out: Mat4, src: Mat4): Mat4 {
  out.set(src);
  return out;
}

/**
 * Orthographic projection.
 *
 * For screen space with the origin top-left, use
 * `ortho(out, 0, width, height, 0, -1, 1)`.
 */
export function ortho(
  out: Mat4,
  left: number,
  right: number,
  bottom: number,
  top: number,
  near: number,
  far: number,
): Mat4 {
  const lr = 1 / (left - right);
  const bt = 1 / (bottom - top);
  const nf = 1 / (near - far);

  out.fill(0);
  out[0] = -2 * lr;
  out[5] = -2 * bt;
  out[10] = 2 * nf;
  out[12] = (left + right) * lr;
  out[13] = (top + bottom) * bt;
  out[14] = (far + near) * nf;
  out[15] = 1;
  return out;
}

/** Perspective projection. Unused in 2D, present so the UBO layout is settled. */
export function perspective(
  out: Mat4,
  fovYRadians: number,
  aspect: number,
  near: number,
  far: number,
): Mat4 {
  const f = 1 / Math.tan(fovYRadians / 2);
  const nf = 1 / (near - far);

  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

/** out = a * b. Safe when `out` aliases `a` or `b`. */
export function multiply(out: Mat4, a: Mat4, b: Mat4): Mat4 {
  const a00 = a[0] as number,
    a01 = a[1] as number,
    a02 = a[2] as number,
    a03 = a[3] as number;
  const a10 = a[4] as number,
    a11 = a[5] as number,
    a12 = a[6] as number,
    a13 = a[7] as number;
  const a20 = a[8] as number,
    a21 = a[9] as number,
    a22 = a[10] as number,
    a23 = a[11] as number;
  const a30 = a[12] as number,
    a31 = a[13] as number,
    a32 = a[14] as number,
    a33 = a[15] as number;

  for (let i = 0; i < 4; i++) {
    const b0 = b[i * 4] as number;
    const b1 = b[i * 4 + 1] as number;
    const b2 = b[i * 4 + 2] as number;
    const b3 = b[i * 4 + 3] as number;
    out[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  }
  return out;
}

export function translate(out: Mat4, m: Mat4, x: number, y: number, z: number): Mat4 {
  if (out !== m) out.set(m);
  const m00 = m[0] as number,
    m01 = m[1] as number,
    m02 = m[2] as number,
    m03 = m[3] as number;
  const m10 = m[4] as number,
    m11 = m[5] as number,
    m12 = m[6] as number,
    m13 = m[7] as number;
  const m20 = m[8] as number,
    m21 = m[9] as number,
    m22 = m[10] as number,
    m23 = m[11] as number;

  out[12] = m00 * x + m10 * y + m20 * z + (m[12] as number);
  out[13] = m01 * x + m11 * y + m21 * z + (m[13] as number);
  out[14] = m02 * x + m12 * y + m22 * z + (m[14] as number);
  out[15] = m03 * x + m13 * y + m23 * z + (m[15] as number);
  return out;
}

export function scale(out: Mat4, m: Mat4, x: number, y: number, z: number): Mat4 {
  for (let i = 0; i < 4; i++) {
    out[i] = (m[i] as number) * x;
    out[i + 4] = (m[i + 4] as number) * y;
    out[i + 8] = (m[i + 8] as number) * z;
    out[i + 12] = m[i + 12] as number;
  }
  return out;
}

/** Rotation about +z — the only axis 2D needs. */
export function rotateZ(out: Mat4, m: Mat4, radians: number): Mat4 {
  const s = Math.sin(radians);
  const c = Math.cos(radians);

  const a00 = m[0] as number,
    a01 = m[1] as number,
    a02 = m[2] as number,
    a03 = m[3] as number;
  const a10 = m[4] as number,
    a11 = m[5] as number,
    a12 = m[6] as number,
    a13 = m[7] as number;

  if (out !== m) out.set(m);

  out[0] = a00 * c + a10 * s;
  out[1] = a01 * c + a11 * s;
  out[2] = a02 * c + a12 * s;
  out[3] = a03 * c + a13 * s;
  out[4] = a10 * c - a00 * s;
  out[5] = a11 * c - a01 * s;
  out[6] = a12 * c - a02 * s;
  out[7] = a13 * c - a03 * s;
  return out;
}

/** Transform a 2D point, treating it as (x, y, 0, 1). Writes into `out`. */
export function transformPoint2(
  m: Mat4,
  x: number,
  y: number,
  out: { x: number; y: number },
): void {
  const w = (m[3] as number) * x + (m[7] as number) * y + (m[15] as number);
  const iw = w === 0 ? 1 : 1 / w;
  out.x = ((m[0] as number) * x + (m[4] as number) * y + (m[12] as number)) * iw;
  out.y = ((m[1] as number) * x + (m[5] as number) * y + (m[13] as number)) * iw;
}

export function equals(a: Mat4, b: Mat4, epsilon = 1e-5): boolean {
  for (let i = 0; i < 16; i++) {
    if (Math.abs((a[i] as number) - (b[i] as number)) > epsilon) return false;
  }
  return true;
}
