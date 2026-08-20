/**
 * 2D affine transforms, stored as the six meaningful components of a 3x3.
 *
 *   x' = a*x + c*y + tx
 *   y' = b*x + d*y + ty
 *
 * A flat six-tuple rather than a Mat4 because this is what both backends want:
 * Canvas2D's setTransform takes exactly these, and the GPU path uploads them as
 * two vec3 instance attributes. The Mat4 in @matter/math stays the transform
 * type for the 3D path.
 */
export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export function identityAffine(): Affine {
  return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
}

export function copyAffine(out: Affine, src: Affine): void {
  out.a = src.a;
  out.b = src.b;
  out.c = src.c;
  out.d = src.d;
  out.tx = src.tx;
  out.ty = src.ty;
}

/** In-place `m = m * translate(x, y)`. */
export function translateAffine(m: Affine, x: number, y: number): void {
  m.tx += m.a * x + m.c * y;
  m.ty += m.b * x + m.d * y;
}

/** In-place `m = m * rotate(radians)`. */
export function rotateAffine(m: Affine, radians: number): void {
  const s = Math.sin(radians);
  const co = Math.cos(radians);
  const { a, b, c, d } = m;
  m.a = a * co + c * s;
  m.b = b * co + d * s;
  m.c = c * co - a * s;
  m.d = d * co - b * s;
}

/** In-place `m = m * scale(x, y)`. */
export function scaleAffine(m: Affine, x: number, y: number): void {
  m.a *= x;
  m.b *= x;
  m.c *= y;
  m.d *= y;
}

/**
 * Average linear scale factor, as sqrt(|det|).
 *
 * Used to convert a stroke width from user space to the shape's local space.
 * Exact under uniform scale; an approximation under anisotropic scale, which
 * is a documented divergence from Canvas2D.
 */
export function scaleFactor(m: Affine): number {
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
}
