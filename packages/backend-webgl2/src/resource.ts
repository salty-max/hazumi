/**
 * Handles over descriptors.
 *
 * No GL object is ever held directly. Each resource is an id plus a CPU-side
 * descriptor sufficient to rebuild it, which is what makes `webglcontextlost`
 * survivable: drop the objects, recreate from descriptors on restore, keep
 * drawing. AGENTS.md mandates this; retrofitting it later would touch every
 * subsystem.
 */

export type ResourceId = number;

export interface BufferDescriptor {
  readonly kind: 'buffer';
  readonly target: number;
  readonly usage: number;
  readonly byteLength: number;
}

export interface ProgramDescriptor {
  readonly kind: 'program';
  readonly vertex: string;
  readonly fragment: string;
}

export interface TextureDescriptor {
  readonly kind: 'texture';
  readonly width: number;
  readonly height: number;
  /** Single-channel data; the atlas stores distance, not colour. */
  readonly data: Uint8Array;
}

export type ResourceDescriptor =
  | BufferDescriptor
  | ProgramDescriptor
  | TextureDescriptor;

/** Minimal slice of WebGL2 the registry needs, so it can be tested with a fake. */
export interface GlLike {
  createBuffer(): WebGLBuffer | null;
  bindBuffer(target: number, buffer: WebGLBuffer | null): void;
  bufferData(target: number, size: number, usage: number): void;
  deleteBuffer(buffer: WebGLBuffer | null): void;
  createShader(type: number): WebGLShader | null;
  shaderSource(shader: WebGLShader, source: string): void;
  compileShader(shader: WebGLShader): void;
  getShaderParameter(shader: WebGLShader, pname: number): unknown;
  getShaderInfoLog(shader: WebGLShader): string | null;
  deleteShader(shader: WebGLShader | null): void;
  createTexture(): WebGLTexture | null;
  bindTexture(target: number, texture: WebGLTexture | null): void;
  texImage2D(
    target: number, level: number, internalformat: number,
    width: number, height: number, border: number,
    format: number, type: number, pixels: ArrayBufferView | null,
  ): void;
  texParameteri(target: number, pname: number, param: number): void;
  pixelStorei(pname: number, param: number): void;
  deleteTexture(texture: WebGLTexture | null): void;
  createProgram(): WebGLProgram | null;
  attachShader(program: WebGLProgram, shader: WebGLShader): void;
  linkProgram(program: WebGLProgram): void;
  getProgramParameter(program: WebGLProgram, pname: number): unknown;
  getProgramInfoLog(program: WebGLProgram): string | null;
  deleteProgram(program: WebGLProgram | null): void;
  readonly VERTEX_SHADER: number;
  readonly FRAGMENT_SHADER: number;
  readonly COMPILE_STATUS: number;
  readonly LINK_STATUS: number;
  readonly TEXTURE_2D: number;
  readonly R8: number;
  readonly RED: number;
  readonly UNSIGNED_BYTE: number;
  readonly TEXTURE_MIN_FILTER: number;
  readonly TEXTURE_MAG_FILTER: number;
  readonly TEXTURE_WRAP_S: number;
  readonly TEXTURE_WRAP_T: number;
  readonly LINEAR: number;
  readonly CLAMP_TO_EDGE: number;
  readonly UNPACK_ALIGNMENT: number;
}

export class ShaderCompileError extends Error {
  constructor(stage: 'vertex' | 'fragment', log: string) {
    super(`${stage} shader failed to compile: ${log}`);
    this.name = 'ShaderCompileError';
  }
}

export class ProgramLinkError extends Error {
  constructor(log: string) {
    super(`program failed to link: ${log}`);
    this.name = 'ProgramLinkError';
  }
}

/**
 * Owns every GPU object. `realize` is idempotent and is what runs again after a
 * context restore.
 */
export class ResourceRegistry {
  #descriptors: ResourceDescriptor[] = [];
  #buffers = new Map<ResourceId, WebGLBuffer>();
  #programs = new Map<ResourceId, WebGLProgram>();
  #textures = new Map<ResourceId, WebGLTexture>();
  #realizations = 0;

  /** How many times resources have been built. Increments on each restore. */
  get realizations(): number {
    return this.#realizations;
  }

  get size(): number {
    return this.#descriptors.length;
  }

  register(descriptor: ResourceDescriptor): ResourceId {
    const id = this.#descriptors.length;
    this.#descriptors.push(descriptor);
    return id;
  }

  descriptor(id: ResourceId): ResourceDescriptor {
    const d = this.#descriptors[id];
    if (d === undefined) throw new Error(`No resource registered for id ${id}`);
    return d;
  }

  buffer(id: ResourceId): WebGLBuffer {
    const b = this.#buffers.get(id);
    if (b === undefined) throw new Error(`Buffer ${id} is not realized`);
    return b;
  }

  program(id: ResourceId): WebGLProgram {
    const p = this.#programs.get(id);
    if (p === undefined) throw new Error(`Program ${id} is not realized`);
    return p;
  }

  texture(id: ResourceId): WebGLTexture {
    const t = this.#textures.get(id);
    if (t === undefined) throw new Error(`Texture ${id} is not realized`);
    return t;
  }

  /**
   * Forget every GPU object without deleting it. This is the context-loss path:
   * the driver has already destroyed the objects, so deleting them is both
   * impossible and unnecessary.
   *
   * Use `destroy` when the context is still alive, or the objects leak.
   */
  invalidate(): void {
    this.#buffers.clear();
    this.#programs.clear();
    this.#textures.clear();
  }

  /**
   * Delete every GPU object and forget it. This is the teardown path.
   *
   * Safe to call on a lost context: WebGL ignores delete calls there, so it
   * degrades to `invalidate`.
   */
  destroy(gl: GlLike): void {
    for (const buffer of this.#buffers.values()) gl.deleteBuffer(buffer);
    for (const program of this.#programs.values()) gl.deleteProgram(program);
    for (const texture of this.#textures.values()) gl.deleteTexture(texture);
    this.invalidate();
  }

  /**
   * Register a resource and realize just that one.
   *
   * For things discovered mid-run — a font atlas built the first time a family
   * is used. The descriptor is still stored, so a context restore rebuilds it
   * with everything else and the invariant holds.
   */
  add(gl: GlLike, descriptor: ResourceDescriptor): ResourceId {
    const id = this.register(descriptor);
    if (descriptor.kind === 'buffer') this.#buffers.set(id, createBuffer(gl, descriptor));
    else if (descriptor.kind === 'texture') this.#textures.set(id, createTexture(gl, descriptor));
    else this.#programs.set(id, createProgram(gl, descriptor));
    return id;
  }

  /**
   * (Re)create every registered resource against `gl`.
   *
   * Deletes anything currently realized first, so calling this twice on a live
   * context replaces objects rather than orphaning them.
   */
  realize(gl: GlLike): void {
    this.destroy(gl);

    for (let id = 0; id < this.#descriptors.length; id++) {
      const desc = this.#descriptors[id] as ResourceDescriptor;
      if (desc.kind === 'buffer') {
        this.#buffers.set(id, createBuffer(gl, desc));
      } else if (desc.kind === 'texture') {
        this.#textures.set(id, createTexture(gl, desc));
      } else {
        this.#programs.set(id, createProgram(gl, desc));
      }
    }

    this.#realizations++;
  }
}

function createBuffer(gl: GlLike, desc: BufferDescriptor): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (buffer === null) throw new Error('gl.createBuffer() returned null');
  gl.bindBuffer(desc.target, buffer);
  gl.bufferData(desc.target, desc.byteLength, desc.usage);
  return buffer;
}

function createTexture(gl: GlLike, desc: TextureDescriptor): WebGLTexture {
  const texture = gl.createTexture();
  if (texture === null) throw new Error('gl.createTexture() returned null');

  gl.bindTexture(gl.TEXTURE_2D, texture);
  // Single-channel rows are not 4-byte aligned; without this the atlas skews.
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.R8,
    desc.width, desc.height, 0,
    gl.RED, gl.UNSIGNED_BYTE, desc.data,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

function createProgram(gl: GlLike, desc: ProgramDescriptor): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, desc.vertex, 'vertex');
  const fs = compile(gl, gl.FRAGMENT_SHADER, desc.fragment, 'fragment');

  const program = gl.createProgram();
  if (program === null) throw new Error('gl.createProgram() returned null');

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  // Shaders are reference-counted by the program once linked.
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
    const log = gl.getProgramInfoLog(program) ?? '(no log)';
    gl.deleteProgram(program);
    throw new ProgramLinkError(log);
  }

  return program;
}

function compile(
  gl: GlLike,
  type: number,
  source: string,
  stage: 'vertex' | 'fragment',
): WebGLShader {
  const shader = gl.createShader(type);
  if (shader === null) throw new Error('gl.createShader() returned null');

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
    const log = gl.getShaderInfoLog(shader) ?? '(no log)';
    gl.deleteShader(shader);
    throw new ShaderCompileError(stage, log);
  }

  return shader;
}
