/**
 * Offscreen render targets and the post-processing chain.
 *
 * The scene renders into a texture rather than straight to the canvas, then
 * each pass reads that texture and writes the next one. Two targets are enough
 * for any chain length because passes ping-pong between them — a pass never
 * reads and writes the same texture, which is undefined behaviour in GL.
 *
 * This is what makes user shaders a normal feature rather than an escape
 * hatch: a pass is a fragment shader plus uniforms, and the plumbing is here.
 */

/** A colour texture with a framebuffer pointing at it. */
export interface RenderTarget {
  readonly framebuffer: WebGLFramebuffer;
  readonly texture: WebGLTexture;
  readonly width: number;
  readonly height: number;
}

export interface TargetGl {
  createFramebuffer(): WebGLFramebuffer | null;
  bindFramebuffer(target: number, framebuffer: WebGLFramebuffer | null): void;
  framebufferTexture2D(
    target: number, attachment: number, textarget: number,
    texture: WebGLTexture | null, level: number,
  ): void;
  checkFramebufferStatus(target: number): number;
  deleteFramebuffer(framebuffer: WebGLFramebuffer | null): void;
  createTexture(): WebGLTexture | null;
  bindTexture(target: number, texture: WebGLTexture | null): void;
  texImage2D(
    target: number, level: number, internalformat: number,
    width: number, height: number, border: number,
    format: number, type: number, pixels: ArrayBufferView | null,
  ): void;
  texParameteri(target: number, pname: number, param: number): void;
  deleteTexture(texture: WebGLTexture | null): void;
  readonly FRAMEBUFFER: number;
  readonly FRAMEBUFFER_COMPLETE: number;
  readonly COLOR_ATTACHMENT0: number;
  readonly TEXTURE_2D: number;
  readonly RGBA: number;
  readonly UNSIGNED_BYTE: number;
  readonly TEXTURE_MIN_FILTER: number;
  readonly TEXTURE_MAG_FILTER: number;
  readonly TEXTURE_WRAP_S: number;
  readonly TEXTURE_WRAP_T: number;
  readonly LINEAR: number;
  readonly CLAMP_TO_EDGE: number;
}

export class FramebufferIncompleteError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Framebuffer is incomplete (status 0x${status.toString(16)})`);
    this.name = 'FramebufferIncompleteError';
    this.status = status;
  }
}

export function createRenderTarget(
  gl: TargetGl,
  width: number,
  height: number,
): RenderTarget {
  const texture = gl.createTexture();
  if (texture === null) throw new Error('gl.createTexture() returned null');

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  // Clamped, or a blur reading past the edge wraps to the far side.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const framebuffer = gl.createFramebuffer();
  if (framebuffer === null) throw new Error('gl.createFramebuffer() returned null');

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0,
  );

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    throw new FramebufferIncompleteError(status);
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { framebuffer, texture, width, height };
}

export function deleteRenderTarget(gl: TargetGl, target: RenderTarget): void {
  gl.deleteFramebuffer(target.framebuffer);
  gl.deleteTexture(target.texture);
}

/**
 * Two targets that swap roles between passes.
 *
 * `read` is what the next pass samples, `write` is where it renders. `swap`
 * exchanges them, so an N-pass chain needs two textures rather than N.
 */
export class PingPongTargets {
  #a: RenderTarget;
  #b: RenderTarget;
  #swapped = false;

  constructor(gl: TargetGl, width: number, height: number) {
    this.#a = createRenderTarget(gl, width, height);
    this.#b = createRenderTarget(gl, width, height);
  }

  get read(): RenderTarget {
    return this.#swapped ? this.#b : this.#a;
  }

  get write(): RenderTarget {
    return this.#swapped ? this.#a : this.#b;
  }

  get width(): number {
    return this.#a.width;
  }

  get height(): number {
    return this.#a.height;
  }

  swap(): void {
    this.#swapped = !this.#swapped;
  }

  reset(): void {
    this.#swapped = false;
  }

  dispose(gl: TargetGl): void {
    deleteRenderTarget(gl, this.#a);
    deleteRenderTarget(gl, this.#b);
  }
}
