/**
 * L4 — vector export.
 *
 * Doubles as the cheapest possible test that the command buffer stayed
 * high-level: if tessellation ever leaks into the encoder, this backend is
 * where it fails loudly.
 */

export interface SvgOptions {
  readonly precision?: number;
}

// TODO(P5): serialize the command buffer to SVG.
