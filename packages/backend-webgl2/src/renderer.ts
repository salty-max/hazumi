import {
  type CommandBuffer,
  type CommandVisitor,
  decode,
} from '@matter/graphics';
import { CIRCLE_FRAGMENT_SHADER, CIRCLE_VERTEX_SHADER } from './shaders';
import { type ResourceId, ResourceRegistry } from './resource';

/** Floats per circle instance: x, y, r, then linear RGBA. */
const INSTANCE_FLOATS = 7;
const INSTANCE_BYTES = INSTANCE_FLOATS * 4;

const INITIAL_INSTANCES = 1024;

export interface Webgl2Options {
  /** Multisample count requested for the drawing buffer. */
  readonly samples?: number;
  /**
   * Reserved. Allocating a depth attachment is a config flag rather than a
   * redesign — see "Shipping 2D, staying 3D-capable" in the architecture doc.
   */
  readonly depth?: boolean;
}

export interface FrameStats {
  /** Draw calls issued for the last frame. One is the target. */
  readonly drawCalls: number;
  /** Instances submitted in the last frame. */
  readonly instances: number;
  /** Times the instance array has grown. Constant in steady state. */
  readonly growths: number;
}

/**
 * Minimal WebGL2 backend: instanced SDF circles, one draw call per frame.
 *
 * The per-frame path allocates nothing once the instance array has settled.
 * Everything on the GPU side is owned by `ResourceRegistry`, so a context loss
 * is recoverable without a page reload.
 */
export class Webgl2Renderer {
  #canvas: HTMLCanvasElement;
  #gl: WebGL2RenderingContext | null = null;
  #registry = new ResourceRegistry();

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

  // Current fill, resolved into each instance as the stream is walked.
  #fr = 0;
  #fg = 0;
  #fb = 0;
  #fa = 1;

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
      vertex: CIRCLE_VERTEX_SHADER,
      fragment: CIRCLE_FRAGMENT_SHADER,
    });

    // Bound once and reused, so walking the stream allocates no closures.
    this.#visitor = {
      setFill: (r: number, g: number, b: number, a: number): void => {
        this.#fr = r;
        this.#fg = g;
        this.#fb = b;
        this.#fa = a;
      },
      circle: (x: number, y: number, radius: number): void => {
        this.#pushInstance(x, y, radius);
      },
    };

    this.#onLost = (event: Event): void => {
      // Without preventDefault the context is never restored.
      event.preventDefault();
      this.#contextLost = true;
      this.#registry.invalidate();
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
    };
  }

  /** Times GPU resources have been built. Increments on each context restore. */
  get realizations(): number {
    return this.#registry.realizations;
  }

  /**
   * Orthographic projection mapping (0,0)-(width,height) to clip space with the
   * origin top-left, written in place so no matrix is allocated per frame.
   *
   * Defaulted to the canvas size at construction; call this again after
   * resizing the canvas.
   *
   * Column-major 4x4, matching what GL expects and what the 3D camera will
   * produce later.
   */
  setViewport(width: number, height: number): void {
    const m = this.#viewProj;
    m.fill(0);
    m[0] = 2 / width;
    m[5] = -2 / height;
    m[10] = 1;
    m[12] = -1;
    m[13] = 1;
    m[15] = 1;
  }

  render(buffer: CommandBuffer): void {
    const gl = this.#gl;
    this.#drawCalls = 0;
    this.#count = 0;

    if (gl === null || this.#contextLost) return;

    this.#fr = 0;
    this.#fg = 0;
    this.#fb = 0;
    this.#fa = 1;

    decode(buffer, this.#visitor);

    gl.viewport(0, 0, this.#canvas.width, this.#canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (this.#count === 0) return;

    gl.useProgram(this.#registry.program(this.#programId));
    gl.bindVertexArray(this.#vao);
    gl.uniformMatrix4fv(this.#viewProjLocation, false, this.#viewProj);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.#registry.buffer(this.#instanceId));
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      0,
      this.#instances,
      0,
      this.#count * INSTANCE_FLOATS,
    );

    // Every circle shares one program, one blend state, and no texture, so the
    // whole frame is a single batch.
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.#count);
    this.#drawCalls = 1;
  }

  dispose(): void {
    this.#canvas.removeEventListener(
      'webglcontextlost',
      this.#onLost as EventListener,
    );
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

  #pushInstance(x: number, y: number, radius: number): void {
    if (this.#count === this.#instanceCapacity) this.#growInstances();

    const i = this.#count * INSTANCE_FLOATS;
    const a = this.#instances;
    a[i] = x;
    a[i + 1] = y;
    a[i + 2] = radius;
    a[i + 3] = this.#fr;
    a[i + 4] = this.#fg;
    a[i + 5] = this.#fb;
    a[i + 6] = this.#fa;
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

  #acquireContext(options: Webgl2Options): void {
    const gl = this.#canvas.getContext('webgl2', {
      alpha: true,
      antialias: (options.samples ?? 0) > 0,
      depth: options.depth ?? false,
      premultipliedAlpha: true,
    });

    if (gl === null) throw new Error('WebGL2 is not available on this canvas');

    this.#gl = gl;
    this.#registry.realize(gl);
    this.#buildVao(gl);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  #buildVao(gl: WebGL2RenderingContext): void {
    const program = this.#registry.program(this.#programId);
    this.#viewProjLocation = gl.getUniformLocation(program, 'u_viewProj');

    const vao = gl.createVertexArray();
    if (vao === null) throw new Error('gl.createVertexArray() returned null');
    gl.bindVertexArray(vao);

    // Unit quad, drawn as a triangle strip.
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

    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, INSTANCE_BYTES, 0);
    gl.vertexAttribDivisor(1, 1);

    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, INSTANCE_BYTES, 12);
    gl.vertexAttribDivisor(2, 1);

    gl.bindVertexArray(null);
    this.#vao = vao;
  }
}
