/**
 * L4 — the primary renderer.
 *
 * Instanced SDF primitives batched by pipeline, with GPU resources owned by
 * descriptors so context loss is recoverable. Text (MSDF) and the framebuffer
 * chain arrive in later phases.
 */

export { Webgl2Renderer } from './renderer';
export type { Webgl2Options, FrameStats } from './renderer';
export { BatchList, Pipeline } from './batch';
export type { Batch } from './batch';
export { SdfAtlas } from './text/atlas';
export type { Glyph, AtlasOptions } from './text/atlas';
export { edt1d, edt2d, signedDistanceField } from './text/edt';
export { GlStateCache } from './state';
export type { BlendCapableGl } from './state';
export {
  ResourceRegistry,
  ShaderCompileError,
  ProgramLinkError,
} from './resource';
export type {
  GlLike,
  ResourceId,
  ResourceDescriptor,
  BufferDescriptor,
  ProgramDescriptor,
} from './resource';
export { SDF_VERTEX_SHADER, SDF_FRAGMENT_SHADER } from './shaders';
export {
  PathBuilder,
  DEFAULT_TOLERANCE,
  cubicSegments,
  quadraticSegments,
  flattenCubic,
  flattenQuadratic,
  fanTriangles,
  quadTriangles,
  strokeTriangles,
} from './path/index';
export type { PolylineSink } from './path/index';
export { PingPongTargets, createRenderTarget, FramebufferIncompleteError } from './framebuffer';
export type { RenderTarget, TargetGl } from './framebuffer';
export {
  PassCache,
  PassCompileLimitError,
  passSource,
  setUniform,
  setUniformInt,
  COPY_PASS_FRAGMENT,
} from './post';
export type { ShaderPass, CompiledPass } from './post';

import type { BackendFactory } from '@matter/graphics';
import { Webgl2Renderer, type Webgl2Options } from './renderer';

/** Backend factory for `sketch({ backend: webgl2() })`. */
export function webgl2(options: Webgl2Options = {}): BackendFactory {
  return (canvas: HTMLCanvasElement) => new Webgl2Renderer(canvas, options);
}
