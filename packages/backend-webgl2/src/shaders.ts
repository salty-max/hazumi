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

/**
 * The narrowest edge any fragment shader will fade an antialiased edge across.
 *
 * `smoothstep(-aa, aa, d)` is only defined while `aa` is positive, and a
 * derivative of zero is not hypothetical: a software rasteriser magnifying a
 * texture samples one texel for all four fragments of a 2x2 quad and reports
 * `fwidth` as exactly 0. Flooring the width costs nothing where the derivative
 * is real — it is orders of magnitude smaller than any true one — and turns the
 * degenerate case into a hard edge rather than an undefined one.
 */
const MIN_AA = `
const float MIN_AA = 1e-4;
`;

/**
 * Materials, shared by the two textured pipelines.
 *
 * The kind is an instance attribute rather than a program, so every sprite in
 * a batch may wear a different one and the batch stays one draw call. That is
 * the trade the whole feature is built around, and it is why the vocabulary is
 * fixed: the branch has to be written here, once.
 */
const MATERIALS = `
const uint MAT_NONE = 0u;
const uint MAT_FLASH = 1u;
const uint MAT_OUTLINE = 2u;
const uint MAT_DISSOLVE = 3u;

/** Sprite-local 0..1 coordinates, so an effect is fixed to the art. */
vec2 localUv(vec2 uv, vec4 rect) {
  return (uv - rect.xy) / max(rect.zw - rect.xy, vec2(1e-6));
}

float hash21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

/**
 * Value noise: a lattice of hashes with a smooth ramp between them.
 *
 * Smooth rather than one hash per pixel, because a dissolve should look like
 * something eating the sprite from several places at once. Per-pixel white
 * noise gives television static instead, and the burning edge has nowhere to
 * be.
 */
float valueNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(cell);
  float b = hash21(cell + vec2(1.0, 0.0));
  float c = hash21(cell + vec2(0.0, 1.0));
  float d = hash21(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

/** Lerp toward the material colour, keeping the sprite's own coverage. */
vec4 applyFlash(vec4 color, vec4 flash, float amount) {
  return vec4(mix(color.rgb, flash.rgb, amount * flash.a), color.a);
}

/**
 * Eat the sprite away along the noise field, lighting the boundary.
 *
 * The threshold runs over the whole field plus the edge band, so an amount of
 * 1 leaves nothing behind: stopping at the noise maximum would leave the last
 * few texels standing forever.
 */
vec4 applyDissolve(vec4 color, vec4 edgeColor, vec2 local, float amount, float edge, float scale) {
  float n = valueNoise(local * scale);
  float cut = amount * (1.0 + edge);
  if (n < cut - edge) return vec4(0.0);
  // Inside the band the sprite is on its way out: paint it with the edge
  // colour, hardest where it is about to vanish.
  float heat = edge > 0.0 ? clamp((cut - n) / edge, 0.0, 1.0) : 0.0;
  return vec4(mix(color.rgb, edgeColor.rgb, heat * edgeColor.a), color.a);
}
`;

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
${MIN_AA}

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

  // Floored: smoothstep is undefined when edge0 >= edge1, and a rasteriser
  // that reports a zero derivative would land exactly there. See the glyph
  // shader, where that is not hypothetical.
  float aa = max(fwidth(d), MIN_AA);
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
// The material's colour: flash target, outline, or dissolve edge.
layout(location = 5) in vec4 a_matColor;
// kind, then three parameter bytes. Integer, so the kind compares exactly
// rather than as a float that a driver is free to round its own way.
layout(location = 6) in uvec4 a_material;

uniform mat4 u_viewProj;

out vec2 v_uv;
out vec4 v_color;
out vec4 v_matColor;
// The sprite's own rectangle in the atlas, so the fragment shader can find its
// way around inside it: an outline taps neighbours, and a dissolve needs a
// coordinate that is fixed to the sprite rather than to the sheet.
flat out vec4 v_uvRect;
flat out uvec4 v_material;

void main() {
  // Corner is -1..1; remap to 0..1 to index the glyph's atlas rect.
  vec2 t = a_corner * 0.5 + 0.5;
  v_uv = mix(a_uv.xy, a_uv.zw, t);
  v_color = a_color;
  v_matColor = a_matColor;
  v_uvRect = a_uv;
  v_material = a_material;

  vec2 world = vec2(
    a_xform.x * a_corner.x + a_xform.z * a_corner.y + a_offset.x,
    a_xform.y * a_corner.x + a_xform.w * a_corner.y + a_offset.y
  );

  gl_Position = u_viewProj * vec4(world, 0.0, 1.0);
}
`;

export const GLYPH_FRAGMENT_SHADER: string = `#version 300 es
precision highp float;
${MIN_AA}
${MATERIALS}

in vec2 v_uv;
in vec4 v_color;
in vec4 v_matColor;
flat in vec4 v_uvRect;
flat in uvec4 v_material;

uniform sampler2D u_atlas;

out vec4 fragColor;

void main() {
  // The atlas stores distance with 0.5 at the glyph edge and larger values
  // inside, so this is positive within the glyph.
  float d = texture(u_atlas, v_uv).r - 0.5;

  // Screen-space derivative, so the edge stays one pixel wide at any size.
  // This is what SDF buys over a plain coverage atlas.
  //
  // Floored, because the derivative is not always usable: magnifying the atlas
  // makes a software rasteriser sample the same texel for all four fragments of
  // a 2x2 quad, and fwidth then returns exactly 0. smoothstep is undefined once
  // edge0 >= edge1, and the answer it picks there is the inverse of the glyph —
  // a solid block with the letter punched out of it. Falling back to a hard
  // edge is aliased but right.
  float aa = max(fwidth(d), MIN_AA);
  float alpha = smoothstep(-aa, aa, d);

  if (alpha <= 0.0) discard;

  vec4 color = vec4(v_color.rgb, v_color.a * alpha);
  uint kind = v_material.x;
  // Outline is absent here on purpose. On an image it means "the transparent
  // texels next to opaque ones"; a glyph has no texels of its own, only a
  // distance, and widening that distance is a different feature wearing the
  // same word. Text gets flash and dissolve, and says so.
  if (kind == MAT_FLASH) {
    color = applyFlash(color, v_matColor, float(v_material.y) / 255.0);
  } else if (kind == MAT_DISSOLVE) {
    color = applyDissolve(
      color,
      v_matColor,
      localUv(v_uv, v_uvRect),
      float(v_material.y) / 255.0,
      float(v_material.z) / 255.0,
      float(v_material.w)
    );
  }

  if (color.a <= 0.0) discard;
  fragColor = vec4(color.rgb * color.a, color.a);
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
${MATERIALS}

in vec2 v_uv;
in vec4 v_color;
in vec4 v_matColor;
flat in vec4 v_uvRect;
flat in uvec4 v_material;

uniform sampler2D u_image;
/** One texel of the bound texture, so an outline can be measured in texels. */
uniform vec2 u_texel;

out vec4 fragColor;

/**
 * How much opaque art sits within 'width' texels of here.
 *
 * Eight taps on a ring rather than a loop over a disc: the cost is the same
 * for every sprite in the batch, which matters when the batch is the point.
 * Diagonals are pulled in slightly so a square ring does not read as a
 * lozenge at the corners.
 *
 * Clamped to the sprite's own rectangle. A sheet packs frames edge to edge,
 * and a tap that walked outside would outline this sprite with the alpha of
 * the one next to it.
 */
float nearbyCoverage(vec2 uv, vec4 rect, float width) {
  vec2 r = u_texel * width;
  vec2 d = r * 0.7071;
  vec2 lo = min(rect.xy, rect.zw);
  vec2 hi = max(rect.xy, rect.zw);
  float found = 0.0;
  // Explicit level rather than texture(): these taps sit inside a branch that
  // not every fragment takes, and an implicit derivative there has no defined
  // mip level. There are no mips to pick from anyway, so say so.
  found = max(found, textureLod(u_image, clamp(uv + vec2(r.x, 0.0), lo, hi), 0.0).a);
  found = max(found, textureLod(u_image, clamp(uv - vec2(r.x, 0.0), lo, hi), 0.0).a);
  found = max(found, textureLod(u_image, clamp(uv + vec2(0.0, r.y), lo, hi), 0.0).a);
  found = max(found, textureLod(u_image, clamp(uv - vec2(0.0, r.y), lo, hi), 0.0).a);
  found = max(found, textureLod(u_image, clamp(uv + d, lo, hi), 0.0).a);
  found = max(found, textureLod(u_image, clamp(uv - d, lo, hi), 0.0).a);
  found = max(found, textureLod(u_image, clamp(uv + vec2(d.x, -d.y), lo, hi), 0.0).a);
  found = max(found, textureLod(u_image, clamp(uv + vec2(-d.x, d.y), lo, hi), 0.0).a);
  return found;
}

void main() {
  vec4 texel = texture(u_image, v_uv);
  uint kind = v_material.x;

  // Straight alpha for the whole material stage: the texture arrives
  // premultiplied, and mixing a premultiplied colour toward an ordinary one
  // makes a flash on a half-transparent sprite brighter than a solid one.
  vec4 color = vec4(texel.a > 0.0 ? texel.rgb / texel.a : vec3(0.0), texel.a);

  if (kind == MAT_FLASH) {
    color = applyFlash(color, v_matColor, float(v_material.y) / 255.0);
  } else if (kind == MAT_OUTLINE) {
    // Only in the empty texels: inside the art the sprite is itself, and an
    // outline that painted over its own edge would eat a pixel of the drawing.
    float outside = 1.0 - color.a;
    float ring = nearbyCoverage(v_uv, v_uvRect, float(v_material.y)) * outside;
    color = vec4(mix(color.rgb, v_matColor.rgb, ring), max(color.a, ring * v_matColor.a));
  } else if (kind == MAT_DISSOLVE) {
    color = applyDissolve(
      color,
      v_matColor,
      localUv(v_uv, v_uvRect),
      float(v_material.y) / 255.0,
      float(v_material.z) / 255.0,
      float(v_material.w)
    );
  }

  float a = color.a * v_color.a;
  if (a <= 0.0) discard;
  fragColor = vec4(color.rgb * v_color.rgb * a, a);
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
/**
 * The scene as it was drawn, whatever the chain has done to it since.
 *
 * The same as u_texture in the first pass, and the reason a later one can put
 * something back: a bloom is the blurred bright parts added over u_scene, and a
 * light map is the blurred lights multiplied into it. Without this a chain can
 * only transform its own output, and both of those are unwritable.
 */
uniform sampler2D u_scene;
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
