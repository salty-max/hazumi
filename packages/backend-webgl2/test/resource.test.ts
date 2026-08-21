import { describe, expect, test } from 'bun:test';
import {
  type GlLike,
  ProgramLinkError,
  ResourceRegistry,
  ShaderCompileError,
} from '../src/index';

/**
 * The registry is pure bookkeeping over GL handles, so context-loss recovery is
 * verifiable without a real GL context. A fake also lets us assert on the exact
 * calls made, which a real context cannot.
 */
function fakeGl(options: { failCompile?: boolean; failLink?: boolean } = {}): GlLike & {
  created: { buffers: number; programs: number; shaders: number; textures: number };
  deleted: { buffers: number; programs: number; shaders: number; textures: number };
  unpackAlignment: number;
  filters: number[];
  unpacks: [number, number][];
} {
  let nextId = 1;
  const created = { buffers: 0, programs: 0, shaders: 0, textures: 0 };
  const deleted = { buffers: 0, programs: 0, shaders: 0, textures: 0 };
  const filters: number[] = [];
  const unpacks: [number, number][] = [];
  const state = { unpackAlignment: 4 };

  return {
    created,
    deleted,
    filters,
    unpacks,
    get unpackAlignment() {
      return state.unpackAlignment;
    },
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    TEXTURE_2D: 3553,
    R8: 33321,
    RED: 6403,
    UNSIGNED_BYTE: 5121,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    LINEAR: 9729,
    NEAREST: 9728,
    CLAMP_TO_EDGE: 33071,
    UNPACK_ALIGNMENT: 3317,
    RGBA: 6408,
    createTexture: () => {
      created.textures++;
      return { id: nextId++ } as unknown as WebGLTexture;
    },
    bindTexture: () => {},
    texImage2D: () => {},
    texParameteri: (_t: number, pname: number, param: number) => {
      if (pname === 10241 || pname === 10240) filters.push(param);
    },
    pixelStorei: (pname: number, param: number) => {
      unpacks.push([pname, param]);
      if (pname === 3317) state.unpackAlignment = param;
    },
    deleteTexture: () => void deleted.textures++,
    createBuffer: () => {
      created.buffers++;
      return { id: nextId++ } as unknown as WebGLBuffer;
    },
    bindBuffer: () => {},
    bufferData: () => {},
    deleteBuffer: () => void deleted.buffers++,
    createShader: () => {
      created.shaders++;
      return { id: nextId++ } as unknown as WebGLShader;
    },
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: () => options.failCompile !== true,
    getShaderInfoLog: () => 'syntax error',
    deleteShader: () => void deleted.shaders++,
    createProgram: () => {
      created.programs++;
      return { id: nextId++ } as unknown as WebGLProgram;
    },
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => options.failLink !== true,
    getProgramInfoLog: () => 'link error',
    deleteProgram: () => void deleted.programs++,
  };
}

describe('ResourceRegistry', () => {
  test('realizes registered descriptors', () => {
    const gl = fakeGl();
    const registry = new ResourceRegistry();

    const buf = registry.register({
      kind: 'buffer',
      target: 34962,
      usage: 35044,
      byteLength: 64,
    });
    const prog = registry.register({
      kind: 'program',
      vertex: 'v',
      fragment: 'f',
    });

    registry.realize(gl);

    expect(registry.buffer(buf)).toBeDefined();
    expect(registry.program(prog)).toBeDefined();
    expect(gl.created.buffers).toBe(1);
    expect(gl.created.programs).toBe(1);
  });

  test('accessing an unrealized resource throws rather than returning null', () => {
    const registry = new ResourceRegistry();
    const id = registry.register({
      kind: 'buffer',
      target: 34962,
      usage: 35044,
      byteLength: 4,
    });

    expect(() => registry.buffer(id)).toThrow(/not realized/);
  });

  test('recovers every resource after a simulated context loss', () => {
    const gl = fakeGl();
    const registry = new ResourceRegistry();

    const buf = registry.register({
      kind: 'buffer',
      target: 34962,
      usage: 35044,
      byteLength: 64,
    });
    const prog = registry.register({
      kind: 'program',
      vertex: 'v',
      fragment: 'f',
    });

    registry.realize(gl);
    const firstBuffer = registry.buffer(buf);
    expect(registry.realizations).toBe(1);

    // Context lost: GPU objects are gone, descriptors are not.
    registry.invalidate();
    expect(() => registry.buffer(buf)).toThrow(/not realized/);
    expect(registry.size).toBe(2);

    // Context restored.
    registry.realize(gl);

    expect(registry.realizations).toBe(2);
    expect(registry.buffer(buf)).toBeDefined();
    expect(registry.program(prog)).toBeDefined();
    // Genuinely new GPU objects, not the stale ones.
    expect(registry.buffer(buf)).not.toBe(firstBuffer);
    expect(gl.created.buffers).toBe(2);
    expect(gl.created.programs).toBe(2);
  });

  test('survives repeated loss and restore cycles', () => {
    const gl = fakeGl();
    const registry = new ResourceRegistry();
    registry.register({ kind: 'buffer', target: 34962, usage: 35044, byteLength: 4 });

    for (let i = 0; i < 5; i++) {
      registry.invalidate();
      registry.realize(gl);
    }

    expect(registry.realizations).toBe(5);
    expect(gl.created.buffers).toBe(5);
  });

  test('realizes and releases textures', () => {
    const gl = fakeGl();
    const registry = new ResourceRegistry();
    const id = registry.register({
      kind: 'texture',
      width: 4,
      height: 4,
      data: new Uint8Array(16),
    });

    registry.realize(gl);
    expect(registry.texture(id)).toBeDefined();
    expect(gl.created.textures).toBe(1);

    registry.destroy(gl);
    expect(gl.deleted.textures).toBe(1);
    expect(() => registry.texture(id)).toThrow(/not realized/);
  });

  test('sets unpack alignment for single-channel rows', () => {
    // A one-byte-per-texel atlas has rows that are not 4-byte aligned; leaving
    // the default in place skews every row after the first.
    const gl = fakeGl();
    const registry = new ResourceRegistry();
    registry.register({ kind: 'texture', width: 3, height: 3, data: new Uint8Array(9) });
    registry.realize(gl);
    expect(gl.unpackAlignment).toBe(1);
  });

  test('reports which shader stage failed to compile', () => {
    const registry = new ResourceRegistry();
    registry.register({ kind: 'program', vertex: 'v', fragment: 'f' });

    expect(() => registry.realize(fakeGl({ failCompile: true }))).toThrow(
      ShaderCompileError,
    );
  });

  test('surfaces link failures with the driver log', () => {
    const registry = new ResourceRegistry();
    registry.register({ kind: 'program', vertex: 'v', fragment: 'f' });

    expect(() => registry.realize(fakeGl({ failLink: true }))).toThrow(
      ProgramLinkError,
    );
  });

  test('destroy deletes GPU objects, invalidate does not', () => {
    const gl = fakeGl();
    const registry = new ResourceRegistry();
    registry.register({ kind: 'buffer', target: 34962, usage: 35044, byteLength: 4 });
    registry.register({ kind: 'program', vertex: 'v', fragment: 'f' });
    registry.realize(gl);

    // Context-loss path: the driver already freed them, so nothing is deleted.
    registry.invalidate();
    expect(gl.deleted.buffers).toBe(0);
    expect(gl.deleted.programs).toBe(0);

    // Teardown path on a live context: objects must actually be released.
    registry.realize(gl);
    registry.destroy(gl);
    expect(gl.deleted.buffers).toBe(1);
    expect(gl.deleted.programs).toBe(1);
  });

  test('realizing twice on a live context replaces rather than orphans', () => {
    const gl = fakeGl();
    const registry = new ResourceRegistry();
    registry.register({ kind: 'buffer', target: 34962, usage: 35044, byteLength: 4 });

    registry.realize(gl);
    registry.realize(gl);

    // Two created, and the first was deleted rather than leaked.
    expect(gl.created.buffers).toBe(2);
    expect(gl.deleted.buffers).toBe(1);
  });

  test('destroy on a lost context degrades to invalidate', () => {
    const gl = fakeGl();
    const registry = new ResourceRegistry();
    registry.register({ kind: 'buffer', target: 34962, usage: 35044, byteLength: 4 });
    registry.realize(gl);

    registry.invalidate(); // context lost
    registry.destroy(gl); // teardown after the fact

    expect(gl.deleted.buffers).toBe(0);
    expect(() => registry.buffer(0)).toThrow(/not realized/);
  });

  test('deletes shaders after linking so they are not leaked', () => {
    const gl = fakeGl();
    const registry = new ResourceRegistry();
    registry.register({ kind: 'program', vertex: 'v', fragment: 'f' });
    registry.realize(gl);

    expect(gl.created.shaders).toBe(2);
    expect(gl.deleted.shaders).toBe(2);
  });
});

/**
 * Pixel art is the reason this exists: linear filtering turns a 32x32 sprite
 * to mush the moment it is drawn larger than its source, which in a game is
 * most of the time.
 */
describe('image texture filtering', () => {
  test('smoothing on uses linear', () => {
    const gl = fakeGl();
    const registry = new ResourceRegistry();
    registry.register({
      kind: 'image-texture',
      source: {} as never,
      smoothing: true,
    });
    registry.realize(gl);
    expect(gl.filters).toEqual([9729, 9729]);
  });

  test('smoothing off uses nearest', () => {
    const gl = fakeGl();
    const registry = new ResourceRegistry();
    registry.register({
      kind: 'image-texture',
      source: {} as never,
      smoothing: false,
    });
    registry.realize(gl);
    expect(gl.filters).toEqual([9728, 9728]);
  });

  test('image textures upload unflipped', () => {
    // UNPACK_FLIP_Y_WEBGL is honoured for canvas and <img> but IGNORED for
    // ImageBitmap, so a flip on upload makes a texture's orientation depend on
    // how the caller decoded the image. `loadImage()` returns an ImageBitmap,
    // so relying on it rendered every sprite upside down while the same picture
    // drawn from a canvas came out fine. Rows upload in source order instead,
    // and the renderer's UVs run top-down to match.
    const gl = fakeGl();
    const registry = new ResourceRegistry();
    registry.register({
      kind: 'image-texture',
      source: {} as never,
      smoothing: false,
    });
    registry.realize(gl);
    expect(gl.unpacks).toEqual([]);
  });

  test('the SDF atlas stays linear either way', () => {
    // A distance field is interpolated by design; nearest would make text
    // blocky at exactly the sizes SDF exists to handle.
    const gl = fakeGl();
    const registry = new ResourceRegistry();
    registry.register({ kind: 'texture', width: 4, height: 4, data: new Uint8Array(16) });
    registry.realize(gl);
    expect(gl.filters).toEqual([9729, 9729]);
  });
});
