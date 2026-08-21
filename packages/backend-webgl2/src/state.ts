/**
 * Mirrored GL state.
 *
 * Batching multiplies the number of potential state transitions, so shadowing
 * state and skipping redundant calls matters more here than it would in a
 * naive renderer. `skipped` is exposed so tests can assert the cache is
 * actually doing something rather than silently passing everything through.
 */

import { Blend } from "@matter/graphics";

export interface BlendCapableGl {
  enable(cap: number): void;
  blendFunc(sfactor: number, dfactor: number): void;
  useProgram(program: WebGLProgram | null): void;
  bindVertexArray(vao: WebGLVertexArrayObject | null): void;
  readonly BLEND: number;
  readonly ONE: number;
  readonly ONE_MINUS_SRC_ALPHA: number;
}

export class GlStateCache {
  #gl: BlendCapableGl;
  #blend: Blend | null = null;
  #program: WebGLProgram | null = null;
  #vao: WebGLVertexArrayObject | null = null;
  #applied = 0;
  #skipped = 0;

  constructor(gl: BlendCapableGl) {
    this.#gl = gl;
    gl.enable(gl.BLEND);
  }

  /** State changes actually issued to the driver. */
  get applied(): number {
    return this.#applied;
  }

  /** State changes elided because the state was already correct. */
  get skipped(): number {
    return this.#skipped;
  }

  /** Forget the mirror. Required after a context loss, or it lies. */
  invalidate(): void {
    this.#blend = null;
    this.#program = null;
    this.#vao = null;
  }

  resetCounters(): void {
    this.#applied = 0;
    this.#skipped = 0;
  }

  setBlend(mode: Blend): void {
    if (this.#blend === mode) {
      this.#skipped++;
      return;
    }
    const gl = this.#gl;
    // Premultiplied source in both cases; only the destination factor differs.
    if (mode === Blend.Add) gl.blendFunc(gl.ONE, gl.ONE);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.#blend = mode;
    this.#applied++;
  }

  useProgram(program: WebGLProgram): void {
    if (this.#program === program) {
      this.#skipped++;
      return;
    }
    this.#gl.useProgram(program);
    this.#program = program;
    this.#applied++;
  }

  bindVertexArray(vao: WebGLVertexArrayObject): void {
    if (this.#vao === vao) {
      this.#skipped++;
      return;
    }
    this.#gl.bindVertexArray(vao);
    this.#vao = vao;
    this.#applied++;
  }
}
