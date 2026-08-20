/**
 * L4 — the primary renderer.
 *
 * P1 scope: instanced SDF circles through a single draw call, with GPU
 * resources owned by descriptors so context loss is recoverable. Batching by
 * pipeline key, stroke expansion, fill tessellation, and the framebuffer chain
 * arrive in P3.
 */

export { Webgl2Renderer } from './renderer';
export type { Webgl2Options, FrameStats } from './renderer';
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
export { CIRCLE_VERTEX_SHADER, CIRCLE_FRAGMENT_SHADER } from './shaders';
