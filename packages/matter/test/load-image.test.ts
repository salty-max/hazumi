import { afterEach, describe, expect, test } from "bun:test";
import type { ImageSource } from "@matter/graphics";
import { loadImage } from "../src/load-image";

const originalFetch = globalThis.fetch;
const originalCreateImageBitmap = globalThis.createImageBitmap;

afterEach(() => {
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: originalFetch });
  Object.defineProperty(globalThis, "createImageBitmap", {
    configurable: true,
    value: originalCreateImageBitmap,
  });
});

describe("loadImage", () => {
  test("fetches and decodes independently of an application", async () => {
    const blob = new Blob(["image"]);
    const decoded = { width: 16, height: 8 } as ImageSource;
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: async (): Promise<Response> => new Response(blob),
    });
    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      value: async (source: Blob): Promise<ImageSource> => {
        expect(source.size).toBe(blob.size);
        return decoded;
      },
    });

    await expect(loadImage("/sprite.png")).resolves.toBe(decoded);
  });

  test("reports the URL and status before attempting to decode", async () => {
    let decoded = false;
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: async (): Promise<Response> => new Response(null, { status: 404 }),
    });
    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      value: async (): Promise<ImageSource> => {
        decoded = true;
        return { width: 1, height: 1 } as ImageSource;
      },
    });

    await expect(loadImage("/missing.png")).rejects.toThrow(
      'Could not load image "/missing.png": 404',
    );
    expect(decoded).toBe(false);
  });
});
