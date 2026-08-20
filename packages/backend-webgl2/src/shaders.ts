/**
 * Analytic primitives, not geometry.
 *
 * Every shape is one instanced unit quad carrying its own affine transform,
 * with the shape evaluated in the fragment shader. No tessellator, no vertex
 * bloat, and antialiasing derived from the screen-space derivative, so edges
 * stay one pixel wide under any zoom.
 *
 * Local space is in *user units*, not normalised to the quad: the affine
 * carries translation and rotation only, and the shape's half-extents ride
 * along as an attribute. Folding the extents into the affine instead would
 * make local distance anisotropic on a non-square rect, and a stroke would
 * come out thicker on two sides than the other two.
 *
 * Circles and boxes share one program so they batch together. A line is a box
 * rotated onto the segment, which is why its caps are butt — it is literally a
 * rectangle, matching Canvas2D exactly.
 */

export const SDF_VERTEX_SHADER: string = `#version 300 es

// Unit quad corner in -1..1, shared by every instance.
layout(location = 0) in vec2 a_corner;

// Per-instance affine (rotation + translation only): a, b, c, d.
layout(location = 1) in vec4 a_xform;
// tx, ty, then the shape's half-extents in user units.
layout(location = 2) in vec4 a_offsetExtent;
layout(location = 3) in vec4 a_color;
// x = stroke half-width (0 = filled), y = shape (0 circle, 1 box, 2 ellipse)
layout(location = 4) in vec2 a_params;

uniform mat4 u_viewProj;

out vec2 v_local;
out vec2 v_half;
out vec4 v_color;
out float v_edge;
flat out float v_shape;

void main() {
  vec2 half_ = a_offsetExtent.zw;
  float edge = a_params.x;

  // Grow the quad so it covers a stroke straddling the shape boundary, plus a
  // pixel of slack for the antialiased edge.
  vec2 local = a_corner * (half_ + vec2(edge + 1.0));

  v_local = local;
  v_half = half_;
  v_color = a_color;
  v_edge = edge;
  v_shape = a_params.y;

  vec2 world = vec2(
    a_xform.x * local.x + a_xform.z * local.y + a_offsetExtent.x,
    a_xform.y * local.x + a_xform.w * local.y + a_offsetExtent.y
  );

  gl_Position = u_viewProj * vec4(world, 0.0, 1.0);
}
`;

export const SDF_FRAGMENT_SHADER: string = `#version 300 es
precision highp float;

in vec2 v_local;
in vec2 v_half;
in vec4 v_color;
in float v_edge;
flat in float v_shape;

out vec4 fragColor;

// Signed distance to a box of the given half-extents, negative inside.
float boxSdf(vec2 p, vec2 half_) {
  vec2 q = abs(p) - half_;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

void main() {
  float d;
  if (v_shape < 0.5) {
    d = length(v_local) - v_half.x;
  } else if (v_shape < 1.5) {
    d = boxSdf(v_local, v_half);
  } else {
    // Approximate ellipse distance: the exact form needs a root solve, and
    // scaling the normalised distance by the smaller semi-axis is accurate
    // enough for a one-pixel antialiased edge at sane aspect ratios.
    vec2 n = v_local / v_half;
    d = (length(n) - 1.0) * min(v_half.x, v_half.y);
  }

  // A stroke is the band around the boundary: |d| - halfWidth.
  if (v_edge > 0.0) d = abs(d) - v_edge;

  float aa = fwidth(d);
  float alpha = 1.0 - smoothstep(-aa, aa, d);

  if (alpha <= 0.0) discard;

  // Premultiplied, matching the blend functions the renderer sets.
  float a = v_color.a * alpha;
  fragColor = vec4(v_color.rgb * a, a);
}
`;
