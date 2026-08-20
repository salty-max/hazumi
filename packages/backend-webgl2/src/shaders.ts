/**
 * Analytic primitives, not geometry.
 *
 * A circle is one instanced unit quad whose shape is evaluated in the fragment
 * shader. No tessellator, no vertex bloat, and antialiasing that stays perfect
 * at any zoom because it is derived from the screen-space derivative rather
 * than baked into geometry. This is most of the performance and most of the
 * quality — see §05 of the architecture doc.
 */

export const CIRCLE_VERTEX_SHADER: string = `#version 300 es

// Unit quad corner in -1..1. Shared by every instance.
layout(location = 0) in vec2 a_corner;

// Per-instance: centre xy and radius.
layout(location = 1) in vec3 a_circle;

// Per-instance: linear RGBA.
layout(location = 2) in vec4 a_color;

uniform mat4 u_viewProj;

out vec2 v_local;
out vec4 v_color;

void main() {
  v_local = a_corner;
  v_color = a_color;

  vec2 world = a_circle.xy + a_corner * a_circle.z;
  gl_Position = u_viewProj * vec4(world, 0.0, 1.0);
}
`;

export const CIRCLE_FRAGMENT_SHADER: string = `#version 300 es
precision highp float;

in vec2 v_local;
in vec4 v_color;

out vec4 fragColor;

void main() {
  // Signed distance to the unit circle, in local quad space.
  float d = length(v_local) - 1.0;

  // fwidth gives us one pixel in local space, so the edge stays exactly one
  // pixel wide however far the sketch is zoomed.
  float aa = fwidth(d);
  float alpha = 1.0 - smoothstep(-aa, aa, d);

  if (alpha <= 0.0) discard;

  // Premultiplied output, matching the ONE / ONE_MINUS_SRC_ALPHA blend below.
  float a = v_color.a * alpha;
  fragColor = vec4(v_color.rgb * a, a);
}
`;
