import {
  type Affine,
  Align,
  Baseline,
  Blend,
  type CommandBuffer,
  type CommandVisitor,
  type PixelData,
  copyAffine,
  decode,
  identityAffine,
  resetAffine,
  rotateAffine,
  scaleAffine,
  translateAffine,
} from '@matter/graphics';
import { mat4 } from '@matter/math';
import { BatchList, Pipeline } from './batch';
import { GlStateCache } from './state';
import {
  GLYPH_FRAGMENT_SHADER,
  GLYPH_VERTEX_SHADER,
  IMAGE_FRAGMENT_SHADER,
  PATH_FRAGMENT_SHADER,
  PATH_VERTEX_SHADER,
  SDF_FRAGMENT_SHADER,
  SDF_VERTEX_SHADER,
  POST_VERTEX_SHADER,
} from './shaders';
import { PathBuilder } from './path/builder';
import { fanTriangles, quadTriangles, strokeTriangles } from './path/geometry';
import { SdfAtlas } from './text/atlas';
import { type ResourceId, ResourceRegistry } from './resource';
import type { ImageSource } from '@matter/graphics';
import { PingPongTargets } from './framebuffer';
import {
  COPY_PASS_FRAGMENT_BODY,
  COPY_PASS_FRAGMENT,
  PassCache,
  setUniform,
  setUniformInt,
  type ShaderPass,
} from './post';

/** a, b, c, d | tx, ty, hx, hy | r, g, b, alpha | edge, shape. */
const INSTANCE_FLOATS = 14;
const INSTANCE_BYTES = INSTANCE_FLOATS * 4;

const SHAPE_CIRCLE = 0;
const SHAPE_BOX = 1;
const SHAPE_ELLIPSE = 2;

const INITIAL_INSTANCES = 1024;

/** Distinct font families a single renderer will build atlases for. */
const MAX_ATLASES = 8;

/** a, b, c, d | tx, ty | u0, v0, u1, v1 | r, g, b, alpha. */
const GLYPH_FLOATS = 14;
const GLYPH_BYTES = GLYPH_FLOATS * 4;

/** x, y | r, g, b, alpha — paths are unique geometry, not instances. */
const PATH_FLOATS = 6;
const PATH_BYTES = PATH_FLOATS * 4;
const INITIAL_PATH_VERTICES = 4096;

/** Convert bottom-up premultiplied GL bytes to top-down straight RGBA. */
export function readbackToPixels(
  source: Uint8Array,
  width: number,
  height: number,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(source.length);
  const rowLength = width * 4;
  for (let y = 0; y < height; y++) {
    const sourceRow = (height - 1 - y) * rowLength;
    const outputRow = y * rowLength;
    for (let x = 0; x < rowLength; x += 4) {
      const sourceIndex = sourceRow + x;
      const outputIndex = outputRow + x;
      const alpha = source[sourceIndex + 3]!;
      output[outputIndex + 3] = alpha;
      if (alpha === 0) continue;
      if (alpha === 255) {
        output[outputIndex] = source[sourceIndex]!;
        output[outputIndex + 1] = source[sourceIndex + 1]!;
        output[outputIndex + 2] = source[sourceIndex + 2]!;
      } else {
        output[outputIndex] = Math.round((source[sourceIndex]! * 255) / alpha);
        output[outputIndex + 1] = Math.round((source[sourceIndex + 1]! * 255) / alpha);
        output[outputIndex + 2] = Math.round((source[sourceIndex + 2]! * 255) / alpha);
      }
    }
  }
  return output;
}

/** Convert top-down straight RGBA to bottom-up premultiplied GL bytes. */
export function pixelsToUpload(
  source: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array {
  const output = new Uint8Array(source.length);
  const rowLength = width * 4;
  for (let y = 0; y < height; y++) {
    const sourceRow = y * rowLength;
    const outputRow = (height - 1 - y) * rowLength;
    for (let x = 0; x < rowLength; x += 4) {
      const sourceIndex = sourceRow + x;
      const outputIndex = outputRow + x;
      const alpha = source[sourceIndex + 3]!;
      output[outputIndex] = Math.round((source[sourceIndex]! * alpha) / 255);
      output[outputIndex + 1] = Math.round((source[sourceIndex + 1]! * alpha) / 255);
      output[outputIndex + 2] = Math.round((source[sourceIndex + 2]! * alpha) / 255);
      output[outputIndex + 3] = alpha;
    }
  }
  return output;
}

export interface Webgl2Options {
  readonly samples?: number;
  /**
   * Filter images between texels. Defaults to true.
   *
   * Set false for pixel art: linear filtering blurs a 32x32 sprite the moment
   * it is drawn larger than its source, which is most of the time in a game.
   */
  readonly smoothing?: boolean;
  /**
   * Reserved. Allocating a depth attachment is a config flag rather than a
   * redesign — see "Shipping 2D, staying 3D-capable" in AGENTS.md.
   */
  readonly depth?: boolean;
}

export interface FrameStats {
  /** Draw calls issued for the last frame. */
  readonly drawCalls: number;
  /**
   * Instances submitted last frame, across every instanced pipeline.
   *
   * Counting only shapes here — as an earlier version did — reports zero for
   * any scene made of sprites or text, which is exactly the kind of number
   * that looks fine and means nothing.
   */
  readonly instances: number;
  /** Instanced shapes: circles, rects, ellipses, lines. */
  readonly shapes: number;
  /** Instanced glyphs and images, which share one array. */
  readonly textured: number;
  /** Path vertices, which are geometry rather than instances. */
  readonly pathVertices: number;
  /** Times the instance array has grown. Constant in steady state. */
  readonly growths: number;
  /** GL state changes issued. */
  readonly stateChanges: number;
  /** GL state changes elided by the state cache. */
  readonly stateSkipped: number;
}

interface Style {
  fillR: number; fillG: number; fillB: number; fillA: number;
  strokeR: number; strokeG: number; strokeB: number; strokeA: number;
  strokeWidth: number;
  blend: Blend;
}

function defaultStyle(): Style {
  return {
    fillR: 0, fillG: 0, fillB: 0, fillA: 1,
    strokeR: 0, strokeG: 0, strokeB: 0, strokeA: 1,
    strokeWidth: 0,
    blend: Blend.Normal,
  };
}

/**
 * WebGL2 backend: instanced SDF primitives, batched by pipeline.
 *
 * Per-frame work walks the command buffer once, resolving style and transform
 * into a pre-sized instance array, then issues one draw call per batch. The
 * walk allocates nothing once the array has settled.
 *
 * GPU objects are owned by ResourceRegistry as handles over descriptors, so a
 * context loss is recoverable without a page reload.
 */
export class Webgl2Renderer {
  #canvas: HTMLCanvasElement;
  #gl: WebGL2RenderingContext | null = null;
  #registry = new ResourceRegistry();
  #state: GlStateCache | null = null;
  #batches = new BatchList();

  #quadId: ResourceId;
  #instanceId: ResourceId;
  #programId: ResourceId;

  #vao: WebGLVertexArrayObject | null = null;
  #viewProjLocation: WebGLUniformLocation | null = null;

  #instances: Float32Array;
  #instanceCapacity: number;
  #count = 0;
  #growths = 0;
  #drawCalls = 0;

  #viewProj = new Float32Array(16);
  #contextLost = false;
  // null means "do not clear this frame", which is what makes trails work.
  #clearRequested: readonly [number, number, number, number] | null = null;
  #viewWidth = 0;
  #viewHeight = 0;

  #glyphProgramId: ResourceId;
  #glyphBufferId: ResourceId;
  #glyphVao: WebGLVertexArrayObject | null = null;
  #glyphViewProjLocation: WebGLUniformLocation | null = null;
  #glyphAtlasLocation: WebGLUniformLocation | null = null;

  #glyphs: Float32Array;
  #glyphCapacity: number;
  #glyphCount = 0;

  // One atlas per family, built on first use and reused thereafter. Capped:
  // every entry costs a texture and a full rasterisation pass, so a family
  // string built from a variable would be far more expensive than the colour
  // cache equivalent. Failing loudly beats degrading silently.
  #atlases = new Map<string, { atlas: SdfAtlas; textureId: ResourceId }>();
  #imageProgramId: ResourceId;
  #imageAtlasLocation: WebGLUniformLocation | null = null;
  #imageViewProjLocation: WebGLUniformLocation | null = null;
  // Keyed by the source object, so the same image uploads once no matter how
  // many times a scene draws it. Weak, so unloading an image frees the entry.
  #imageTextures = new WeakMap<ImageSource, ResourceId>();
  #smoothing: boolean;

  #pathProgramId: ResourceId;
  #pathBufferId: ResourceId;
  #pathVao: WebGLVertexArrayObject | null = null;
  #pathViewProjLocation: WebGLUniformLocation | null = null;
  #pixelTextureId: ResourceId;
  #pixelProgramId: ResourceId;
  #pixelTextureLocation: WebGLUniformLocation | null = null;

  #pathVertices: Float32Array;
  #pathCapacity: number;
  #pathCount = 0;
  #builder = new PathBuilder();
  #scratch: number[] = [];

  #targets: PingPongTargets | null = null;
  #passes = new PassCache(this.#registry);
  #chain: readonly ShaderPass[] = [];
  #elapsed = 0;
  #fontFamily = 'sans-serif';
  #textSize = 16;
  #align: Align = Align.Left;
  #baseline: Baseline = Baseline.Alphabetic;

  #style: Style = defaultStyle();
  #styleStack: Style[] = [];
  #xform: Affine = identityAffine();
  #xformStack: Affine[] = [];

  #visitor: CommandVisitor;
  #onLost: (event: Event) => void;
  #onRestored: () => void;

  constructor(canvas: HTMLCanvasElement, options: Webgl2Options = {}) {
    this.#canvas = canvas;
    this.#smoothing = options.smoothing ?? true;
    this.#instanceCapacity = INITIAL_INSTANCES;
    this.#instances = new Float32Array(INITIAL_INSTANCES * INSTANCE_FLOATS);

    this.#quadId = this.#registry.register({
      kind: 'buffer',
      target: WebGL2RenderingContext.ARRAY_BUFFER,
      usage: WebGL2RenderingContext.STATIC_DRAW,
      byteLength: 8 * 4,
    });
    this.#instanceId = this.#registry.register({
      kind: 'buffer',
      target: WebGL2RenderingContext.ARRAY_BUFFER,
      usage: WebGL2RenderingContext.DYNAMIC_DRAW,
      byteLength: this.#instances.byteLength,
    });
    this.#programId = this.#registry.register({
      kind: 'program',
      vertex: SDF_VERTEX_SHADER,
      fragment: SDF_FRAGMENT_SHADER,
    });

    this.#glyphCapacity = INITIAL_INSTANCES;
    this.#glyphs = new Float32Array(INITIAL_INSTANCES * GLYPH_FLOATS);
    this.#glyphBufferId = this.#registry.register({
      kind: 'buffer',
      target: WebGL2RenderingContext.ARRAY_BUFFER,
      usage: WebGL2RenderingContext.DYNAMIC_DRAW,
      byteLength: this.#glyphs.byteLength,
    });
    this.#glyphProgramId = this.#registry.register({
      kind: 'program',
      vertex: GLYPH_VERTEX_SHADER,
      fragment: GLYPH_FRAGMENT_SHADER,
    });
    // Shares the glyph vertex shader: same textured quad, different sampling.
    this.#imageProgramId = this.#registry.register({
      kind: 'program',
      vertex: GLYPH_VERTEX_SHADER,
      fragment: IMAGE_FRAGMENT_SHADER,
    });

    this.#pathCapacity = INITIAL_PATH_VERTICES;
    this.#pathVertices = new Float32Array(INITIAL_PATH_VERTICES * PATH_FLOATS);
    this.#pathBufferId = this.#registry.register({
      kind: 'buffer',
      target: WebGL2RenderingContext.ARRAY_BUFFER,
      usage: WebGL2RenderingContext.DYNAMIC_DRAW,
      byteLength: this.#pathVertices.byteLength,
    });
    this.#pathProgramId = this.#registry.register({
      kind: 'program',
      vertex: PATH_VERTEX_SHADER,
      fragment: PATH_FRAGMENT_SHADER,
    });
    this.#pixelTextureId = this.#registry.register({
      kind: 'rgba-texture',
      width: 1,
      height: 1,
      data: new Uint8Array(4),
    });
    this.#pixelProgramId = this.#registry.register({
      kind: 'program',
      vertex: POST_VERTEX_SHADER,
      fragment: COPY_PASS_FRAGMENT,
    });

    this.#visitor = this.#makeVisitor();

    this.#onLost = (event: Event): void => {
      // Without preventDefault the context is never restored.
      event.preventDefault();
      this.#contextLost = true;
      this.#registry.invalidate();
      this.#state?.invalidate();
      this.#vao = null;
    };

    this.#onRestored = (): void => {
      this.#contextLost = false;
      this.#acquireContext(options);
    };

    canvas.addEventListener('webglcontextlost', this.#onLost as EventListener);
    canvas.addEventListener('webglcontextrestored', this.#onRestored);

    // Default to the canvas dimensions. An unset viewport is a zero matrix,
    // which collapses every vertex and renders a silently blank canvas — a
    // working default beats a value that fails without saying so.
    this.setViewport(canvas.width, canvas.height);

    this.#acquireContext(options);
  }

  get contextLost(): boolean {
    return this.#contextLost;
  }

  get stats(): FrameStats {
    return {
      drawCalls: this.#drawCalls,
      instances: this.#count + this.#glyphCount,
      shapes: this.#count,
      textured: this.#glyphCount,
      pathVertices: this.#pathCount,
      growths: this.#growths,
      stateChanges: this.#state?.applied ?? 0,
      stateSkipped: this.#state?.skipped ?? 0,
    };
  }

  /** Times GPU resources have been built. Increments on each context restore. */
  get realizations(): number {
    return this.#registry.realizations;
  }

  /**
   * Replace the post-processing chain.
   *
   * Passes run in order, each reading the previous one's output. An empty
   * chain renders straight to the canvas and allocates no targets at all, so
   * a scene that never asks for effects pays nothing for them.
   */
  setPasses(passes: readonly ShaderPass[]): void {
    this.#chain = passes;
  }

  /** Seconds since the application started, forwarded to passes as u_time. */
  setTime(seconds: number): void {
    this.#elapsed = seconds;
  }

  /**
   * Orthographic projection mapping (0,0)-(width,height) to clip space with the
   * origin top-left.
   *
   * Defaulted to the canvas size at construction; call this again after
   * resizing the canvas.
   */
  setViewport(width: number, height: number): void {
    this.#viewWidth = width;
    this.#viewHeight = height;
    mat4.ortho(this.#viewProj, 0, width, height, 0, -1, 1);
  }

  readPixels(): PixelData {
    const gl = this.#pixelContext();
    const width = this.#canvas.width;
    const height = this.#canvas.height;
    const raw = new Uint8Array(width * height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    return { width, height, data: readbackToPixels(raw, width, height) };
  }

  writePixels(pixels: PixelData): void {
    const width = this.#canvas.width;
    const height = this.#canvas.height;
    if (pixels.width !== width || pixels.height !== height) {
      throw new RangeError(
        `Pixel surface is ${pixels.width}x${pixels.height}; expected ${width}x${height}`,
      );
    }
    const gl = this.#pixelContext();
    const upload = pixelsToUpload(pixels.data, width, height);
    this.#registry.updateRgbaTexture(gl, this.#pixelTextureId, width, height, upload);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    try {
      const program = this.#registry.program(this.#pixelProgramId);
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.#registry.texture(this.#pixelTextureId));
      gl.uniform1i(this.#pixelTextureLocation, 0);
      gl.bindVertexArray(null);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } finally {
      gl.enable(gl.BLEND);
      this.#state?.invalidate();
    }
  }

  #pixelContext(): WebGL2RenderingContext {
    if (this.#gl === null || this.#contextLost) {
      throw new Error('WebGL pixel access is unavailable while the context is lost');
    }
    return this.#gl;
  }

  render(buffer: CommandBuffer): void {
    const gl = this.#gl;
    this.#drawCalls = 0;
    this.#count = 0;
    this.#glyphCount = 0;
    this.#pathCount = 0;
    this.#builder.reset();
    this.#batches.reset();
    this.#state?.resetCounters();

    if (gl === null || this.#contextLost) return;

    this.#style = defaultStyle();
    this.#styleStack.length = 0;
    this.#xform = identityAffine();
    this.#xformStack.length = 0;
    this.#clearRequested = null;

    decode(buffer, this.#visitor);
    const batches = this.#batches.finish();

    // With a chain, the scene renders into a target instead of the canvas.
    const usePasses = this.#chain.length > 0;
    if (usePasses) {
      const targets = this.#ensureTargets(gl);
      targets.reset();
      gl.bindFramebuffer(gl.FRAMEBUFFER, targets.write.framebuffer);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    gl.viewport(0, 0, this.#canvas.width, this.#canvas.height);
    // Only clear when an opaque background asked for it. A scene that never
    // calls background() accumulates across frames.
    //
    // Read through a local: the field is set from inside the decode callback,
    // which the checker cannot see, so it would otherwise stay narrowed to the
    // null it was initialised to above.
    const clear: readonly [number, number, number, number] | null = this.#clearRequested;
    if (clear !== null) {
      // Premultiplied, matching the drawing buffer's storage.
      gl.clearColor(clear[0] * clear[3], clear[1] * clear[3], clear[2] * clear[3], clear[3]);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    }

    if (this.#count === 0 && this.#glyphCount === 0 && this.#pathCount === 0) {
      if (usePasses) this.#runPasses(gl);
      return;
    }

    const state = this.#state as GlStateCache;

    if (this.#count > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.#registry.buffer(this.#instanceId));
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.#instances, 0, this.#count * INSTANCE_FLOATS);
    }
    if (this.#glyphCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.#registry.buffer(this.#glyphBufferId));
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.#glyphs, 0, this.#glyphCount * GLYPH_FLOATS);
    }
    if (this.#pathCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.#registry.buffer(this.#pathBufferId));
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.#pathVertices, 0, this.#pathCount * PATH_FLOATS);
    }

    for (const batch of batches) {
      state.setBlend(batch.blend);

      if (batch.pipeline === Pipeline.PathFill || batch.pipeline === Pipeline.PathStroke) {
        this.#drawPath(gl, state, batch);
        continue;
      }

      if (batch.pipeline === Pipeline.Glyph || batch.pipeline === Pipeline.Image) {
        if (batch.texture < 0) continue;
        const isGlyph = batch.pipeline === Pipeline.Glyph;
        state.useProgram(
          this.#registry.program(isGlyph ? this.#glyphProgramId : this.#imageProgramId),
        );
        state.bindVertexArray(this.#glyphVao as WebGLVertexArrayObject);
        gl.uniformMatrix4fv(
          isGlyph ? this.#glyphViewProjLocation : this.#imageViewProjLocation,
          false,
          this.#viewProj,
        );
        gl.activeTexture(gl.TEXTURE0);
        // From the batch, not from "whichever texture was used last": two
        // images in one frame would otherwise share the second one's texture.
        gl.bindTexture(gl.TEXTURE_2D, this.#registry.texture(batch.texture));
        gl.uniform1i(isGlyph ? this.#glyphAtlasLocation : this.#imageAtlasLocation, 0);
        this.#setGlyphOffset(gl, batch.start);
      } else {
        state.useProgram(this.#registry.program(this.#programId));
        state.bindVertexArray(this.#vao as WebGLVertexArrayObject);
        gl.uniformMatrix4fv(this.#viewProjLocation, false, this.#viewProj);
        // baseInstance is not available in WebGL2, so the offset is applied by
        // re-pointing the instance attributes rather than passed to the draw.
        this.#setInstanceOffset(gl, batch.start);
      }

      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, batch.count);
      this.#drawCalls++;
    }

    if (usePasses) this.#runPasses(gl);
  }

  /**
   * Draw one path batch.
   *
   * A stroke is plain triangles. A fill is two passes: the fan goes into the
   * stencil buffer with separate front/back winding, which counts how many
   * times each pixel is enclosed, and the cover quad then paints where that
   * count is non-zero. That is the nonzero rule Canvas2D uses, and it handles
   * self-intersection and holes with no triangulation at all.
   *
   * The cover pass zeroes the stencil as it goes, so the buffer is left clean
   * for the next path without a full clear between them.
   */
  #drawPath(
    gl: WebGL2RenderingContext,
    state: GlStateCache,
    batch: { start: number; count: number; fanCount: number; pipeline: Pipeline },
  ): void {
    state.useProgram(this.#registry.program(this.#pathProgramId));
    state.bindVertexArray(this.#pathVao as WebGLVertexArrayObject);
    gl.uniformMatrix4fv(this.#pathViewProjLocation, false, this.#viewProj);

    if (batch.pipeline === Pipeline.PathStroke) {
      gl.drawArrays(gl.TRIANGLES, batch.start, batch.count);
      this.#drawCalls++;
      return;
    }

    const fan = batch.fanCount;
    const cover = batch.count - fan;
    if (fan <= 0 || cover <= 0) return;

    gl.enable(gl.STENCIL_TEST);
    gl.colorMask(false, false, false, false);
    gl.stencilFunc(gl.ALWAYS, 0, 0xff);
    // Increment for front-facing triangles, decrement for back-facing: the
    // result is the winding number, which is what nonzero needs.
    gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP);
    gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP);
    gl.drawArrays(gl.TRIANGLES, batch.start, fan);

    gl.colorMask(true, true, true, true);
    gl.stencilFunc(gl.NOTEQUAL, 0, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.ZERO);
    gl.drawArrays(gl.TRIANGLES, batch.start + fan, cover);

    gl.disable(gl.STENCIL_TEST);
    this.#drawCalls += 2;
  }

  #ensureTargets(gl: WebGL2RenderingContext): PingPongTargets {
    const width = this.#canvas.width;
    const height = this.#canvas.height;

    const existing = this.#targets;
    if (existing !== null && existing.width === width && existing.height === height) {
      return existing;
    }

    existing?.dispose(gl);
    const created = new PingPongTargets(gl, width, height);
    this.#targets = created;
    return created;
  }

  /**
   * Run the chain, then present.
   *
   * Each pass reads the last output and writes the other target. The final
   * result is copied to the canvas by an identity pass rather than by making
   * the last user pass render straight to it — that keeps every user pass
   * identical in shape, whether or not it happens to be last.
   */
  #runPasses(gl: WebGL2RenderingContext): void {
    const targets = this.#targets;
    if (targets === null) return;

    const state = this.#state as GlStateCache;
    // Passes composite whole images; source-over would double-darken.
    gl.disable(gl.BLEND);

    for (const pass of this.#chain) {
      targets.swap();
      gl.bindFramebuffer(gl.FRAMEBUFFER, targets.write.framebuffer);
      this.#drawPass(gl, pass.fragment, targets.read.texture, pass.uniforms);
    }

    targets.swap();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.#drawPass(gl, COPY_PASS_FRAGMENT_BODY, targets.read.texture, undefined);

    gl.enable(gl.BLEND);
    state.invalidate();
  }

  #drawPass(
    gl: WebGL2RenderingContext,
    fragment: string,
    texture: WebGLTexture,
    uniforms: Readonly<Record<string, number | readonly number[]>> | undefined,
  ): void {
    const compiled = this.#passes.get(gl, fragment);
    const program = this.#registry.program(compiled.programId);
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    setUniformInt(gl, program, compiled, 'u_texture', 0);
    setUniform(gl, program, compiled, 'u_resolution', [
      this.#canvas.width,
      this.#canvas.height,
    ]);
    setUniform(gl, program, compiled, 'u_time', this.#elapsed);

    if (uniforms !== undefined) {
      for (const [name, value] of Object.entries(uniforms)) {
        setUniform(gl, program, compiled, name, value);
      }
    }

    // No vertex buffer: the full-screen triangle comes from gl_VertexID.
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.#drawCalls++;
  }

  dispose(): void {
    this.#canvas.removeEventListener('webglcontextlost', this.#onLost as EventListener);
    this.#canvas.removeEventListener('webglcontextrestored', this.#onRestored);

    const gl = this.#gl;
    if (gl !== null) {
      if (this.#vao !== null) gl.deleteVertexArray(this.#vao);
      if (this.#glyphVao !== null) gl.deleteVertexArray(this.#glyphVao);
      if (this.#pathVao !== null) gl.deleteVertexArray(this.#pathVao);
      this.#targets?.dispose(gl);
      this.#targets = null;
      // destroy, not invalidate: the context is still alive here, so the GPU
      // objects have to be deleted explicitly or they leak.
      this.#registry.destroy(gl);

      // Browsers cap concurrent WebGL contexts, and dropping the canvas only
      // frees one when the collector gets round to it. Anything that creates
      // applications repeatedly — the playground's Run button — would hit that cap
      // long before GC ran, so release it now.
      this.#gl = null;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    } else {
      this.#registry.invalidate();
    }

    this.#vao = null;
    this.#glyphVao = null;
    this.#pathVao = null;
    this.#gl = null;
    this.#atlases.clear();
  }

  // --- instance building ---

  #makeVisitor(): CommandVisitor {
    return {
      setFill: (r: number, g: number, b: number, a: number): void => {
        this.#style.fillR = r; this.#style.fillG = g;
        this.#style.fillB = b; this.#style.fillA = a;
      },
      setStroke: (r: number, g: number, b: number, a: number): void => {
        this.#style.strokeR = r; this.#style.strokeG = g;
        this.#style.strokeB = b; this.#style.strokeA = a;
      },
      setStrokeWidth: (width: number): void => {
        this.#style.strokeWidth = width;
      },
      setBlend: (mode: Blend): void => {
        this.#style.blend = mode;
      },

      push: (): void => {
        this.#styleStack.push({ ...this.#style });
        const saved = identityAffine();
        copyAffine(saved, this.#xform);
        this.#xformStack.push(saved);
      },
      pop: (): void => {
        const style = this.#styleStack.pop();
        if (style !== undefined) this.#style = style;
        const xform = this.#xformStack.pop();
        if (xform !== undefined) this.#xform = xform;
      },

      translate: (x: number, y: number): void => translateAffine(this.#xform, x, y),
      rotate: (radians: number): void => rotateAffine(this.#xform, radians),
      scale: (x: number, y: number): void => scaleAffine(this.#xform, x, y),
      resetTransform: (): void => resetAffine(this.#xform),

      background: (r: number, g: number, b: number, a: number): void => {
        if (a >= 1) {
          // Opaque: everything queued is about to be hidden, so discarding it
          // and clearing is both correct and far cheaper than overpainting.
          this.#count = 0;
          this.#glyphCount = 0;
          this.#batches.reset();
          this.#clearRequested = [r, g, b, a];
          return;
        }

        // Translucent: this is the trail idiom, and it has to actually blend
        // over the previous frame, so it becomes a full-viewport rectangle
        // under identity transform rather than a clear.
        const half = identityAffine();
        half.tx = this.#viewWidth / 2;
        half.ty = this.#viewHeight / 2;
        this.#pushInstanceWithBlend(
          half,
          this.#viewWidth / 2,
          this.#viewHeight / 2,
          r, g, b, a,
          SHAPE_BOX,
          0,
          Blend.Normal,
        );
      },

      circle: (x: number, y: number, radius: number): void => {
        this.#emitShape(SHAPE_CIRCLE, x, y, radius, radius, 0);
      },

      ellipse: (x: number, y: number, rx: number, ry: number): void => {
        this.#emitShape(SHAPE_ELLIPSE, x, y, rx, ry, 0);
      },

      rect: (x: number, y: number, width: number, height: number): void => {
        // The unit box spans -1..1, so half-extents are the scale.
        this.#emitShape(SHAPE_BOX, x + width / 2, y + height / 2, width / 2, height / 2, 0);
      },

      setTextSize: (size: number): void => {
        this.#textSize = size;
      },
      setTextAlign: (horizontal: Align, vertical: Baseline): void => {
        this.#align = horizontal;
        this.#baseline = vertical;
      },
      setFont: (family: string): void => {
        this.#fontFamily = family;
      },
      text: (x: number, y: number, content: string): void => {
        this.#emitText(x, y, content);
      },
      image: (source, x: number, y: number, width: number, height: number): void => {
        this.#emitImage(source, x, y, width, height, 0, 0, 1, 1);
      },
      imageRegion: (source, dx, dy, dw, dh, sx, sy, sw, sh): void => {
        const iw = source.width;
        const ih = source.height;
        if (iw <= 0 || ih <= 0) return;
        // Textures upload unflipped, so v runs top-down exactly like the source
        // rectangle does — the same convention as the whole-image case above.
        this.#emitImage(
          source, dx, dy, dw, dh,
          sx / iw, sy / ih,
          (sx + sw) / iw, (sy + sh) / ih,
        );
      },

      beginPath: (): void => this.#builder.reset(),
      moveTo: (x: number, y: number): void => this.#builder.moveTo(x, y),
      lineTo: (x: number, y: number): void => this.#builder.lineTo(x, y),
      quadraticTo: (cx: number, cy: number, x: number, y: number): void =>
        this.#builder.quadraticTo(cx, cy, x, y),
      cubicTo: (
        c1x: number, c1y: number,
        c2x: number, c2y: number,
        x: number, y: number,
      ): void => this.#builder.cubicTo(c1x, c1y, c2x, c2y, x, y),
      closePath: (): void => this.#builder.close(),
      fillPath: (): void => this.#emitPathFill(),
      strokePath: (): void => this.#emitPathStroke(),

      line: (x1: number, y1: number, x2: number, y2: number): void => {
        const style = this.#style;
        if (style.strokeWidth <= 0 || style.strokeA <= 0) return;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        if (len === 0) return;

        // A line is a box: half-length along its own axis, half-width across.
        // That is what gives butt caps, matching Canvas2D exactly.
        this.#emitShape(
          SHAPE_BOX,
          (x1 + x2) / 2,
          (y1 + y2) / 2,
          len / 2,
          style.strokeWidth / 2,
          Math.atan2(dy, dx),
          true,
        );
      },
    };
  }

  /**
   * Emit the fill instance, then the stroke instance.
   *
   * Two instances rather than one shader that draws both, so painter order
   * between them is explicit and matches Canvas2D's fill-then-stroke.
   */
  #emitShape(
    shape: number,
    cx: number,
    cy: number,
    halfW: number,
    halfH: number,
    rotation: number,
    strokeOnly = false,
  ): void {
    const style = this.#style;

    // Rotation and translation only — the half-extents travel as attributes so
    // local space stays isotropic. See the note in shaders.ts.
    const m = identityAffine();
    copyAffine(m, this.#xform);
    translateAffine(m, cx, cy);
    if (rotation !== 0) rotateAffine(m, rotation);

    if (strokeOnly) {
      this.#pushInstance(m, halfW, halfH, style.strokeR, style.strokeG, style.strokeB, style.strokeA, shape, 0);
      return;
    }

    if (style.fillA > 0) {
      this.#pushInstance(m, halfW, halfH, style.fillR, style.fillG, style.fillB, style.fillA, shape, 0);
    }

    if (style.strokeWidth > 0 && style.strokeA > 0) {
      // Stroke width is in user units, the same space as the half-extents, so
      // the current transform scales both together exactly as Canvas2D does.
      this.#pushInstance(
        m, halfW, halfH,
        style.strokeR, style.strokeG, style.strokeB, style.strokeA,
        shape,
        style.strokeWidth / 2,
      );
    }
  }

  #pushInstance(
    m: Affine,
    halfW: number,
    halfH: number,
    r: number, g: number, b: number, a: number,
    shape: number,
    edge: number,
  ): void {
    this.#pushInstanceWithBlend(m, halfW, halfH, r, g, b, a, shape, edge, this.#style.blend);
  }

  #pushInstanceWithBlend(
    m: Affine,
    halfW: number,
    halfH: number,
    r: number, g: number, b: number, a: number,
    shape: number,
    edge: number,
    blend: Blend,
  ): void {
    if (this.#count === this.#instanceCapacity) this.#growInstances();

    const i = this.#count * INSTANCE_FLOATS;
    const arr = this.#instances;
    arr[i] = m.a; arr[i + 1] = m.b; arr[i + 2] = m.c; arr[i + 3] = m.d;
    arr[i + 4] = m.tx; arr[i + 5] = m.ty; arr[i + 6] = halfW; arr[i + 7] = halfH;
    arr[i + 8] = r; arr[i + 9] = g; arr[i + 10] = b; arr[i + 11] = a;
    arr[i + 12] = edge; arr[i + 13] = shape;

    this.#batches.push(blend);
    this.#count++;
  }

  /** Build the atlas for a family on first use, then reuse it. */
  #atlasFor(family: string): { atlas: SdfAtlas; textureId: ResourceId } | null {
    const gl = this.#gl;
    if (gl === null) return null;

    const existing = this.#atlases.get(family);
    if (existing !== undefined) return existing;

    if (this.#atlases.size >= MAX_ATLASES) {
      throw new Error(
        `Refusing to build more than ${MAX_ATLASES} font atlases (asked for ` +
          `${JSON.stringify(family)}). A font family built from a variable is ` +
          `the usual cause; hoist it to a constant.`,
      );
    }

    const atlas = new SdfAtlas(family);
    const textureId = this.#registry.add(gl, {
      kind: 'texture',
      width: atlas.width,
      height: atlas.height,
      data: atlas.data,
    });
    const entry = { atlas, textureId };
    this.#atlases.set(family, entry);
    return entry;
  }

  #emitText(x: number, y: number, content: string): void {
    const entry = this.#atlasFor(this.#fontFamily);
    if (entry === null) return;

    const { atlas } = entry;
    const style = this.#style;
    if (style.fillA <= 0) return;

    const size = this.#textSize;
    const width = atlas.measure(content, size);

    let penX = x;
    if (this.#align === Align.Center) penX -= width / 2;
    else if (this.#align === Align.Right) penX -= width;

    let penY = y;
    if (this.#baseline === Baseline.Top) penY += atlas.ascent * size;
    else if (this.#baseline === Baseline.Middle) penY += ((atlas.ascent - atlas.descent) / 2) * size;
    else if (this.#baseline === Baseline.Bottom) penY -= atlas.descent * size;

    for (const char of content) {
      const glyph = atlas.glyph(char);
      if (glyph === undefined) continue;

      const w = glyph.width * size;
      const h = glyph.height * size;
      if (w > 0 && h > 0) {
        const cx = penX + glyph.left * size + w / 2;
        const cy = penY + glyph.top * size + h / 2;

        const m = identityAffine();
        copyAffine(m, this.#xform);
        translateAffine(m, cx, cy);
        scaleAffine(m, w / 2, h / 2);

        this.#pushGlyph(m, glyph.u0, glyph.v0, glyph.u1, glyph.v1, entry.textureId);
      }
      penX += glyph.advance * size;
    }
  }

  /** Upload an image once and reuse its texture for every later draw. */
  #textureFor(source: ImageSource): ResourceId | null {
    const gl = this.#gl;
    if (gl === null) return null;

    const existing = this.#imageTextures.get(source);
    if (existing !== undefined) return existing;

    const id = this.#registry.add(gl, {
      kind: 'image-texture',
      source,
      smoothing: this.#smoothing,
    });
    this.#imageTextures.set(source, id);
    return id;
  }

  #emitImage(
    source: ImageSource,
    x: number,
    y: number,
    width: number,
    height: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
  ): void {
    const textureId = this.#textureFor(source);
    if (textureId === null) return;

    const m = identityAffine();
    copyAffine(m, this.#xform);
    translateAffine(m, x + width / 2, y + height / 2);
    scaleAffine(m, width / 2, height / 2);

    // Images reuse the glyph instance layout; the fill colour acts as a tint.
    this.#pushTextured(m, u0, v0, u1, v1, textureId, Pipeline.Image);
  }

  #pushGlyph(
    m: Affine,
    u0: number, v0: number, u1: number, v1: number,
    textureId: ResourceId,
  ): void {
    if (this.#glyphCount === this.#glyphCapacity) this.#growGlyphs();

    const i = this.#glyphCount * GLYPH_FLOATS;
    const arr = this.#glyphs;
    const style = this.#style;
    arr[i] = m.a; arr[i + 1] = m.b; arr[i + 2] = m.c; arr[i + 3] = m.d;
    arr[i + 4] = m.tx; arr[i + 5] = m.ty;
    arr[i + 6] = u0; arr[i + 7] = v0; arr[i + 8] = u1; arr[i + 9] = v1;
    arr[i + 10] = style.fillR; arr[i + 11] = style.fillG;
    arr[i + 12] = style.fillB; arr[i + 13] = style.fillA;

    this.#batches.push(style.blend, Pipeline.Glyph, textureId);
    this.#glyphCount++;
  }

  /** Glyphs and images share the instance array; only the pipeline differs. */
  #pushTextured(
    m: Affine,
    u0: number, v0: number, u1: number, v1: number,
    textureId: ResourceId,
    pipeline: Pipeline,
  ): void {
    if (this.#glyphCount === this.#glyphCapacity) this.#growGlyphs();

    const i = this.#glyphCount * GLYPH_FLOATS;
    const arr = this.#glyphs;
    const style = this.#style;
    arr[i] = m.a; arr[i + 1] = m.b; arr[i + 2] = m.c; arr[i + 3] = m.d;
    arr[i + 4] = m.tx; arr[i + 5] = m.ty;
    arr[i + 6] = u0; arr[i + 7] = v0; arr[i + 8] = u1; arr[i + 9] = v1;
    // Tint: white fill leaves the image untouched.
    arr[i + 10] = 1; arr[i + 11] = 1; arr[i + 12] = 1; arr[i + 13] = style.fillA;

    this.#batches.push(style.blend, pipeline, textureId);
    this.#glyphCount++;
  }

  #growGlyphs(): void {
    this.#glyphCapacity *= 2;
    const next = new Float32Array(this.#glyphCapacity * GLYPH_FLOATS);
    next.set(this.#glyphs);
    this.#glyphs = next;
    this.#growths++;

    const gl = this.#gl;
    if (gl !== null) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.#registry.buffer(this.#glyphBufferId));
      gl.bufferData(gl.ARRAY_BUFFER, next.byteLength, gl.DYNAMIC_DRAW);
    }
  }

  #setGlyphOffset(gl: WebGL2RenderingContext, instance: number): void {
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#registry.buffer(this.#glyphBufferId));
    const base = instance * GLYPH_BYTES;
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, GLYPH_BYTES, base);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, GLYPH_BYTES, base + 16);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, GLYPH_BYTES, base + 24);
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, GLYPH_BYTES, base + 40);
  }

  #emitPathFill(): void {
    const style = this.#style;
    if (style.fillA <= 0 || this.#builder.isEmpty) return;

    const bounds = this.#builder.bounds();
    if (bounds === null) return;

    const scratch = this.#scratch;
    scratch.length = 0;
    this.#builder.forEachContour((contour) => fanTriangles(contour, scratch));
    if (scratch.length === 0) return;

    const fanVertices = scratch.length / 2;
    // The cover quad is appended so the batch is one contiguous range; the
    // batch records where the fan ends and the cover begins.
    quadTriangles(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, scratch);

    this.#pushPathVertices(
      scratch,
      style.fillR, style.fillG, style.fillB, style.fillA,
      Pipeline.PathFill,
      fanVertices,
    );
  }

  #emitPathStroke(): void {
    const style = this.#style;
    if (style.strokeWidth <= 0 || style.strokeA <= 0) return;

    const scratch = this.#scratch;
    scratch.length = 0;
    this.#builder.forEachContour((contour) => {
      strokeTriangles(contour, style.strokeWidth, scratch);
    });
    if (scratch.length === 0) return;

    this.#pushPathVertices(
      scratch,
      style.strokeR, style.strokeG, style.strokeB, style.strokeA,
      Pipeline.PathStroke,
    );
  }

  /**
   * Append triangles, transformed by the current affine.
   *
   * The transform is applied here rather than in the shader because a path is
   * unique geometry: there is no per-instance slot to carry a matrix, and
   * baking it costs one multiply per vertex either way.
   */
  #pushPathVertices(
    points: readonly number[],
    r: number, g: number, b: number, a: number,
    pipeline: Pipeline,
    fanCount = 0,
  ): void {
    const vertexCount = points.length / 2;
    while (this.#pathCount + vertexCount > this.#pathCapacity) this.#growPaths();

    const m = this.#xform;
    const arr = this.#pathVertices;
    let i = this.#pathCount * PATH_FLOATS;

    for (let p = 0; p < points.length; p += 2) {
      const x = points[p] as number;
      const y = points[p + 1] as number;
      arr[i] = m.a * x + m.c * y + m.tx;
      arr[i + 1] = m.b * x + m.d * y + m.ty;
      arr[i + 2] = r;
      arr[i + 3] = g;
      arr[i + 4] = b;
      arr[i + 5] = a;
      i += PATH_FLOATS;
    }

    this.#pathCount += vertexCount;
    // One batch per path: a fill needs its own stencil pass, and merging two
    // would let one path's winding count decide the other's interior.
    this.#batches.pushSolo(this.#style.blend, pipeline, vertexCount, fanCount);
  }

  #growPaths(): void {
    this.#pathCapacity *= 2;
    const next = new Float32Array(this.#pathCapacity * PATH_FLOATS);
    next.set(this.#pathVertices);
    this.#pathVertices = next;
    this.#growths++;

    const gl = this.#gl;
    if (gl !== null) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.#registry.buffer(this.#pathBufferId));
      gl.bufferData(gl.ARRAY_BUFFER, next.byteLength, gl.DYNAMIC_DRAW);
    }
  }

  #growInstances(): void {
    this.#instanceCapacity *= 2;
    const next = new Float32Array(this.#instanceCapacity * INSTANCE_FLOATS);
    next.set(this.#instances);
    this.#instances = next;
    this.#growths++;

    const gl = this.#gl;
    if (gl !== null) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.#registry.buffer(this.#instanceId));
      gl.bufferData(gl.ARRAY_BUFFER, next.byteLength, gl.DYNAMIC_DRAW);
    }
  }

  // --- GL setup ---

  #setInstanceOffset(gl: WebGL2RenderingContext, instance: number): void {
    // vertexAttribPointer captures the currently bound ARRAY_BUFFER, not the
    // one this VAO was built with. Without this bind, a frame that uploaded
    // glyphs last would re-point the shape attributes at the glyph buffer.
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#registry.buffer(this.#instanceId));
    const base = instance * INSTANCE_BYTES;
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, INSTANCE_BYTES, base);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, INSTANCE_BYTES, base + 16);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, INSTANCE_BYTES, base + 32);
    gl.vertexAttribPointer(4, 2, gl.FLOAT, false, INSTANCE_BYTES, base + 48);
  }

  #acquireContext(options: Webgl2Options): void {
    const gl = this.#canvas.getContext('webgl2', {
      alpha: true,
      antialias: (options.samples ?? 0) > 0,
      depth: options.depth ?? false,
      // Path fills count winding in the stencil buffer.
      stencil: true,
      premultipliedAlpha: true,
      // Required for the trail idiom: without it the driver is free to discard
      // the colour buffer between frames and a translucent background has
      // nothing to blend over.
      preserveDrawingBuffer: true,
    });

    if (gl === null) throw new Error('WebGL2 is not available on this canvas');

    this.#gl = gl;
    this.#registry.realize(gl);
    this.#pixelTextureLocation = gl.getUniformLocation(
      this.#registry.program(this.#pixelProgramId),
      'u_texture',
    );
    this.#state = new GlStateCache(gl);
    this.#buildVao(gl);
    this.#buildGlyphVao(gl);
    this.#buildPathVao(gl);
    // Atlases and image textures died with the context; drop the caches so the
    // next draw re-uploads them.
    this.#atlases.clear();
    this.#imageTextures = new WeakMap<ImageSource, ResourceId>();
    this.#passes.invalidate();
    this.#targets = null;
  }

  #buildVao(gl: WebGL2RenderingContext): void {
    const program = this.#registry.program(this.#programId);
    this.#viewProjLocation = gl.getUniformLocation(program, 'u_viewProj');

    const vao = gl.createVertexArray();
    if (vao === null) throw new Error('gl.createVertexArray() returned null');
    gl.bindVertexArray(vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.#registry.buffer(this.#quadId));
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.#registry.buffer(this.#instanceId));
    gl.bufferData(gl.ARRAY_BUFFER, this.#instances.byteLength, gl.DYNAMIC_DRAW);

    for (const location of [1, 2, 3, 4]) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribDivisor(location, 1);
    }
    this.#setInstanceOffset(gl, 0);

    gl.bindVertexArray(null);
    this.#vao = vao;
  }

  #buildPathVao(gl: WebGL2RenderingContext): void {
    const program = this.#registry.program(this.#pathProgramId);
    this.#pathViewProjLocation = gl.getUniformLocation(program, 'u_viewProj');

    const vao = gl.createVertexArray();
    if (vao === null) throw new Error('gl.createVertexArray() returned null');
    gl.bindVertexArray(vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.#registry.buffer(this.#pathBufferId));
    gl.bufferData(gl.ARRAY_BUFFER, this.#pathVertices.byteLength, gl.DYNAMIC_DRAW);

    // Per-vertex, not per-instance: a path is unique geometry.
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, PATH_BYTES, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, PATH_BYTES, 8);

    gl.bindVertexArray(null);
    this.#pathVao = vao;
  }

  #buildGlyphVao(gl: WebGL2RenderingContext): void {
    const program = this.#registry.program(this.#glyphProgramId);
    this.#glyphViewProjLocation = gl.getUniformLocation(program, 'u_viewProj');
    this.#glyphAtlasLocation = gl.getUniformLocation(program, 'u_atlas');

    const imageProgram = this.#registry.program(this.#imageProgramId);
    this.#imageViewProjLocation = gl.getUniformLocation(imageProgram, 'u_viewProj');
    this.#imageAtlasLocation = gl.getUniformLocation(imageProgram, 'u_image');

    const vao = gl.createVertexArray();
    if (vao === null) throw new Error('gl.createVertexArray() returned null');
    gl.bindVertexArray(vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.#registry.buffer(this.#quadId));
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.#registry.buffer(this.#glyphBufferId));
    gl.bufferData(gl.ARRAY_BUFFER, this.#glyphs.byteLength, gl.DYNAMIC_DRAW);
    for (const location of [1, 2, 3, 4]) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribDivisor(location, 1);
    }
    this.#setGlyphOffset(gl, 0);

    gl.bindVertexArray(null);
    this.#glyphVao = vao;
  }
}
