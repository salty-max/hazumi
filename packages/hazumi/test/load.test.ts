import { afterEach, describe, expect, test } from "bun:test";
import type { ImageSource } from "@hazumi/graphics";
import { AssetLoadError, loadFont, loadImage, loadJson, loadText } from "../src/load";

const originalCreateImageBitmap = globalThis.createImageBitmap;

afterEach(() => {
  Object.defineProperty(globalThis, "createImageBitmap", {
    configurable: true,
    value: originalCreateImageBitmap,
  });
});

/**
 * The AssetLoadError a load throws, narrowed.
 *
 * Also asserts the load failed at all: `.catch()` alone would quietly hand back
 * a resolved value and every expectation below it would read as passing.
 */
async function failureOf(promise: Promise<unknown>): Promise<AssetLoadError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AssetLoadError) return error;
    throw error;
  }
  throw new Error("expected the load to fail, but it resolved");
}

/** Injected rather than stubbed onto the global, which nothing has to undo. */
function serving(body: BodyInit | null, init?: ResponseInit) {
  return { fetch: async (): Promise<Response> => new Response(body, init) };
}

describe("loadImage", () => {
  test("fetches and decodes independently of an application", async () => {
    const blob = new Blob(["image"]);
    const decoded = { width: 16, height: 8 } as ImageSource;
    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      value: async (source: Blob): Promise<ImageSource> => {
        expect(source.size).toBe(blob.size);
        return decoded;
      },
    });
    await expect(loadImage("/sprite.png", serving(blob))).resolves.toBe(decoded);
  });

  test("reports the URL and status before attempting to decode", async () => {
    let decoded = false;
    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      value: async (): Promise<ImageSource> => {
        decoded = true;
        return { width: 1, height: 1 } as ImageSource;
      },
    });
    await expect(loadImage("/missing.png", serving(null, { status: 404 }))).rejects.toThrow(
      AssetLoadError,
    );
    expect(decoded).toBe(false);
  });
});

describe("loadText and loadJson", () => {
  test("read a file as text", async () => {
    await expect(loadText("/notes.txt", serving("hello"))).resolves.toBe("hello");
  });

  test("parse JSON", async () => {
    await expect(loadJson<{ frames: number }>("/a.json", serving('{"frames":4}'))).resolves.toEqual(
      {
        frames: 4,
      },
    );
  });

  test("say which file is not valid JSON, rather than throwing a bare SyntaxError", async () => {
    const failure = await failureOf(loadJson("/broken.json", serving("{oops")));
    expect(failure.url).toBe("/broken.json");
    expect(failure.message).toContain("not valid JSON");
  });

  test("carry the status so a caller can tell 404 from 500", async () => {
    const failure = await failureOf(loadJson("/gone.json", serving(null, { status: 503 })));
    expect(failure.status).toBe(503);
  });

  test("a transport failure is not reported as a bad response", async () => {
    const failure = await failureOf(
      loadText("/offline.txt", {
        fetch: async () => {
          throw new TypeError("network down");
        },
      }),
    );
    expect(failure.status).toBeUndefined();
    expect(failure.message).toContain("network down");
  });
});

describe("loadFont", () => {
  test("refuses clearly where the Font Loading API does not exist", async () => {
    // Bun has no FontFace, which is exactly the environment this guards.
    await expect(loadFont("Inter", "/inter.woff2")).rejects.toThrow(AssetLoadError);
  });
});
