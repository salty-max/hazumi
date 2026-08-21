import { describe, expect, test } from 'bun:test';
import { PingPongTargets, createRenderTarget, FramebufferIncompleteError } from '../src/framebuffer';
import type { TargetGl } from '../src/framebuffer';
import {
  PassCache,
  PassCompileLimitError,
  passSource,
  setUniform,
  setUniformInt,
  type CompiledPass,
} from '../src/post';

function fakeTargetGl(options: { incomplete?: boolean } = {}): TargetGl & {
  created: { textures: number; framebuffers: number; renderbuffers: number };
  deleted: { textures: number; framebuffers: number; renderbuffers: number };
  wraps: number[];
  attachments: number[];
} {
  let next = 1;
  const created = { textures: 0, framebuffers: 0, renderbuffers: 0 };
  const deleted = { textures: 0, framebuffers: 0, renderbuffers: 0 };
  const wraps: number[] = [];
  const attachments: number[] = [];

  return {
    created,
    deleted,
    wraps,
    attachments,
    STENCIL_ATTACHMENT: 36128,
    RENDERBUFFER: 36161,
    STENCIL_INDEX8: 36168,
    createRenderbuffer: () => {
      created.renderbuffers++;
      return { id: next++ } as unknown as WebGLRenderbuffer;
    },
    bindRenderbuffer: () => {},
    renderbufferStorage: () => {},
    framebufferRenderbuffer: (_t: number, attachment: number) => {
      attachments.push(attachment);
    },
    deleteRenderbuffer: () => void deleted.renderbuffers++,
    FRAMEBUFFER: 36160,
    FRAMEBUFFER_COMPLETE: 36053,
    COLOR_ATTACHMENT0: 36064,
    TEXTURE_2D: 3553,
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    LINEAR: 9729,
    CLAMP_TO_EDGE: 33071,
    createTexture: () => {
      created.textures++;
      return { id: next++ } as unknown as WebGLTexture;
    },
    bindTexture: () => {},
    texImage2D: () => {},
    texParameteri: (_t: number, pname: number, param: number) => {
      if (pname === 10242 || pname === 10243) wraps.push(param);
    },
    deleteTexture: () => void deleted.textures++,
    createFramebuffer: () => {
      created.framebuffers++;
      return { id: next++ } as unknown as WebGLFramebuffer;
    },
    bindFramebuffer: () => {},
    framebufferTexture2D: (_t: number, attachment: number) => {
      attachments.push(attachment);
    },
    checkFramebufferStatus: () => (options.incomplete === true ? 36054 : 36053),
    deleteFramebuffer: () => void deleted.framebuffers++,
  };
}

describe('createRenderTarget', () => {
  test('creates a texture and a framebuffer pointing at it', () => {
    const gl = fakeTargetGl();
    const target = createRenderTarget(gl, 320, 240);

    expect(target.width).toBe(320);
    expect(target.height).toBe(240);
    expect(gl.created.textures).toBe(1);
    expect(gl.created.framebuffers).toBe(1);
  });

  test('clamps wrapping on both axes', () => {
    // Without this a blur sampling past the edge wraps to the far side.
    const gl = fakeTargetGl();
    createRenderTarget(gl, 8, 8);
    expect(gl.wraps).toEqual([33071, 33071]);
  });

  test('an incomplete framebuffer throws and leaks nothing', () => {
    const gl = fakeTargetGl({ incomplete: true });
    expect(() => createRenderTarget(gl, 8, 8)).toThrow(FramebufferIncompleteError);
    // Every object created must be released on the failure path.
    expect(gl.deleted.textures).toBe(1);
    expect(gl.deleted.framebuffers).toBe(1);
    expect(gl.deleted.renderbuffers).toBe(1);
  });

  test('attaches a stencil buffer as well as colour', () => {
    // Without it, a path fill inside a shader chain silently becomes its own
    // bounding box: correct on the canvas, wrong through a pass.
    const gl = fakeTargetGl();
    createRenderTarget(gl, 64, 64);
    expect(gl.created.renderbuffers).toBe(1);
    expect(gl.attachments).toContain(36064); // COLOR_ATTACHMENT0
    expect(gl.attachments).toContain(36128); // STENCIL_ATTACHMENT
  });

  test('the error carries the driver status', () => {
    try {
      createRenderTarget(fakeTargetGl({ incomplete: true }), 8, 8);
    } catch (error) {
      expect((error as FramebufferIncompleteError).status).toBe(36054);
    }
  });
});

describe('PingPongTargets', () => {
  test('allocates exactly two targets whatever the chain length', () => {
    const gl = fakeTargetGl();
    const targets = new PingPongTargets(gl, 64, 64);
    expect(targets.width).toBe(64);
    expect(gl.created.textures).toBe(2);
    expect(gl.created.framebuffers).toBe(2);
  });

  test('read and write are never the same target', () => {
    // Sampling the texture you are rendering into is undefined in GL.
    const targets = new PingPongTargets(fakeTargetGl(), 64, 64);
    for (let i = 0; i < 5; i++) {
      expect(targets.read).not.toBe(targets.write);
      targets.swap();
    }
  });

  test('swap exchanges them', () => {
    const targets = new PingPongTargets(fakeTargetGl(), 64, 64);
    const firstRead = targets.read;
    const firstWrite = targets.write;
    targets.swap();
    expect(targets.read).toBe(firstWrite);
    expect(targets.write).toBe(firstRead);
  });

  test('reset returns to the starting orientation', () => {
    const targets = new PingPongTargets(fakeTargetGl(), 64, 64);
    const start = targets.read;
    targets.swap();
    targets.swap();
    targets.swap();
    targets.reset();
    expect(targets.read).toBe(start);
  });

  test('dispose releases every attachment of both', () => {
    const gl = fakeTargetGl();
    const targets = new PingPongTargets(gl, 64, 64);
    targets.dispose(gl);
    expect(gl.deleted.textures).toBe(2);
    expect(gl.deleted.framebuffers).toBe(2);
    expect(gl.deleted.renderbuffers).toBe(2);
  });
});

describe('passSource', () => {
  test('supplies the uniforms a pass expects', () => {
    const source = passSource('void main() { fragColor = vec4(1.0); }');
    expect(source).toContain('#version 300 es');
    expect(source).toContain('uniform sampler2D u_texture');
    expect(source).toContain('uniform vec2 u_resolution');
    expect(source).toContain('uniform float u_time');
    expect(source).toContain('texelSize');
    expect(source).toContain('void main()');
  });

  test('the version directive stays first, as GLSL requires', () => {
    expect(passSource('void main() {}').trimStart().startsWith('#version 300 es')).toBe(true);
  });
});

function harness() {
  const calls: string[] = [];
  const pass: CompiledPass = { programId: 0, locations: new Map() };
  const gl = {
    useProgram: () => {},
    getUniformLocation: (_p: WebGLProgram, name: string) =>
      (name === 'missing' ? null : { name }) as unknown as WebGLUniformLocation,
    uniform1i: (_l: unknown, x: number) => void calls.push(`1i(${x})`),
    uniform1f: (_l: unknown, x: number) => void calls.push(`1f(${x})`),
    uniform2f: (_l: unknown, x: number, y: number) => void calls.push(`2f(${x},${y})`),
    uniform3f: (_l: unknown, x: number, y: number, z: number) => void calls.push(`3f(${x},${y},${z})`),
    uniform4f: (_l: unknown, x: number, y: number, z: number, w: number) =>
      void calls.push(`4f(${x},${y},${z},${w})`),
    uniform1fv: (_l: unknown, v: Float32List) => void calls.push(`1fv(${(v as number[]).length})`),
  };
  return { gl, pass, calls, program: {} as WebGLProgram };
}

describe('setUniform', () => {
  test('dispatches on the value shape', () => {
    const h = harness();
    setUniform(h.gl, h.program, h.pass, 'a', 1);
    setUniform(h.gl, h.program, h.pass, 'b', [1, 2]);
    setUniform(h.gl, h.program, h.pass, 'c', [1, 2, 3]);
    setUniform(h.gl, h.program, h.pass, 'd', [1, 2, 3, 4]);
    setUniform(h.gl, h.program, h.pass, 'e', [1, 2, 3, 4, 5]);
    expect(h.calls).toEqual(['1f(1)', '2f(1,2)', '3f(1,2,3)', '4f(1,2,3,4)', '1fv(5)']);
  });

  test('samplers go through uniform1i', () => {
    // A sampler set as a float silently binds nothing and the pass reads black.
    const h = harness();
    setUniformInt(h.gl, h.program, h.pass, 'u_texture', 0);
    expect(h.calls).toEqual(['1i(0)']);
  });

  test('locations are looked up once and cached', () => {
    const h = harness();
    let lookups = 0;
    const gl = {
      ...h.gl,
      getUniformLocation: (_p: WebGLProgram, name: string) => {
        lookups++;
        return { name } as unknown as WebGLUniformLocation;
      },
    };
    for (let i = 0; i < 10; i++) setUniform(gl, h.program, h.pass, 'a', i);
    expect(lookups).toBe(1);
  });

  test('an absent uniform is skipped rather than throwing', () => {
    // A pass that does not use u_time is normal, not an error.
    const h = harness();
    setUniform(h.gl, h.program, h.pass, 'missing', 1);
    expect(h.calls).toEqual([]);
  });
});

/**
 * The cache keys on source text, so a scene that interpolates a changing
 * value into a shader produces a fresh key every frame. Each miss is a full
 * program compile, so this fails loudly rather than degrading.
 */
function fakeRegistry(): { add: () => number; count: number } {
  const state = { count: 0, add: () => state.count++ };
  return state;
}

describe('PassCache limits', () => {
  test('compiles a repeated source once', () => {
    const registry = fakeRegistry();
    const cache = new PassCache(registry as never);
    for (let i = 0; i < 50; i++) cache.get({} as never, 'void main() {}');
    expect(cache.size).toBe(1);
    expect(registry.count).toBe(1);
  });

  test('refuses an unbounded number of distinct sources', () => {
    const cache = new PassCache(fakeRegistry() as never);
    expect(() => {
      for (let i = 0; i < 100; i++) cache.get({} as never, `void main() { /* ${i} */ }`);
    }).toThrow(PassCompileLimitError);
  });

  test('the error names the likely cause', () => {
    const cache = new PassCache(fakeRegistry() as never);
    try {
      for (let i = 0; i < 100; i++) cache.get({} as never, `p${i}`);
    } catch (error) {
      expect((error as Error).message).toContain('uniform');
    }
  });

  test('invalidate clears compiled passes after a context loss', () => {
    const cache = new PassCache(fakeRegistry() as never);
    cache.get({} as never, 'a');
    cache.invalidate();
    expect(cache.size).toBe(0);
  });
});
