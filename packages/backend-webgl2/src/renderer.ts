import {
  type Affine,
  Blend,
  type CommandBuffer,
  type CommandVisitor,
  copyAffine,
  decode,
  identityAffine,
  rotateAffine,
  scaleAffine,
  translateAffine,
} from '@matter/graphics';
import { mat4 } from '@matter/math';
import { BatchList } from './batch';
import { GlStateCache } from './state';
import { SDF_FRAGMENT_SHADER, SDF_VERTEX_SHADER } from './shaders';
import { type ResourceId, ResourceRegistry } from './resource';

/** a, b, c, d | tx, ty, hx, hy | r, g, b, alpha | edge, shape. */
const INSTANCE_FLOATS = 14;
const INSTANCE_BYTES = INSTANCE_FLOATS * 4;

const SHAPE_CIRCLE = 0;
const SHAPE_BOX = 1;
const SHAPE_ELLIPSE = 2;

const INITIAL_INSTANCES = 1024;

export interface Webgl2Options {
  readonly samples?: number;
  /**
   * Reserved. Allocating a depth attachment is a config flag rather than a
   * redesign — see "Shipping 2D, staying 3D-capable" in AGENTS.md.
   */
  readonly depth?: boolean;
}

export interface FrameStats {
  /** Draw calls issued for the last frame. */
  readonly drawCalls: number;
  /** Instances submitted in the last frame. */
  readonly instances: number;
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

  #style: Style = defaultStyle();
  #styleStack: Style[] = [];
  #xform: Affine = identityAffine();
  #xformStack: Affine[] = [];

  #visitor: CommandVisitor;
  #onLost: (event: Event) => void;
  #onRestored: () => void;

  constructor(canvas: HTMLCanvasElement, options: Webgl2Options = {}) {
    this.#canvas = canvas;
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
      instances: this.#count,
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

  render(buffer: CommandBuffer): void {
    const gl = this.#gl;
    this.#drawCalls = 0;
    this.#count = 0;
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

    gl.viewport(0, 0, this.#canvas.width, this.#canvas.height);
    // Only clear when an opaque background asked for it. A sketch that never
    // calls background() accumulates across frames, as it does in p5.
    //
    // Read through a local: the field is set from inside the decode callback,
    // which the checker cannot see, so it would otherwise stay narrowed to the
    // null it was initialised to above.
    const clear: readonly [number, number, number, number] | null = this.#clearRequested;
    if (clear !== null) {
      // Premultiplied, matching the drawing buffer's storage.
      gl.clearColor(clear[0] * clear[3], clear[1] * clear[3], clear[2] * clear[3], clear[3]);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    if (this.#count === 0) return;

    const state = this.#state as GlStateCache;
    state.useProgram(this.#registry.program(this.#programId));
    state.bindVertexArray(this.#vao as WebGLVertexArrayObject);
    gl.uniformMatrix4fv(this.#viewProjLocation, false, this.#viewProj);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.#registry.buffer(this.#instanceId));
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.#instances, 0, this.#count * INSTANCE_FLOATS);

    for (const batch of batches) {
      state.setBlend(batch.blend);
      // baseInstance is not available in WebGL2, so the offset is applied by
      // re-pointing the instance attributes rather than passed to the draw.
      this.#setInstanceOffset(gl, batch.start);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, batch.count);
      this.#drawCalls++;
    }
  }

  dispose(): void {
    this.#canvas.removeEventListener('webglcontextlost', this.#onLost as EventListener);
    this.#canvas.removeEventListener('webglcontextrestored', this.#onRestored);

    const gl = this.#gl;
    if (gl !== null) {
      if (this.#vao !== null) gl.deleteVertexArray(this.#vao);
      // destroy, not invalidate: the context is still alive here, so the GPU
      // objects have to be deleted explicitly or they leak.
      this.#registry.destroy(gl);
    } else {
      this.#registry.invalidate();
    }

    this.#vao = null;
    this.#gl = null;
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

      background: (r: number, g: number, b: number, a: number): void => {
        if (a >= 1) {
          // Opaque: everything queued is about to be hidden, so discarding it
          // and clearing is both correct and far cheaper than overpainting.
          this.#count = 0;
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
      premultipliedAlpha: true,
      // Required for the trail idiom: without it the driver is free to discard
      // the colour buffer between frames and a translucent background has
      // nothing to blend over.
      preserveDrawingBuffer: true,
    });

    if (gl === null) throw new Error('WebGL2 is not available on this canvas');

    this.#gl = gl;
    this.#registry.realize(gl);
    this.#state = new GlStateCache(gl);
    this.#buildVao(gl);
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
}
