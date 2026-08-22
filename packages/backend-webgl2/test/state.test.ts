import { describe, expect, test } from "bun:test";
import { Blend } from "@hazumi/graphics";
import { type BlendCapableGl, GlStateCache } from "../src/index";

function fakeGl(): BlendCapableGl & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    BLEND: 3042,
    ONE: 1,
    ONE_MINUS_SRC_ALPHA: 771,
    enable: (cap: number) => void calls.push(`enable(${cap})`),
    blendFunc: (s: number, d: number) => void calls.push(`blendFunc(${s},${d})`),
    useProgram: () => void calls.push("useProgram"),
    bindVertexArray: () => void calls.push("bindVertexArray"),
  };
}

describe("GlStateCache", () => {
  test("enables blending once at construction", () => {
    const gl = fakeGl();
    const cache = new GlStateCache(gl);
    expect(cache.applied).toBe(0);
    expect(gl.calls).toEqual(["enable(3042)"]);
  });

  test("applies a blend change once and elides repeats", () => {
    const gl = fakeGl();
    const cache = new GlStateCache(gl);
    cache.resetCounters();

    cache.setBlend(Blend.Normal);
    cache.setBlend(Blend.Normal);
    cache.setBlend(Blend.Normal);

    expect(cache.applied).toBe(1);
    expect(cache.skipped).toBe(2);
    expect(gl.calls.filter((c) => c.startsWith("blendFunc"))).toHaveLength(1);
  });

  test("uses different blend functions per mode", () => {
    const gl = fakeGl();
    const cache = new GlStateCache(gl);
    cache.setBlend(Blend.Normal);
    cache.setBlend(Blend.Add);

    // Additive keeps the destination; normal attenuates it by source alpha.
    expect(gl.calls).toContain("blendFunc(1,771)");
    expect(gl.calls).toContain("blendFunc(1,1)");
  });

  test("re-applies after toggling back and forth", () => {
    const gl = fakeGl();
    const cache = new GlStateCache(gl);
    cache.resetCounters();
    cache.setBlend(Blend.Normal);
    cache.setBlend(Blend.Add);
    cache.setBlend(Blend.Normal);
    expect(cache.applied).toBe(3);
    expect(cache.skipped).toBe(0);
  });

  test("elides redundant program and VAO binds", () => {
    const gl = fakeGl();
    const cache = new GlStateCache(gl);
    cache.resetCounters();

    const program = {} as WebGLProgram;
    const vao = {} as WebGLVertexArrayObject;
    cache.useProgram(program);
    cache.useProgram(program);
    cache.bindVertexArray(vao);
    cache.bindVertexArray(vao);

    expect(cache.applied).toBe(2);
    expect(cache.skipped).toBe(2);
  });

  /**
   * After a context loss every GL object is gone, so a mirror that still
   * claims a program is bound would skip the rebind and draw nothing.
   */
  test("invalidate forces the next set to be applied", () => {
    const gl = fakeGl();
    const cache = new GlStateCache(gl);
    cache.setBlend(Blend.Normal);
    cache.resetCounters();

    cache.invalidate();
    cache.setBlend(Blend.Normal);

    expect(cache.applied).toBe(1);
    expect(cache.skipped).toBe(0);
  });
});
