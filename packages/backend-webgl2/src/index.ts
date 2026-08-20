/**
 * L4 — the primary renderer.
 *
 * Instanced SDF primitives batched by pipeline, with GPU resources owned by
 * descriptors so context loss is recoverable. Text (MSDF) and the framebuffer
 * chain arrive in later phases.
 */

export { Webgl2Renderer } from './renderer';
export type { Webgl2Options, FrameStats } from './renderer';
export { BatchList } from './batch';
export type { Batch } from './batch';
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
