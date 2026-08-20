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

export type ResourceDescriptor = BufferDescriptor | ProgramDescriptor;

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

  /** Forget every GPU object without forgetting how to rebuild it. */
  invalidate(): void {
    this.#buffers.clear();
    this.#programs.clear();
  }

  /** (Re)create every registered resource against `gl`. */
  realize(gl: GlLike): void {
    this.invalidate();

    for (let id = 0; id < this.#descriptors.length; id++) {
      const desc = this.#descriptors[id] as ResourceDescriptor;
      if (desc.kind === 'buffer') {
        this.#buffers.set(id, createBuffer(gl, desc));
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
