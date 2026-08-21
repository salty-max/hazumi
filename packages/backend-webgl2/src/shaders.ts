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
// Normalized RGBA8 in the vertex buffer, expanded to floats by WebGL.
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

/**
 * Glyph pipeline.
 *
 * A glyph is a textured quad sampling the SDF atlas. The distance is read from
 * the texture rather than evaluated analytically, which is why it cannot share
 * a program — or a draw call — with the shape pipeline.
 */
export const GLYPH_VERTEX_SHADER: string = `#version 300 es

layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_xform;        // a, b, c, d
layout(location = 2) in vec2 a_offset;       // tx, ty
layout(location = 3) in vec4 a_uv;           // u0, v0, u1, v1
// Normalized RGBA8 in the vertex buffer, expanded to floats by WebGL.
layout(location = 4) in vec4 a_color;

uniform mat4 u_viewProj;

out vec2 v_uv;
out vec4 v_color;

void main() {
  // Corner is -1..1; remap to 0..1 to index the glyph's atlas rect.
  vec2 t = a_corner * 0.5 + 0.5;
  v_uv = mix(a_uv.xy, a_uv.zw, t);
  v_color = a_color;

  vec2 world = vec2(
    a_xform.x * a_corner.x + a_xform.z * a_corner.y + a_offset.x,
    a_xform.y * a_corner.x + a_xform.w * a_corner.y + a_offset.y
  );

  gl_Position = u_viewProj * vec4(world, 0.0, 1.0);
}
`;

export const GLYPH_FRAGMENT_SHADER: string = `#version 300 es
precision highp float;

in vec2 v_uv;
in vec4 v_color;

uniform sampler2D u_atlas;

out vec4 fragColor;

void main() {
  // The atlas stores distance with 0.5 at the glyph edge and larger values
  // inside, so this is positive within the glyph.
  float d = texture(u_atlas, v_uv).r - 0.5;

  // Screen-space derivative, so the edge stays one pixel wide at any size.
  // This is what SDF buys over a plain coverage atlas.
  float aa = fwidth(d);
  float alpha = smoothstep(-aa, aa, d);

  if (alpha <= 0.0) discard;

  float a = v_color.a * alpha;
  fragColor = vec4(v_color.rgb * a, a);
}
`;

/**
 * Image pipeline.
 *
 * Nearly the glyph shader, but sampling RGBA and multiplying by tint rather
 * than reading a distance. Separate because the sampling is different and the
 * two must not share a draw call anyway — each image has its own texture.
 */
export const IMAGE_FRAGMENT_SHADER: string = `#version 300 es
precision highp float;

in vec2 v_uv;
in vec4 v_color;

uniform sampler2D u_image;

out vec4 fragColor;

void main() {
  vec4 texel = texture(u_image, v_uv);
  float a = texel.a * v_color.a;
  if (a <= 0.0) discard;
  // Premultiplied, matching the blend functions the renderer sets.
  fragColor = vec4(texel.rgb * v_color.rgb * a, a);
}
`;

/**
 * Post-processing pass.
 *
 * A full-screen triangle rather than a quad: one primitive instead of two, no
 * seam down the diagonal where derivatives go wrong, and the vertices come from
 * gl_VertexID so it needs no vertex buffer at all.
 */
export const POST_VERTEX_SHADER: string = `#version 300 es

out vec2 v_uv;

void main() {
  // Three vertices covering the viewport: (-1,-1), (3,-1), (-1,3).
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

/** Prepended to every user pass, so a pass is only its main(). */
export const POST_FRAGMENT_PRELUDE: string = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

/** The previous pass, or the scene for the first pass. */
uniform sampler2D u_texture;
/** Viewport size in pixels. */
uniform vec2 u_resolution;
/** Seconds since the application started. */
uniform float u_time;

/** One texel, for taps that need neighbours. */
vec2 texelSize() {
  return 1.0 / u_resolution;
}
`;

/** Straight copy, used to present the final target to the canvas. */
export const POST_COPY_FRAGMENT: string = `${POST_FRAGMENT_PRELUDE}
void main() {
  fragColor = texture(u_texture, v_uv);
}
`;

/**
 * Path pipeline.
 *
 * Plain transformed triangles with a per-vertex colour. Paths are unique
 * geometry rather than instances of a shape, so they get their own buffer and
 * the current transform is applied on the CPU while the vertices are built.
 */
export const PATH_VERTEX_SHADER: string = `#version 300 es

layout(location = 0) in vec2 a_position;
// Normalized RGBA8 in the vertex buffer, expanded to floats by WebGL.
layout(location = 1) in vec4 a_color;

uniform mat4 u_viewProj;

out vec4 v_color;

void main() {
  v_color = a_color;
  gl_Position = u_viewProj * vec4(a_position, 0.0, 1.0);
}
`;

export const PATH_FRAGMENT_SHADER: string = `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 fragColor;

void main() {
  // Premultiplied, matching the blend functions the renderer sets.
  fragColor = vec4(v_color.rgb * v_color.a, v_color.a);
}
`;
