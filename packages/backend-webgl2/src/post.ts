import { POST_COPY_FRAGMENT, POST_FRAGMENT_PRELUDE, POST_VERTEX_SHADER } from './shaders';
import type { ResourceId, ResourceRegistry } from './resource';

/**
 * A user post-processing pass.
 *
 * The source is only a `main()` — the prelude supplies `v_uv`, `fragColor`,
 * `u_texture`, `u_resolution` and `u_time`, so the smallest useful pass is
 * three lines. Extra uniforms are declared in the source and supplied here.
 */
export interface ShaderPass {
  /** Fragment shader body, appended to the prelude. */
  readonly fragment: string;
  /** Custom uniforms, set before the pass draws. */
  readonly uniforms?: Readonly<Record<string, number | readonly number[]>>;
}

/** A pass with its compiled program and cached uniform locations. */
export interface CompiledPass {
  readonly programId: ResourceId;
  readonly locations: Map<string, WebGLUniformLocation | null>;
}

export interface PassGl {
  useProgram(program: WebGLProgram | null): void;
  getUniformLocation(program: WebGLProgram, name: string): WebGLUniformLocation | null;
  uniform1i(location: WebGLUniformLocation | null, x: number): void;
  uniform1f(location: WebGLUniformLocation | null, x: number): void;
  uniform2f(location: WebGLUniformLocation | null, x: number, y: number): void;
  uniform3f(location: WebGLUniformLocation | null, x: number, y: number, z: number): void;
  uniform4f(
    location: WebGLUniformLocation | null,
    x: number, y: number, z: number, w: number,
  ): void;
  uniform1fv(location: WebGLUniformLocation | null, value: Float32List): void;
}

/** Full source for a pass: the shared prelude plus the user's main(). */
export function passSource(fragment: string): string {
  return `${POST_FRAGMENT_PRELUDE}\n${fragment}\n`;
}

/** Distinct pass sources a single renderer will compile. */
const MAX_PASSES = 32;

export class PassCompileLimitError extends Error {
  constructor(limit: number) {
    super(
      `Refusing to compile more than ${limit} distinct shader passes. ` +
        'Interpolating a changing value into shader source is the usual cause; ' +
        'pass it as a uniform instead.',
    );
    this.name = 'PassCompileLimitError';
  }
}

/**
 * Compile a pass and cache it.
 *
 * Keyed by source text, so re-declaring the same pass every frame — which is
 * exactly what a scene does when it passes a template literal — compiles once.
 *
 * Capped, because the failure mode is severe: interpolating a changing value
 * into the source produces a fresh key every frame, and each miss is a full GL
 * program compile rather than a cheap parse. Throwing names the cause, which a
 * silent slowdown would not.
 */
export class PassCache {
  #registry: ResourceRegistry;
  #compiled = new Map<string, CompiledPass>();

  constructor(registry: ResourceRegistry) {
    this.#registry = registry;
  }

  get size(): number {
    return this.#compiled.size;
  }

  /** Drop compiled passes whose programs died with the context. */
  invalidate(): void {
    this.#compiled.clear();
  }

  get(gl: Parameters<ResourceRegistry['add']>[0], fragment: string): CompiledPass {
    const existing = this.#compiled.get(fragment);
    if (existing !== undefined) return existing;

    if (this.#compiled.size >= MAX_PASSES) throw new PassCompileLimitError(MAX_PASSES);

    const programId = this.#registry.add(gl, {
      kind: 'program',
      vertex: POST_VERTEX_SHADER,
      fragment: passSource(fragment),
    });

    const compiled: CompiledPass = { programId, locations: new Map() };
    this.#compiled.set(fragment, compiled);
    return compiled;
  }
}

/** Body of the identity pass, used to present the final target. */
export const COPY_PASS_FRAGMENT_BODY: string = `
void main() {
  fragColor = texture(u_texture, v_uv);
}
`;

/** Full source of the identity pass, for callers that compile it directly. */
export const COPY_PASS_FRAGMENT: string = POST_COPY_FRAGMENT;

/**
 * Set a uniform from a number or a small numeric array.
 *
 * Locations are cached per pass: `getUniformLocation` is a string lookup in the
 * driver, and a pass with a handful of uniforms would otherwise do it on every
 * frame.
 */
export function setUniform(
  gl: PassGl,
  program: WebGLProgram,
  pass: CompiledPass,
  name: string,
  value: number | readonly number[],
): void {
  let location = pass.locations.get(name);
  if (location === undefined) {
    location = gl.getUniformLocation(program, name);
    pass.locations.set(name, location);
  }
  if (location === null) return;

  if (typeof value === 'number') {
    gl.uniform1f(location, value);
    return;
  }

  switch (value.length) {
    case 2:
      gl.uniform2f(location, value[0] as number, value[1] as number);
      break;
    case 3:
      gl.uniform3f(location, value[0] as number, value[1] as number, value[2] as number);
      break;
    case 4:
      gl.uniform4f(
        location,
        value[0] as number, value[1] as number,
        value[2] as number, value[3] as number,
      );
      break;
    default:
      gl.uniform1fv(location, value as number[]);
  }
}

/**
 * Integer uniform, for sampler bindings.
 *
 * Separate from `setUniform` because a sampler must be set with `uniform1i`;
 * passing it as a float silently binds nothing and the pass samples black.
 */
export function setUniformInt(
  gl: PassGl,
  program: WebGLProgram,
  pass: CompiledPass,
  name: string,
  value: number,
): void {
  let location = pass.locations.get(name);
  if (location === undefined) {
    location = gl.getUniformLocation(program, name);
    pass.locations.set(name, location);
  }
  if (location !== null) gl.uniform1i(location, value);
}
